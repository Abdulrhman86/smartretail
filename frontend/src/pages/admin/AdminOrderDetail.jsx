import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ApiError, get, patch } from '../../api/client';
import OrderSummary from '../../components/OrderSummary';
import { ErrorBanner, StatusBadge, buttonClasses } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { ADMIN_STATUS_TRANSITIONS, ORDER_STATUS_META, formatDateTime, orderRef } from '../../lib/format';

const ACTION_LABELS = {
  paid: 'Mark as Paid',
  shipped: 'Mark as Shipped',
  delivered: 'Mark as Delivered',
  cancelled: 'Cancel Order',
};

export default function AdminOrderDetail() {
  const { orderId } = useParams();
  const { showToast } = useToast();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useDocumentTitle(order ? `Order ${orderRef(order.id)} · Admin` : 'Order · Admin');

  const load = useCallback(async () => {
    setError('');
    try {
      setOrder(await get(`/admin/orders/${orderId}`));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 422)) setNotFound(true);
      else setError(err.message || 'Could not load order.');
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (status) => {
    setPendingStatus(status);
    try {
      setOrder(await patch(`/admin/orders/${orderId}`, { status }));
      showToast({ title: `Order marked as ${ORDER_STATUS_META[status].label.toLowerCase()}.`, tone: 'success' });
    } catch (err) {
      showToast({ title: err.message || 'Could not update order status.', tone: 'error' });
      load();
    } finally {
      setPendingStatus(null);
      setConfirmCancel(false);
    }
  };

  if (notFound) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <h1 className="font-display text-3xl text-foreground">Order not found</h1>
        <Link to="/admin/orders" className={`mt-6 ${buttonClasses.secondary}`}>Back to Orders</Link>
      </div>
    );
  }

  const nextStatuses = order ? ADMIN_STATUS_TRANSITIONS[order.status] : [];
  const forward = nextStatuses.filter((s) => s !== 'cancelled');
  const canCancel = nextStatuses.includes('cancelled');

  return (
    <div>
      <Link to="/admin/orders" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All orders
      </Link>
      <ErrorBanner message={error} onRetry={load} />

      {!order ? (
        !error && <div className="h-96 animate-pulse rounded-lg bg-muted" />
      ) : (
        <div className="space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Order</p>
              <h1 className="mt-1 flex flex-wrap items-center gap-3 font-display text-3xl font-normal tracking-tight text-foreground lining-nums sm:text-4xl">
                {orderRef(order.id)} <StatusBadge status={order.status} />
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Placed {formatDateTime(order.created_at)} by{' '}
                <span className="font-medium text-foreground">{order.customer_email || 'unknown customer'}</span>
                {order.updated_at !== order.created_at && <> · updated {formatDateTime(order.updated_at)}</>}
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">{order.id}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {forward.map((status) => (
                <button key={status} type="button" onClick={() => updateStatus(status)} disabled={!!pendingStatus} className={buttonClasses.primary}>
                  {pendingStatus === status && <Loader2 className="h-4 w-4 animate-spin" />}
                  {ACTION_LABELS[status]}
                </button>
              ))}
              {canCancel &&
                (confirmCancel ? (
                  <>
                    <button type="button" onClick={() => updateStatus('cancelled')} disabled={!!pendingStatus} className={buttonClasses.danger}>
                      {pendingStatus === 'cancelled' && <Loader2 className="h-4 w-4 animate-spin" />} Confirm cancel &amp; restock
                    </button>
                    <button type="button" onClick={() => setConfirmCancel(false)} className={buttonClasses.ghost}>Keep</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmCancel(true)} disabled={!!pendingStatus} className={buttonClasses.danger}>
                    Cancel Order
                  </button>
                ))}
              {nextStatuses.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {order.status === 'delivered' ? 'This order is complete.' : 'This order was cancelled; stock was restored.'}
                </p>
              )}
            </div>
          </div>

          <OrderSummary order={order} />
        </div>
      )}
    </div>
  );
}
