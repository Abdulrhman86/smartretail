import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { get } from '../../api/client';
import { StatusBadge, buttonClasses, inputClass, labelClass } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatDate, formatPrice, orderRef } from '../../lib/format';

export default function ProfilePage() {
  useDocumentTitle('My Account');
  const { user, updateProfile } = useAuth();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [recentOrders, setRecentOrders] = useState(null);

  useEffect(() => setFullName(user?.full_name ?? ''), [user?.full_name]);

  useEffect(() => {
    get('/orders?limit=3')
      .then(setRecentOrders)
      .catch(() => setRecentOrders([]));
  }, []);

  const dirty = (fullName.trim() || null) !== (user?.full_name || null);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({ full_name: fullName.trim() || null });
      showToast({ title: 'Your profile has been updated.', tone: 'success' });
    } catch (err) {
      showToast({ title: err.message || 'Could not update your profile.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-12">
      <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
        <h2 className="font-display text-2xl font-medium tracking-tight text-foreground">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">How your name appears on orders and reviews.</p>
        <form onSubmit={save} className="mt-6 grid max-w-xl grid-cols-1 gap-5">
          <div>
            <label htmlFor="profile-name" className={labelClass}>Full name</label>
            <input id="profile-name" autoComplete="name" maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="profile-email" className={labelClass}>Email</label>
            <input id="profile-email" value={user?.email ?? ''} disabled className={inputClass} />
            <p className="mt-1.5 text-xs text-muted-foreground">Email changes aren&apos;t supported in this demo.</p>
          </div>
          <div>
            <button type="submit" disabled={!dirty || saving} className={buttonClasses.primary}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Changes
            </button>
          </div>
        </form>
      </div>

      <div>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-2xl font-medium tracking-tight text-foreground">Recent Orders</h2>
          <Link to="/account/orders" className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            View all
          </Link>
        </div>
        {recentOrders === null ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : recentOrders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            You haven&apos;t placed any orders yet.{' '}
            <Link to="/products" className="font-medium text-foreground underline underline-offset-4">Start shopping</Link>
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {recentOrders.map((order) => (
              <li key={order.id}>
                <Link to={`/account/orders/${order.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/40">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{orderRef(order.id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(order.created_at)} · {order.item_count} {order.item_count === 1 ? 'item' : 'items'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusBadge status={order.status} />
                    <span className="text-sm font-semibold tabular-nums text-foreground">{formatPrice(order.total_amount)}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
