import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShieldCheck, Users } from 'lucide-react';
import { get, patch, toQuery } from '../../api/client';
import { EmptyState, ErrorBanner, PageHeading, buttonClasses, inputClass } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatDate } from '../../lib/format';

export default function AdminUsers() {
  useDocumentTitle('Customers · Admin');
  const { user: me } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setUsers(await get(`/admin/users${toQuery({ search })}`));
    } catch (err) {
      setError(err.message || 'Could not load users.');
      setUsers([]);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const changeRole = async (target, role) => {
    const verb = role === 'admin' ? 'Grant admin access to' : 'Remove admin access from';
    if (!window.confirm(`${verb} ${target.email}?`)) return;
    setBusyId(target.id);
    try {
      const updated = await patch(`/admin/users/${target.id}/role`, { role });
      setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));
      showToast({ title: `${target.email} is now ${role === 'admin' ? 'an admin' : 'a customer'}.`, tone: 'success' });
    } catch (err) {
      showToast({ title: err.message || 'Could not change role.', tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeading eyebrow="People" title="Customers">
        Registered accounts from Supabase Auth. Admins can manage the catalog, orders and discounts.
      </PageHeading>

      <form
        className="relative mb-6 max-w-sm"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchInput.trim());
        }}
      >
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by email or name"
          className={`${inputClass} pl-10`}
          aria-label="Search customers"
        />
      </form>

      <ErrorBanner message={error} onRetry={load} />

      {users === null ? (
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      ) : users.length === 0 && !error ? (
        <EmptyState icon={Users} title="No accounts found">{search ? 'Try a different search.' : 'Accounts appear here when people sign up.'}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Account</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Orders</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 font-semibold">Last sign-in</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{u.full_name || '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.email}
                      {!u.email_confirmed && <span className="ml-2 text-amber-700">(unconfirmed)</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-foreground">
                        <ShieldCheck className="h-3 w-3" /> Admin
                      </span>
                    ) : (
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">Customer</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {u.order_count > 0 ? (
                      <Link to={`/admin/orders?search=${encodeURIComponent(u.email ?? '')}`} className="text-foreground underline-offset-4 hover:underline">
                        {u.order_count}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.last_sign_in_at ? formatDate(u.last_sign_in_at) : 'Never'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {u.id === me?.id ? (
                      <span className="text-xs text-muted-foreground">You</span>
                    ) : u.role === 'admin' ? (
                      <button type="button" disabled={busyId === u.id} onClick={() => changeRole(u, 'customer')} className={`${buttonClasses.ghost} text-xs`}>
                        Remove admin
                      </button>
                    ) : (
                      <button type="button" disabled={busyId === u.id} onClick={() => changeRole(u, 'admin')} className={`${buttonClasses.ghost} text-xs`}>
                        Make admin
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
