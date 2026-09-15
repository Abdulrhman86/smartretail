import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ApiError, get, post } from '../../api/client';
import OrderSummary from '../../components/OrderSummary';
import { ErrorBanner, StatusBadge, buttonClasses } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatDateTime, orderRef } from '../../lib/format';

const PROGRESS = ['pending', 'paid', 'shipped', 'delivered'];

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const { showToast } = useToast();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useDocumentTitle(order ? `Order ${orderRef(order.id)}` : 'Order');

  const load = useCallback(async () => {
    setError('');
    try {
      setOrder(await get(`/orders/${orderId}`));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 422)) setNotFound(true);
      else setError(err.message || 'Could not load this order.');
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const cancel = async () => {
    setCancelling(true);
    try {
      setOrder(await post(`/orders/${orderId}/cancel`));
      showToast({ title: 'Your order has been cancelled.', tone: 'success' });
    } catch (err) {
      showToast({ title: err.message || 'Could not cancel this order.', tone: 'error' });
    } finally {
      setCancelling(false);
      setConfirmingCancel(false);
    }
  };

  if (notFound) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <h2 className="font-display text-3xl text-foreground">Order not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">This order doesn&apos;t exist or belongs to another account.</p>
        <Link to="/account/orders" className={`mt-6 ${buttonClasses.secondary}`}>Back to Orders</Link>
      </div>
    );
  }

  const stepIndex = order ? PROGRESS.indexOf(order.status) : -1;

  return (
    <div>
      <Link to="/account/orders" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All orders
      </Link>
      <ErrorBanner message={error} onRetry={load} />

      {!order ? (
        !error && <div className="h-64 animate-pulse rounded-lg bg-muted" />
      ) : (
        <div className="space-y-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-normal tracking-tight text-foreground lining-nums">Order {orderRef(order.id)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Placed {formatDateTime(order.created_at)}</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={order.status} />
              {order.status === 'pending' &&
                (confirmingCancel ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Cancel this order?</span>
                    <button type="button" onClick={cancel} disabled={cancelling} className={buttonClasses.danger}>
                      {cancelling && <Loader2 className="h-4 w-4 animate-spin" />} Yes, cancel
                    </button>
                    <button type="button" onClick={() => setConfirmingCancel(false)} className={buttonClasses.ghost}>Keep order</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmingCancel(true)} className={buttonClasses.secondary}>Cancel Order</button>
                ))}
            </div>
          </div>

          {order.status !== 'cancelled' ? (
            <ol className="grid grid-cols-4 gap-2" aria-label="Order progress">
              {PROGRESS.map((step, i) => (
                <li key={step}>
                  <div className={`h-1.5 rounded-full ${i <= stepIndex ? 'bg-brand' : 'bg-muted'}`} />
                  <p className={`mt-2 text-[11px] font-semibold uppercase tracking-wider ${i <= stepIndex ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {step}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              This order was cancelled and any reserved stock has been released.
            </p>
          )}

          <OrderSummary order={order} />
        </div>
      )}
    </div>
  );
}
