import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Package } from 'lucide-react';
import { getWithTotal } from '../../api/client';
import { EmptyState, ErrorBanner, Pagination, StatusBadge, buttonClasses } from '../../components/ui';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatDate, formatPrice, orderRef } from '../../lib/format';

const PAGE_SIZE = 10;

export default function OrdersPage() {
  useDocumentTitle('Order History');
  const [orders, setOrders] = useState(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const { data, total: count } = await getWithTotal(`/orders?limit=${PAGE_SIZE}&offset=${offset}`);
      setOrders(data);
      setTotal(count);
    } catch (err) {
      setError(err.message || 'Could not load your orders.');
      setOrders([]);
    }
  }, [offset]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h2 className="mb-6 font-display text-2xl font-medium tracking-tight text-foreground sm:text-3xl">Order History</h2>
      <ErrorBanner message={error} onRetry={load} />

      {orders === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : orders.length === 0 && !error ? (
        <EmptyState
          icon={Package}
          title="No orders yet"
          action={<Link to="/products" className={buttonClasses.primary}>Start Shopping</Link>}
        >
          When you place an order it will appear here, along with its status.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-5 py-3 font-semibold">Placed</th>
                  <th className="px-5 py-3 font-semibold">Items</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                  <th className="px-5 py-3"><span className="sr-only">View</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-4 font-semibold text-foreground">
                      <Link to={`/account/orders/${order.id}`} className="hover:underline">{orderRef(order.id)}</Link>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{formatDate(order.created_at)}</td>
                    <td className="px-5 py-4 text-muted-foreground">{order.item_count}</td>
                    <td className="px-5 py-4"><StatusBadge status={order.status} /></td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-foreground">{formatPrice(order.total_amount)}</td>
                    <td className="px-5 py-4 text-right">
                      <Link to={`/account/orders/${order.id}`} className="inline-flex text-muted-foreground hover:text-foreground" aria-label={`View order ${orderRef(order.id)}`}>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination offset={offset} limit={PAGE_SIZE} total={total} onChange={setOffset} />
        </div>
      )}
    </div>
  );
}
