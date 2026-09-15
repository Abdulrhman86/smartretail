import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  ShoppingBag,
  Truck,
} from "lucide-react";

import { ApiError, del, get, put } from "../api/client";
import ProductCard from "../components/ProductCard";
import { StarRating, buttonClasses, inputClass, labelClass } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import useDocumentTitle from "../hooks/useDocumentTitle";
import { formatDate, formatPrice } from "../lib/format";
import { fallbackImageFor, handleImageError } from "../lib/images";

const MAX_PER_ORDER = 10;
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

/** Apparel sizes in S/M/L order, numeric sizes ascending, anything else alphabetically. */
function sortSizes(sizes) {
  const rank = (size) => {
    const idx = SIZE_ORDER.indexOf(size.toUpperCase());
    if (idx !== -1) return [0, idx, ""];
    const num = parseFloat(size);
    return Number.isNaN(num) ? [2, 0, size] : [1, num, ""];
  };
  return [...sizes].sort((a, b) => {
    const [ga, va, sa] = rank(a);
    const [gb, vb, sb] = rank(b);
    return ga - gb || va - vb || sa.localeCompare(sb);
  });
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { cartItems, addItem } = useCart();
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);
  const [quantity, setQuantity] = useState(1);

  const [isAdding, setIsAdding] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);

  const [shippingOpen, setShippingOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useDocumentTitle(product?.name ?? (notFound ? "Product not found" : null));

  // Fetch product detail by ID
  const fetchProduct = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setLoadError(null);
    setActiveImageIndex(0);
    setQuantity(1);
    setRelatedProducts([]);

    try {
      const data = await get(`/products/${id}`);
      setProduct(data);

      // Pre-select the first in-stock variant
      const variants = data.product_variants || [];
      const available = variants.find((v) => v.stock_quantity > 0) || variants[0];
      setSelectedSize(available?.size || null);
      setSelectedColor(available?.color || null);

      if (data.category_id) {
        get(`/products?category_id=${data.category_id}&limit=5`)
          .then((related) => setRelatedProducts(related.filter((p) => p.id !== data.id).slice(0, 4)))
          .catch(() => setRelatedProducts([]));
      }
    } catch (err) {
      setProduct(null);
      if (err instanceof ApiError && (err.status === 404 || err.status === 422)) setNotFound(true);
      else setLoadError(err.message || "Failed to load product.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  const variants = useMemo(() => product?.product_variants || [], [product]);

  const availableSizes = useMemo(() => sortSizes([...new Set(variants.map((v) => v.size).filter(Boolean))]), [variants]);
  const availableColors = useMemo(() => [...new Set(variants.map((v) => v.color).filter(Boolean))], [variants]);

  const findVariant = useCallback(
    (size, color) =>
      variants.find(
        (v) => (availableSizes.length === 0 || v.size === size) && (availableColors.length === 0 || v.color === color),
      ),
    [variants, availableSizes, availableColors],
  );

  // null when the chosen size/color combination doesn't exist
  const selectedVariant = useMemo(() => {
    if (!variants.length) return null;
    return findVariant(selectedSize, selectedColor) ?? null;
  }, [variants, findVariant, selectedSize, selectedColor]);

  // Selecting one option keeps the other if that combination exists; otherwise it
  // switches to the best available match (in stock first) instead of silently
  // falling back to an unrelated variant.
  const selectSize = (size) => {
    setSelectedSize(size);
    if (availableColors.length && !findVariant(size, selectedColor)) {
      const candidates = variants.filter((v) => v.size === size);
      const best = candidates.find((v) => v.stock_quantity > 0) || candidates[0];
      setSelectedColor(best?.color ?? null);
    }
  };

  const selectColor = (color) => {
    setSelectedColor(color);
    if (availableSizes.length && !findVariant(selectedSize, color)) {
      const candidates = variants.filter((v) => v.color === color);
      const best = candidates.find((v) => v.stock_quantity > 0) || candidates[0];
      setSelectedSize(best?.size ?? null);
    }
  };

  const inCartQuantity = useMemo(
    () => cartItems.filter((item) => item.variant_id === selectedVariant?.id).reduce((sum, item) => sum + item.quantity, 0),
    [cartItems, selectedVariant],
  );

  const currentPrice = selectedVariant?.price_override ?? product?.base_price ?? 0;
  const stockQuantity = selectedVariant?.stock_quantity ?? 0;
  const purchasable = Math.max(0, Math.min(MAX_PER_ORDER, stockQuantity - inCartQuantity));
  const isOutOfStock = !selectedVariant || stockQuantity <= 0;

  // Clamp quantity when the selected variant (and its stock) changes
  useEffect(() => {
    setQuantity((q) => Math.max(1, Math.min(q, purchasable || 1)));
  }, [purchasable]);

  const galleryImages = useMemo(() => {
    if (!product) return [];
    const images = (product.product_images || []).map((img) => img.url).filter(Boolean);
    if (selectedVariant?.image_url && !images.includes(selectedVariant.image_url)) {
      images.unshift(selectedVariant.image_url);
    }
    return images.length ? images : [fallbackImageFor(product.id)];
  }, [product, selectedVariant]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [selectedVariant?.image_url]);

  const handleAddToCart = async () => {
    if (!isAuthenticated) {
      navigate("/login", { state: { from: location, notice: "Please sign in to add items to your bag." } });
      return;
    }
    if (!selectedVariant?.id || isOutOfStock || purchasable <= 0) return;

    setIsAdding(true);
    try {
      await addItem(selectedVariant.id, quantity);
      setAddSuccess(true);
      showToast({ title: `${product.name} added to your bag.`, tone: "success", action: { label: "View Bag", to: "/cart" } });
      setTimeout(() => setAddSuccess(false), 2500);
      setQuantity(1);
    } catch (err) {
      showToast({ title: err.message || "Failed to add item to bag. Please try again.", tone: "error" });
    } finally {
      setIsAdding(false);
    }
  };

  const hasDiscountedPrice = selectedVariant?.price_override != null && product && product.base_price > selectedVariant.price_override;

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-16">
      {loading ? (
        <div className="animate-pulse space-y-8">
          <div className="h-4 w-48 bg-muted rounded" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-7 space-y-4">
              <div className="aspect-[4/5] w-full bg-muted rounded-lg" />
              <div className="flex gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 w-20 bg-muted rounded-md" />
                ))}
              </div>
            </div>
            <div className="lg:col-span-5 space-y-6">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-10 w-3/4 bg-muted rounded" />
              <div className="h-8 w-32 bg-muted rounded" />
              <div className="h-24 w-full bg-muted rounded" />
              <div className="h-12 w-full bg-muted rounded-md" />
            </div>
          </div>
        </div>
      ) : loadError ? (
        <div className="py-24 text-center max-w-lg mx-auto">
          <h1 className="font-display text-4xl font-normal tracking-tight text-foreground">Something Went Wrong</h1>
          <p className="mt-4 text-sm text-muted-foreground">{loadError}</p>
          <button type="button" onClick={fetchProduct} className={`mt-8 ${buttonClasses.primary}`}>
            Try Again
          </button>
        </div>
      ) : notFound || !product ? (
        <div className="py-24 text-center max-w-lg mx-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">404 Notice</p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl font-normal tracking-tight text-foreground">Product Not Found</h1>
          <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
            We couldn&apos;t find the product you were looking for. It may have been retired or moved to another section of our catalog.
          </p>
          <Link
            to="/products"
            className="mt-8 inline-flex items-center justify-center rounded-md bg-brand px-8 py-3 text-sm font-semibold text-brand-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            Return to Shop
          </Link>
        </div>
      ) : (
        <>
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-foreground">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <Link to="/products" className="transition-colors hover:text-foreground">Shop</Link>
            {product.category && (
              <>
                <ChevronRight className="h-3 w-3" />
                <Link to={`/products?category=${product.category.slug}`} className="transition-colors hover:text-foreground">
                  {product.category.name}
                </Link>
              </>
            )}
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium truncate max-w-xs">{product.name}</span>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
            {/* Left Column: Image Gallery */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-muted border border-border/50">
                <img
                  src={galleryImages[activeImageIndex] || galleryImages[0]}
                  alt={product.name}
                  onError={handleImageError(product.id)}
                  className="h-full w-full object-cover transition-all duration-500"
                />
                {product.brand && (
                  <span className="absolute top-4 left-4 rounded bg-background/90 backdrop-blur-xs px-2.5 py-1 text-xs font-semibold tracking-wider uppercase text-foreground">
                    {product.brand}
                  </span>
                )}
              </div>

              {galleryImages.length > 1 && (
                <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
                  {galleryImages.map((imgUrl, idx) => (
                    <button
                      key={imgUrl}
                      type="button"
                      onClick={() => setActiveImageIndex(idx)}
                      aria-label={`Show image ${idx + 1}`}
                      className={`relative aspect-square w-20 shrink-0 overflow-hidden rounded-md border-2 transition-all cursor-pointer ${
                        activeImageIndex === idx ? "border-brand opacity-100 ring-2 ring-brand/20" : "border-border/70 opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img src={imgUrl} alt="" onError={handleImageError(`${product.id}-${idx}`)} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: Product Information & Purchase Controls */}
            <div className="lg:col-span-5 flex flex-col">
              <div>
                {product.brand && (
                  <p className="text-xs font-semibold tracking-[0.15em] uppercase text-muted-foreground mb-1">{product.brand}</p>
                )}
                <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight text-foreground">{product.name}</h1>
                {product.rating_count > 0 && (
                  <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                    <StarRating value={product.rating_average} />
                    <span>
                      {product.rating_average.toFixed(1)} · {product.rating_count} {product.rating_count === 1 ? "review" : "reviews"}
                    </span>
                  </a>
                )}
              </div>

              <div className="mt-4 flex items-baseline gap-3">
                <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">{formatPrice(currentPrice)}</span>
                {hasDiscountedPrice && <span className="text-sm text-muted-foreground line-through">{formatPrice(product.base_price)}</span>}
              </div>

              {/* Real-time Stock Indicator */}
              <div className="mt-4 flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isOutOfStock ? "bg-rose-500" : stockQuantity <= 5 ? "bg-amber-500" : "bg-emerald-600"
                  }`}
                />
                <span
                  className={`text-xs font-semibold ${
                    isOutOfStock ? "text-rose-600" : stockQuantity <= 5 ? "text-amber-700" : "text-emerald-700"
                  }`}
                >
                  {!selectedVariant
                    ? "This combination is unavailable"
                    : isOutOfStock
                    ? "Out of Stock"
                    : stockQuantity <= 5
                    ? `Only ${stockQuantity} left in stock — order soon`
                    : "In Stock & Ready to Ship"}
                </span>
              </div>

              <hr className="my-6 border-border" />

              {availableSizes.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold tracking-wider uppercase text-foreground">Size</span>
                    {selectedSize && <span className="text-xs text-muted-foreground font-medium">Selected: {selectedSize}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availableSizes.map((size) => {
                      const isSelected = selectedSize === size;
                      const sizeStock = variants.filter((v) => v.size === size).reduce((sum, v) => sum + v.stock_quantity, 0);
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => selectSize(size)}
                          aria-pressed={isSelected}
                          className={`min-w-[48px] px-3.5 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-brand text-brand-foreground shadow-sm"
                              : sizeStock === 0
                              ? "bg-muted/50 border border-border/50 text-muted-foreground line-through opacity-60"
                              : "bg-background border border-border text-foreground hover:bg-muted"
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {availableColors.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold tracking-wider uppercase text-foreground">Color</span>
                    {selectedColor && <span className="text-xs text-muted-foreground font-medium">{selectedColor}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {availableColors.map((color) => {
                      const isSelected = selectedColor === color;
                      const combo = availableSizes.length ? findVariant(selectedSize, color) : findVariant(null, color);
                      const unavailable = !combo || combo.stock_quantity === 0;
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => selectColor(color)}
                          aria-pressed={isSelected}
                          className={`px-4 py-2 rounded-full text-xs font-medium border transition-all cursor-pointer flex items-center gap-2 ${
                            isSelected
                              ? "border-brand bg-brand text-brand-foreground shadow-sm"
                              : unavailable
                              ? "border-border/50 bg-muted/50 text-muted-foreground line-through opacity-60"
                              : "border-border bg-background text-foreground hover:bg-muted"
                          }`}
                        >
                          <span>{color}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quantity Selector & Add to Cart Controls */}
              <div className="mt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <div className="inline-flex items-center rounded-md border border-border bg-background p-1 self-start sm:self-auto">
                  <button
                    type="button"
                    disabled={quantity <= 1 || isOutOfStock}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="p-2 text-foreground transition-colors hover:text-muted-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center text-sm font-semibold text-foreground" aria-live="polite">{quantity}</span>
                  <button
                    type="button"
                    disabled={quantity >= purchasable || isOutOfStock}
                    onClick={() => setQuantity((q) => Math.min(purchasable, q + 1))}
                    className="p-2 text-foreground transition-colors hover:text-muted-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={isAdding || isOutOfStock || (isAuthenticated && purchasable <= 0)}
                  className={`flex-1 rounded-md py-3.5 px-8 text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:cursor-not-allowed ${
                    isOutOfStock || (isAuthenticated && purchasable <= 0)
                      ? "bg-muted text-muted-foreground opacity-60"
                      : addSuccess
                      ? "bg-emerald-700 text-white"
                      : "bg-brand text-brand-foreground hover:bg-primary"
                  }`}
                >
                  {isAdding ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Adding to Bag...</span>
                    </>
                  ) : addSuccess ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Added to Bag</span>
                    </>
                  ) : isOutOfStock ? (
                    <span>{selectedVariant ? "Sold Out" : "Unavailable"}</span>
                  ) : isAuthenticated && purchasable <= 0 ? (
                    <span>Maximum quantity in your bag</span>
                  ) : (
                    <>
                      <ShoppingBag className="h-4 w-4" />
                      <span>Add to Cart — {formatPrice(currentPrice * quantity)}</span>
                    </>
                  )}
                </button>
              </div>
              {inCartQuantity > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  You have {inCartQuantity} of this item in your{" "}
                  <Link to="/cart" className="font-medium text-foreground underline underline-offset-4">bag</Link>.
                </p>
              )}

              <div className="mt-8 grid grid-cols-2 gap-4 border-t border-border pt-6">
                <div className="flex items-start gap-2.5">
                  <Truck className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.5} />
                  <p className="text-xs text-muted-foreground">Free standard shipping on orders over $50.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <RotateCcw className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.5} />
                  <p className="text-xs text-muted-foreground">Complimentary 30-day hassle-free returns.</p>
                </div>
              </div>

              <div className="mt-8 border-t border-border">
                <div className="py-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-2">Description</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {product.description ||
                      "Carefully crafted from sustainable, high-performance materials. Designed with clean architectural lines for enduring style and versatile everyday utility."}
                  </p>
                  {selectedVariant?.sku && <p className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground/70">SKU {selectedVariant.sku}</p>}
                </div>

                <div className="border-t border-border/60 py-3">
                  <button
                    type="button"
                    onClick={() => setShippingOpen(!shippingOpen)}
                    aria-expanded={shippingOpen}
                    className="flex w-full items-center justify-between py-1 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:text-muted-foreground cursor-pointer"
                  >
                    <span>Shipping &amp; Delivery</span>
                    {shippingOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {shippingOpen && (
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      Standard shipping arrives in 3–5 business days and is free on orders over $50 ($5.99 otherwise). Express delivery arrives the next business day for $14.99.
                    </p>
                  )}
                </div>

                <div className="border-t border-border/60 py-3">
                  <button
                    type="button"
                    onClick={() => setDetailsOpen(!detailsOpen)}
                    aria-expanded={detailsOpen}
                    className="flex w-full items-center justify-between py-1 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:text-muted-foreground cursor-pointer"
                  >
                    <span>Sustainability &amp; Care</span>
                    {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {detailsOpen && (
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      Responsibly sourced in certified ethical workshops. Spot clean with mild soap or gentle wash cold. Hang dry in shade to preserve textile integrity.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <ReviewsSection productId={product.id} onChange={fetchProductRating(setProduct, product.id)} />

          {relatedProducts.length > 0 && (
            <section className="mt-24 sm:mt-32 border-t border-border pt-16">
              <div className="mb-10 text-center sm:text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Complete The Look</p>
                <h2 className="mt-1 font-display text-3xl sm:text-4xl font-normal tracking-tight text-foreground">You Might Also Like</h2>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4">
                {relatedProducts.map((rel) => (
                  <ProductCard key={rel.id} product={rel} showQuickAdd={false} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

/** After a review changes, update the rating summary shown next to the title. */
function fetchProductRating(setProduct, productId) {
  return (summary) =>
    setProduct((p) => (p && p.id === productId ? { ...p, rating_average: summary.rating_average, rating_count: summary.rating_count } : p));
}

function ReviewsSection({ productId, onChange }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const { showToast } = useToast();

  const [data, setData] = useState({ reviews: [], rating_count: 0, rating_average: null });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ rating: 0, title: "", body: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await get(`/products/${productId}/reviews`);
      setData(result);
      return result;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    setLoading(true);
    setEditing(false);
    load();
  }, [load]);

  const myReview = data.reviews.find((r) => r.user_id === user?.id);

  const startEditing = () => {
    setForm({ rating: myReview?.rating ?? 0, title: myReview?.title ?? "", body: myReview?.body ?? "" });
    setFormError("");
    setEditing(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.rating) {
      setFormError("Please choose a star rating.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await put(`/products/${productId}/reviews/me`, { rating: form.rating, title: form.title || null, body: form.body || null });
      const result = await load();
      if (result) onChange(result);
      setEditing(false);
      showToast({ title: "Thanks — your review has been saved.", tone: "success" });
    } catch (err) {
      setFormError(err.message || "Could not save your review.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await del(`/products/${productId}/reviews/me`);
      const result = await load();
      if (result) onChange(result);
      setEditing(false);
    } catch (err) {
      showToast({ title: err.message || "Could not delete your review.", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="reviews" className="mt-24 scroll-mt-24 border-t border-border pt-16">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Customer Reviews</p>
          <h2 className="mt-1 font-display text-3xl sm:text-4xl font-normal tracking-tight text-foreground">What People Say</h2>
          <div className="mt-6 flex items-center gap-3">
            <span className="font-display text-5xl text-foreground lining-nums">{data.rating_average ? data.rating_average.toFixed(1) : "—"}</span>
            <div>
              <StarRating value={data.rating_average ?? 0} />
              <p className="mt-1 text-xs text-muted-foreground">
                Based on {data.rating_count} {data.rating_count === 1 ? "review" : "reviews"}
              </p>
            </div>
          </div>
          <div className="mt-6">
            {isAuthenticated ? (
              !editing && (
                <button type="button" onClick={startEditing} className={buttonClasses.secondary}>
                  {myReview ? "Edit Your Review" : "Write a Review"}
                </button>
              )
            ) : (
              <Link to="/login" state={{ from: { ...location, hash: "#reviews" } }} className={buttonClasses.secondary}>
                Sign in to write a review
              </Link>
            )}
          </div>
        </div>

        <div className="lg:col-span-8">
          {editing && (
            <form onSubmit={submit} className="mb-10 rounded-lg border border-border bg-card p-6">
              <h3 className="font-display text-2xl text-foreground">{myReview ? "Edit your review" : "Write a review"}</h3>
              <div className="mt-4">
                <span className={labelClass}>Rating</span>
                <StarRating value={form.rating} size="h-6 w-6" onChange={(rating) => setForm((f) => ({ ...f, rating }))} />
              </div>
              <div className="mt-4">
                <label htmlFor="review-title" className={labelClass}>Title <span className="lowercase font-normal">(optional)</span></label>
                <input id="review-title" maxLength={120} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputClass} />
              </div>
              <div className="mt-4">
                <label htmlFor="review-body" className={labelClass}>Review <span className="lowercase font-normal">(optional)</span></label>
                <textarea
                  id="review-body"
                  rows={4}
                  maxLength={4000}
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  className={`${inputClass} resize-y`}
                />
              </div>
              {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="submit" disabled={saving} className={buttonClasses.primary}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Review
                </button>
                <button type="button" onClick={() => setEditing(false)} className={buttonClasses.ghost}>Cancel</button>
                {myReview && (
                  <button type="button" onClick={remove} disabled={saving} className={`${buttonClasses.ghost} ml-auto text-destructive hover:text-destructive`}>
                    Delete review
                  </button>
                )}
              </div>
            </form>
          )}

          {loading ? (
            <div className="space-y-6">
              {[0, 1].map((i) => (
                <div key={i} className="animate-pulse space-y-2 border-b border-border pb-6">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-4 w-1/2 rounded bg-muted" />
                  <div className="h-12 w-full rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : data.reviews.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
              No reviews yet. Be the first to share your thoughts.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.reviews.map((review) => (
                <li key={review.id} className="py-6 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StarRating value={review.rating} />
                    <span className="text-xs text-muted-foreground">{formatDate(review.created_at)}</span>
                  </div>
                  {review.title && <h4 className="mt-2 text-sm font-semibold text-foreground">{review.title}</h4>}
                  {review.body && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{review.body}</p>}
                  <p className="mt-2 text-xs font-medium text-foreground/70">
                    {review.author_name}
                    {review.user_id === user?.id && <span className="ml-2 text-muted-foreground">(you)</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
