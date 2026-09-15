import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, Search } from 'lucide-react';
import { getWithTotal, toQuery } from '../../api/client';
import { EmptyState, ErrorBanner, PageHeading, Pagination, StatusBadge, inputClass } from '../../components/ui';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { ORDER_STATUSES, ORDER_STATUS_META, formatDateTime, formatPrice, orderRef } from '../../lib/format';

const PAGE_SIZE = 25;

export default function AdminOrders() {
  useDocumentTitle('Orders · Admin');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const search = params.get('search') ?? '';
  const offset = Number(params.get('offset') ?? 0) || 0;

  const [searchInput, setSearchInput] = useState(search);
  const [orders, setOrders] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => setSearchInput(search), [search]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setError('');
    try {
      const { data, total: count } = await getWithTotal(`/admin/orders${toQuery({ status, search, limit: PAGE_SIZE, offset })}`);
      if (id !== requestId.current) return;
      setOrders(data);
      setTotal(count);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.message || 'Could not load orders.');
      setOrders([]);
    }
  }, [status, search, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'offset') next.delete('offset');
    setParams(next);
  };

  return (
    <div>
      <PageHeading eyebrow="Fulfilment" title="Orders">
        Review orders, update their status and follow them through to delivery.
      </PageHeading>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by status">
          {['', ...ORDER_STATUSES].map((s) => (
            <button
              key={s || 'all'}
              type="button"
              role="tab"
              aria-selected={status === s}
              onClick={() => setParam('status', s)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium transition-all sm:text-sm ${
                status === s ? 'bg-brand text-brand-foreground shadow-sm' : 'border border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              {s ? ORDER_STATUS_META[s].label : 'All'}
            </button>
          ))}
        </div>
        <form
          className="relative w-full lg:max-w-xs"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setParam('search', searchInput.trim());
          }}
        >
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Customer email or order #"
            className={`${inputClass} pl-10`}
            aria-label="Search orders"
          />
        </form>
      </div>

      <ErrorBanner message={error} onRetry={load} />

      {orders === null ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : orders.length === 0 && !error ? (
        <EmptyState icon={ClipboardList} title="No orders found">
          {status || search ? 'Try a different status or search.' : 'Orders will appear here once customers check out.'}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Placed</th>
                  <th className="px-4 py-3 font-semibold">Items</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 font-semibold">
                      <Link to={`/admin/orders/${order.id}`} className="text-foreground hover:underline">{orderRef(order.id)}</Link>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-muted-foreground">
                      {order.shipping_address?.full_name && <span className="block truncate text-foreground">{order.shipping_address.full_name}</span>}
                      <span className="block truncate text-xs">{order.customer_email || '—'}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(order.created_at)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{order.item_count}</td>
                    <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPrice(order.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination offset={offset} limit={PAGE_SIZE} total={total} onChange={(o) => setParam('offset', String(o))} />
        </div>
      )}
    </div>
  );
}
