import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, Loader2, ShoppingBag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { formatPrice } from '../lib/format';
import { fallbackImageFor, handleImageError } from '../lib/images';

/**
 * Catalog card used on the home page, shop grid and "you might also like".
 * Expects a ProductListItem from GET /products (image_url, min_price,
 * total_stock, variant_count, default_variant_id).
 *
 * Quick add only applies to single-variant products; products with size/color
 * options link to the detail page so the shopper picks a variant.
 */
export default function ProductCard({ product, showQuickAdd = true }) {
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [status, setStatus] = useState('idle'); // idle | adding | added

  const soldOut = product.total_stock === 0;
  const needsOptions = product.variant_count > 1;
  const hasRange = product.max_price > product.min_price;

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (needsOptions) {
      navigate(`/products/${product.id}`);
      return;
    }
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location, notice: 'Please sign in to add items to your bag.' } });
      return;
    }
    if (!product.default_variant_id) return;

    setStatus('adding');
    try {
      await addItem(product.default_variant_id, 1);
      setStatus('added');
      showToast({ title: `${product.name} added to your bag.`, tone: 'success', action: { label: 'View Bag', to: '/cart' } });
      window.setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('idle');
      showToast({ title: err.message || 'Could not add item to cart. Please try again.', tone: 'error' });
    }
  };

  return (
    <Link to={`/products/${product.id}`} className="group flex flex-col">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-muted">
        <img
          src={product.image_url || fallbackImageFor(product.id)}
          alt={product.name}
          onError={handleImageError(product.id)}
          className={`h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 ${soldOut ? 'opacity-60' : ''}`}
          loading="lazy"
        />

        {soldOut ? (
          <span className="absolute left-2.5 top-2.5 rounded bg-foreground/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
            Sold Out
          </span>
        ) : (
          product.brand && (
            <span className="absolute left-2.5 top-2.5 rounded bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/80 backdrop-blur-xs">
              {product.brand}
            </span>
          )
        )}

        {showQuickAdd && !soldOut && (
          <div className="absolute inset-x-0 bottom-0 translate-y-0 p-3 transition-transform duration-300 ease-out sm:translate-y-full sm:group-hover:translate-y-0">
            <button
              type="button"
              onClick={handleQuickAdd}
              disabled={status === 'adding'}
              className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-md py-2.5 text-xs font-semibold shadow-md transition-all sm:text-sm ${
                status === 'added' ? 'bg-emerald-700 text-white' : 'bg-brand text-brand-foreground hover:bg-primary'
              }`}
            >
              {status === 'adding' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Adding...</span>
                </>
              ) : status === 'added' ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Added to Bag</span>
                </>
              ) : needsOptions ? (
                <span>Choose Options</span>
              ) : (
                <>
                  <ShoppingBag className="h-4 w-4" />
                  <span>Add to Cart</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-1 flex-col justify-between sm:mt-4">
        <div>
          {product.brand && (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{product.brand}</span>
          )}
          <h3 className="mt-0.5 line-clamp-1 text-sm font-medium text-foreground transition-colors group-hover:text-muted-foreground sm:text-base">
            {product.name}
          </h3>
        </div>
        <p className="mt-1 text-sm font-semibold text-foreground sm:text-base">
          {hasRange && <span className="mr-1 text-xs font-normal text-muted-foreground">From</span>}
          {formatPrice(product.min_price ?? product.base_price)}
        </p>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col">
      <div className="aspect-[3/4] w-full rounded-lg bg-muted" />
      <div className="mt-4 h-3 w-1/4 rounded bg-muted" />
      <div className="mt-2 h-4 w-3/4 rounded bg-muted" />
      <div className="mt-2 h-4 w-1/3 rounded bg-muted" />
    </div>
  );
}
