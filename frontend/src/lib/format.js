import { USD_PER_KD, displayCurrency } from './currency';

// Intl renders KWD as "KWD 12.500"; Kuwaiti stores write "KD 12.500", so the dinar is
// formatted as a plain number with the symbol prefixed.
const dinar = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const dollar = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Takes an amount in KD — the currency everything is stored and charged in. */
export function formatPrice(value) {
  const amount = Number(value) || 0;
  return displayCurrency === 'USD' ? dollar.format(amount * USD_PER_KD) : `KD ${dinar.format(amount)}`;
}

export function formatPriceRange(min, max) {
  if (min == null) return formatPrice(0);
  return max != null && max > min ? `${formatPrice(min)} – ${formatPrice(max)}` : formatPrice(min);
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Short, human-friendly order reference derived from the UUID. */
export function orderRef(id) {
  return id ? `#${id.slice(0, 8).toUpperCase()}` : '';
}

export function variantLabel(variant) {
  if (!variant) return '';
  return [variant.size, variant.color].filter(Boolean).join(' / ');
}

export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

export const ORDER_STATUS_META = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  paid: { label: 'Paid', className: 'bg-sky-50 text-sky-800 ring-sky-600/20' },
  shipped: { label: 'Shipped', className: 'bg-indigo-50 text-indigo-800 ring-indigo-600/20' },
  delivered: { label: 'Delivered', className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground ring-border' },
};

/** Status transitions an admin can make (mirrors backend ADMIN_STATUS_TRANSITIONS). */
export const ADMIN_STATUS_TRANSITIONS = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function formatAddress(address) {
  if (!address) return [];
  const line1 = [address.street_address ?? address.street, address.suite_unit].filter(Boolean).join(', ');
  const line2 = [address.city, address.state, address.postal_code ?? address.zip].filter(Boolean).join(', ');
  return [address.full_name, line1, line2, address.country].filter(Boolean);
}
