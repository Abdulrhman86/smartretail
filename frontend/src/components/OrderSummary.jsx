import { formatAddress, formatPrice } from '../lib/format';

/** Line items + totals + shipping address for an order (shared by customer and admin views). */
export default function OrderSummary({ order }) {
  const address = formatAddress(order.shipping_address);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2 rounded-lg border border-border bg-card">
        <h3 className="border-b border-border px-5 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</h3>
        <ul className="divide-y divide-border">
          {(order.order_items || []).map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="font-display text-lg leading-tight text-foreground">{item.product_name}</p>
                {item.variant_label && <p className="mt-0.5 text-xs text-muted-foreground">{item.variant_label}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.quantity} × {formatPrice(item.unit_price)}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-foreground">{formatPrice(item.line_total)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-2 border-t border-border px-5 py-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <dt>Subtotal</dt>
            <dd className="tabular-nums text-foreground">{formatPrice(order.subtotal)}</dd>
          </div>
          {order.discount_amount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <dt>Discount{order.discount_code ? ` (${order.discount_code})` : ''}</dt>
              <dd className="tabular-nums text-foreground">−{formatPrice(order.discount_amount)}</dd>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <dt>Shipping</dt>
            <dd className="tabular-nums text-foreground">{order.shipping_amount > 0 ? formatPrice(order.shipping_amount) : 'Free'}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-base font-semibold text-foreground">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPrice(order.total_amount)}</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card px-5 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shipping Address</h3>
          <address className="mt-3 space-y-0.5 text-sm not-italic text-foreground">
            {address.map((line, i) => (
              <p key={i} className={i === 0 ? 'font-medium' : 'text-muted-foreground'}>{line}</p>
            ))}
            {order.shipping_address?.phone && <p className="text-muted-foreground">{order.shipping_address.phone}</p>}
          </address>
          {order.shipping_address?.delivery_notes && (
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="font-semibold">Notes:</span> {order.shipping_address.delivery_notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
