import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ClipboardList, DollarSign, Package, RefreshCw, Users } from 'lucide-react';
import { get } from '../../api/client';
import { ErrorBanner, PageHeading, StatusBadge, buttonClasses } from '../../components/ui';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { ORDER_STATUSES, ORDER_STATUS_META, formatDate, formatPrice, orderRef } from '../../lib/format';

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <p className="mt-3 font-display text-3xl font-medium tracking-tight text-foreground tabular-nums lining-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RevenueChart({ data }) {
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const total = data.reduce((sum, d) => sum + d.revenue, 0);
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revenue · last 14 days</p>
          <p className="mt-1 font-display text-2xl text-foreground tabular-nums lining-nums">{formatPrice(total)}</p>
        </div>
        <p className="text-xs text-muted-foreground">Excludes cancelled orders</p>
      </div>
      <div className="mt-6 flex h-40 items-end gap-1.5" role="img" aria-label="Daily revenue bar chart for the last 14 days">
        {data.map((d) => {
          const height = (d.revenue / max) * 100;
          return (
            <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
              <div
                className={`w-full rounded-t-sm transition-colors ${d.revenue > 0 ? 'bg-brand/80 group-hover:bg-brand' : 'bg-muted'}`}
                style={{ height: `${Math.max(height, d.revenue > 0 ? 4 : 2)}%` }}
              />
              <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[11px] text-background group-hover:block">
                {new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {formatPrice(d.revenue)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{data[0] && new Date(`${data[0].date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  useDocumentTitle('Admin Dashboard');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      setStats(await get('/admin/stats'));
    } catch (err) {
      setError(err.message || 'Could not load dashboard statistics.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeading
        eyebrow="Overview"
        title="Dashboard"
        actions={
          <button type="button" onClick={load} disabled={refreshing} className={buttonClasses.secondary}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      >
        A snapshot of store performance, fulfilment and inventory.
      </PageHeading>

      <ErrorBanner message={error} onRetry={load} />

      {!stats ? (
        !error && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={DollarSign} label="Revenue" value={formatPrice(stats.revenue_total)} hint={`${formatPrice(stats.revenue_last_30_days)} in the last 30 days`} />
            <StatCard icon={ClipboardList} label="Orders" value={stats.order_count} hint={`Avg. order ${formatPrice(stats.average_order_value)}`} />
            <StatCard icon={Package} label="Products" value={stats.active_product_count} hint={`${stats.product_count - stats.active_product_count} archived`} />
            <StatCard icon={Users} label="Customers" value={stats.customer_count} hint="Registered accounts" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <RevenueChart data={stats.revenue_by_day} />
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Orders by status</p>
              <ul className="mt-4 space-y-3">
                {ORDER_STATUSES.map((status) => {
                  const count = stats.orders_by_status[status] ?? 0;
                  const pct = stats.order_count ? (count / stats.order_count) * 100 : 0;
                  return (
                    <li key={status}>
                      <Link to={`/admin/orders?status=${status}`} className="group block">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-foreground group-hover:underline">{ORDER_STATUS_META[status].label}</span>
                          <span className="tabular-nums text-muted-foreground">{count}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-brand/70" style={{ width: `${pct}%` }} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <div className="rounded-lg border border-border bg-card xl:col-span-3">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent orders</p>
                <Link to="/admin/orders" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {stats.recent_orders.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {stats.recent_orders.map((order) => (
                    <li key={order.id}>
                      <Link to={`/admin/orders/${order.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{orderRef(order.id)}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {order.customer_email || 'Unknown customer'} · {formatDate(order.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={order.status} />
                          <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatPrice(order.total_amount)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card xl:col-span-2">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Low stock (≤ {stats.low_stock_threshold})
                </p>
                <Link to="/admin/products?stock=low" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  View <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {stats.low_stock.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">All variants are well stocked.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {stats.low_stock.map((v) => (
                    <li key={v.variant_id}>
                      <Link to={`/admin/products/${v.product_id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-foreground">{v.product_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{[v.sku, v.label].filter(Boolean).join(' · ')}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                            v.stock_quantity === 0 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {v.stock_quantity === 0 ? 'Out' : `${v.stock_quantity} left`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
