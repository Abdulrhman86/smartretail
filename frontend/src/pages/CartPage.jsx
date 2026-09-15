import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Loader2, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import useDocumentTitle from "../hooks/useDocumentTitle";
import { formatPrice, variantLabel } from "../lib/format";
import { fallbackImageFor, handleImageError } from "../lib/images";

const FREE_SHIPPING_THRESHOLD = 50;
const MAX_PER_LINE = 10;

export default function CartPage() {
  useDocumentTitle("Shopping Bag");

  const { cartItems, cartTotal, itemCount, loading, error, fetchCart, updateItem, removeItem } = useCart();
  const { showToast } = useToast();

  // Track items currently being updated/removed for loading spinners
  const [updatingItems, setUpdatingItems] = useState(new Set());
  const [removingItems, setRemovingItems] = useState(new Set());

  const withPending = (setter, itemId, fn) => async () => {
    setter((prev) => new Set(prev).add(itemId));
    try {
      await fn();
    } catch (err) {
      showToast({ title: err.message || "Could not update your bag.", tone: "error" });
    } finally {
      setter((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const problems = cartItems.filter((item) => {
    const variant = item.product_variants;
    return !variant?.products?.is_active || item.quantity > (variant?.stock_quantity ?? 0);
  });

  const remainingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - cartTotal);
  const isEmpty = !loading && cartItems.length === 0;

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-16">
      {/* Page Title */}
      <div className="mb-10 sm:mb-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Your Bag</p>
        <h1 className="mt-1 font-display text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight text-foreground">
          Shopping Cart
          {!loading && cartItems.length > 0 && (
            <span className="text-muted-foreground font-body text-lg sm:text-xl ml-3">
              ({itemCount} {itemCount === 1 ? "item" : "items"})
            </span>
          )}
        </h1>
      </div>

      {loading ? (
        <div className="animate-pulse">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
            <div className="lg:col-span-7 space-y-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-4 sm:gap-6 pb-6 border-b border-border">
                  <div className="h-20 w-20 sm:h-24 sm:w-24 bg-muted rounded" />
                  <div className="flex-1 space-y-3">
                    <div className="h-4 w-48 bg-muted rounded" />
                    <div className="h-3 w-24 bg-muted rounded" />
                    <div className="h-4 w-20 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
            <div className="lg:col-span-5">
              <div className="bg-card border border-border rounded-lg p-6 space-y-4">
                <div className="h-5 w-32 bg-muted rounded" />
                <div className="h-4 w-full bg-muted rounded" />
                <div className="h-12 w-full bg-muted rounded" />
              </div>
            </div>
          </div>
        </div>
      ) : error && cartItems.length === 0 ? (
        <div className="py-20 sm:py-28 text-center max-w-lg mx-auto">
          <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-10 w-10 text-destructive" strokeWidth={1.25} />
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-normal tracking-tight text-foreground">Something Went Wrong</h2>
          <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
            We couldn&apos;t load your shopping bag. Please check your connection and try again.
          </p>
          <button
            type="button"
            onClick={fetchCart}
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-md bg-brand px-8 py-3.5 text-sm font-semibold text-brand-foreground shadow-sm transition-opacity hover:opacity-90 cursor-pointer"
          >
            Try Again
          </button>
        </div>
      ) : isEmpty ? (
        <div className="py-20 sm:py-28 text-center max-w-lg mx-auto">
          <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-muted/60">
            <ShoppingBag className="h-10 w-10 text-muted-foreground" strokeWidth={1} />
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-normal tracking-tight text-foreground">Your Bag is Empty</h2>
          <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
            Looks like you haven&apos;t added anything to your shopping bag yet. Explore our curated collections and find something you love.
          </p>
          <Link
            to="/products"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-md bg-brand px-8 py-3.5 text-sm font-semibold text-brand-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            Continue Shopping
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          {/* ── LEFT: Line Items ───────────────────────────────── */}
          <div className="lg:col-span-7">
            {problems.length > 0 && (
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-600/20 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Some items are no longer available in the quantity you selected. Update or remove them to continue to checkout.</span>
              </div>
            )}

            <ul className="divide-y divide-border">
              {cartItems.map((item) => {
                const variant = item.product_variants;
                const product = variant?.products;
                const name = product?.name || "Product";
                const label = variantLabel(variant);
                const stock = variant?.stock_quantity ?? 0;
                const unavailable = !product?.is_active;
                const overStock = !unavailable && item.quantity > stock;
                const isUpdating = updatingItems.has(item.id);
                const isRemoving = removingItems.has(item.id);
                const imageKey = product?.id || item.id;

                return (
                  <li key={item.id} className={`flex gap-4 sm:gap-6 py-6 transition-opacity ${isRemoving ? "opacity-40 pointer-events-none" : ""}`}>
                    <Link to={product?.id ? `/products/${product.id}` : "/products"} className="shrink-0">
                      <div className="h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-md bg-muted border border-border/50">
                        <img
                          src={variant?.image_url || product?.image_url || fallbackImageFor(imageKey)}
                          alt={name}
                          onError={handleImageError(imageKey)}
                          className={`h-full w-full object-cover ${unavailable ? "grayscale" : ""}`}
                          loading="lazy"
                        />
                      </div>
                    </Link>

                    <div className="flex flex-1 flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <Link
                          to={product?.id ? `/products/${product.id}` : "/products"}
                          className="font-display text-base sm:text-lg font-medium tracking-tight text-foreground transition-colors hover:text-muted-foreground line-clamp-2"
                        >
                          {name}
                        </Link>
                        {label && <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>}
                        <p className="mt-1.5 text-sm font-semibold text-foreground sm:hidden">{formatPrice(item.unit_price)}</p>
                        {unavailable && <p className="mt-1.5 text-xs font-semibold text-destructive">No longer available</p>}
                        {overStock && (
                          <p className="mt-1.5 text-xs font-semibold text-amber-700">
                            {stock === 0 ? "Out of stock" : `Only ${stock} left — reduce quantity`}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-4 sm:gap-6 flex-wrap sm:flex-nowrap">
                        <span className="hidden sm:block text-sm font-semibold text-foreground min-w-[70px] text-right">{formatPrice(item.unit_price)}</span>

                        <div className="inline-flex items-center rounded-md border border-border bg-background">
                          <button
                            type="button"
                            disabled={item.quantity <= 1 || isUpdating || unavailable}
                            onClick={withPending(setUpdatingItems, item.id, () => updateItem(item.id, item.quantity - 1))}
                            className="p-1.5 sm:p-2 text-foreground transition-colors hover:text-muted-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-8 text-center text-xs sm:text-sm font-semibold text-foreground tabular-nums">
                            {isUpdating ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={item.quantity >= Math.min(MAX_PER_LINE, stock) || isUpdating || unavailable}
                            onClick={withPending(setUpdatingItems, item.id, () => updateItem(item.id, item.quantity + 1))}
                            className="p-1.5 sm:p-2 text-foreground transition-colors hover:text-muted-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <span className="hidden sm:block text-sm font-semibold text-foreground min-w-[80px] text-right tabular-nums">
                          {formatPrice(item.line_total)}
                        </span>

                        <button
                          type="button"
                          onClick={withPending(setRemovingItems, item.id, () => removeItem(item.id))}
                          disabled={isRemoving}
                          className="p-1.5 text-muted-foreground transition-colors hover:text-destructive cursor-pointer disabled:opacity-40"
                          aria-label={`Remove ${name}`}
                        >
                          {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" strokeWidth={1.5} />}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 border-t border-border pt-6">
              <Link
                to="/products"
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Continue Shopping
              </Link>
            </div>
          </div>

          {/* ── RIGHT: Order Summary ───────────────────────────── */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24 rounded-lg border border-border bg-card p-6 sm:p-8">
              <h2 className="font-display text-xl sm:text-2xl font-medium tracking-tight text-foreground">Order Summary</h2>

              {/* Free shipping progress */}
              <div className="mt-5">
                <p className="text-xs text-muted-foreground">
                  {remainingForFreeShipping > 0 ? (
                    <>
                      Add <span className="font-semibold text-foreground">{formatPrice(remainingForFreeShipping)}</span> more for free standard shipping.
                    </>
                  ) : (
                    <span className="font-semibold text-emerald-700">Your order qualifies for free standard shipping.</span>
                  )}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-500"
                    style={{ width: `${Math.min(100, (cartTotal / FREE_SHIPPING_THRESHOLD) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})
                  </span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">{formatPrice(cartTotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Shipping</span>
                  <span className="text-xs text-muted-foreground italic">
                    {remainingForFreeShipping > 0 ? "From KD 1.750 at checkout" : "Free (standard)"}
                  </span>
                </div>
                <hr className="border-border" />
                <div className="flex items-center justify-between pt-2">
                  <span className="text-base font-semibold text-foreground">Estimated Total</span>
                  <span className="text-lg sm:text-xl font-semibold text-foreground tabular-nums">{formatPrice(cartTotal)}</span>
                </div>
              </div>

              {problems.length > 0 ? (
                <button
                  type="button"
                  disabled
                  className="mt-8 flex w-full items-center justify-center gap-2.5 rounded-md bg-muted py-3.5 px-8 text-sm font-semibold text-muted-foreground cursor-not-allowed"
                >
                  Resolve cart issues to continue
                </button>
              ) : (
                <Link
                  to="/checkout"
                  className="mt-8 flex w-full items-center justify-center gap-2.5 rounded-md bg-brand py-3.5 px-8 text-sm font-semibold text-brand-foreground shadow-sm transition-opacity hover:opacity-90"
                >
                  Proceed to Checkout
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}

              <p className="mt-4 text-center text-xs text-muted-foreground leading-relaxed">
                Discount codes and shipping options are applied at checkout.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
