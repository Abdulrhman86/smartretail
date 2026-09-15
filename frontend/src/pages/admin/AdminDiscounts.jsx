import { useCallback, useEffect, useState } from 'react';
import { BadgePercent, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { del, get, patch, post } from '../../api/client';
import { EmptyState, ErrorBanner, PageHeading, buttonClasses, inputClass, labelClass } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatDate, formatPrice } from '../../lib/format';

const EMPTY = {
  code: '',
  description: '',
  discount_type: 'percentage',
  discount_value: '',
  min_order_amount: '0',
  max_uses: '',
  valid_until: '',
  is_active: true,
};

// <input type="date"> works in local dates; send end-of-day UTC so a code is valid through that date.
const toIsoEndOfDay = (date) => (date ? new Date(`${date}T23:59:59Z`).toISOString() : null);
const toDateInput = (iso) => (iso ? iso.slice(0, 10) : '');

function discountState(d) {
  if (!d.is_active) return { label: 'Inactive', className: 'bg-muted text-muted-foreground ring-border' };
  if (d.valid_until && new Date(d.valid_until) < new Date()) return { label: 'Expired', className: 'bg-rose-50 text-rose-700 ring-rose-600/20' };
  if (d.max_uses != null && d.uses_count >= d.max_uses) return { label: 'Used up', className: 'bg-amber-50 text-amber-800 ring-amber-600/20' };
  if (new Date(d.valid_from) > new Date()) return { label: 'Scheduled', className: 'bg-sky-50 text-sky-800 ring-sky-600/20' };
  return { label: 'Active', className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' };
}

export default function AdminDiscounts() {
  useDocumentTitle('Discounts · Admin');
  const { showToast } = useToast();
  const [discounts, setDiscounts] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | discount
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setDiscounts(await get('/admin/discounts'));
    } catch (err) {
      setError(err.message || 'Could not load discounts.');
      setDiscounts([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (discount) => {
    setEditing(discount ?? 'new');
    setFormError('');
    setForm(
      discount
        ? {
            code: discount.code,
            description: discount.description ?? '',
            discount_type: discount.discount_type,
            discount_value: String(discount.discount_value),
            min_order_amount: String(discount.min_order_amount),
            max_uses: discount.max_uses == null ? '' : String(discount.max_uses),
            valid_until: toDateInput(discount.valid_until),
            is_active: discount.is_active,
          }
        : EMPTY,
    );
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    const payload = {
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_order_amount: Number(form.min_order_amount) || 0,
      max_uses: form.max_uses === '' ? null : Number(form.max_uses),
      valid_until: toIsoEndOfDay(form.valid_until),
      is_active: form.is_active,
    };
    try {
      if (editing === 'new') {
        await post('/admin/discounts', { ...payload, code: form.code.trim() });
      } else {
        await patch(`/admin/discounts/${editing.id}`, payload);
      }
      showToast({ title: `Discount ${editing === 'new' ? 'created' : 'saved'}.`, tone: 'success' });
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err.message || 'Could not save discount.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (discount) => {
    try {
      await patch(`/admin/discounts/${discount.id}`, { is_active: !discount.is_active });
      load();
    } catch (err) {
      showToast({ title: err.message || 'Could not update discount.', tone: 'error' });
    }
  };

  const remove = async (discount) => {
    if (!window.confirm(`Delete code ${discount.code}?`)) return;
    try {
      await del(`/admin/discounts/${discount.id}`);
      showToast({ title: 'Discount deleted.', tone: 'success' });
      load();
    } catch (err) {
      showToast({ title: err.message || 'Could not delete discount.', tone: 'error' });
    }
  };

  return (
    <div>
      <PageHeading
        eyebrow="Marketing"
        title="Discounts"
        actions={
          <button type="button" onClick={() => startEdit(null)} className={buttonClasses.primary}>
            <Plus className="h-4 w-4" /> New Code
          </button>
        }
      >
        Order-level promo codes — percentage or fixed amount, with optional minimums, usage caps and expiry.
      </PageHeading>

      <ErrorBanner message={error} onRetry={load} />

      {editing && (
        <form onSubmit={save} className="mb-8 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-foreground">{editing === 'new' ? 'New discount code' : `Edit ${editing.code}`}</h2>
            <button type="button" onClick={() => setEditing(null)} className={buttonClasses.ghost} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="d-code" className={labelClass}>Code *</label>
              <input
                id="d-code"
                required
                disabled={editing !== 'new'}
                pattern="[A-Za-z0-9_\-]{2,50}"
                title="2–50 letters, numbers, dashes or underscores"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className={`${inputClass} uppercase tracking-wider`}
              />
            </div>
            <div>
              <label htmlFor="d-type" className={labelClass}>Type</label>
              <select id="d-type" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })} className={`${inputClass} cursor-pointer`}>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed amount ($)</option>
              </select>
            </div>
            <div>
              <label htmlFor="d-value" className={labelClass}>Value *</label>
              <input
                id="d-value"
                type="number"
                required
                min="0.01"
                max={form.discount_type === 'percentage' ? '100' : undefined}
                step="0.01"
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="md:col-span-3">
              <label htmlFor="d-desc" className={labelClass}>Description</label>
              <input id="d-desc" maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor="d-min" className={labelClass}>Minimum subtotal ($)</label>
              <input id="d-min" type="number" min="0" step="0.01" value={form.min_order_amount} onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor="d-max" className={labelClass}>Usage limit</label>
              <input id="d-max" type="number" min="1" placeholder="Unlimited" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor="d-until" className={labelClass}>Valid until</label>
              <input id="d-until" type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className={inputClass} />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 rounded border-border" />
              Active
            </label>
          </div>
          {formError && <p className="mt-4 text-sm text-destructive">{formError}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setEditing(null)} className={buttonClasses.ghost}>Cancel</button>
            <button type="submit" disabled={busy} className={buttonClasses.primary}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </form>
      )}

      {discounts === null ? (
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      ) : discounts.length === 0 && !error ? (
        <EmptyState icon={BadgePercent} title="No discount codes">Create a code to reward customers at checkout.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Discount</th>
                <th className="px-4 py-3 font-semibold">Minimum</th>
                <th className="px-4 py-3 font-semibold">Usage</th>
                <th className="px-4 py-3 font-semibold">Expires</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {discounts.map((d) => {
                const state = discountState(d);
                return (
                  <tr key={d.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <p className="font-semibold tracking-wider text-foreground">{d.code}</p>
                      {d.description && <p className="max-w-[220px] truncate text-xs text-muted-foreground">{d.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-foreground">{d.discount_type === 'percentage' ? `${d.discount_value}%` : formatPrice(d.discount_value)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{d.min_order_amount > 0 ? formatPrice(d.min_order_amount) : '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {d.uses_count}
                      {d.max_uses != null && ` / ${d.max_uses}`}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{d.valid_until ? formatDate(d.valid_until) : 'Never'}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleActive(d)}
                        title={d.is_active ? 'Click to deactivate' : 'Click to activate'}
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset ${state.className}`}
                      >
                        {state.label}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button type="button" onClick={() => startEdit(d)} className={`${buttonClasses.ghost} px-2`} aria-label={`Edit ${d.code}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(d)}
                        disabled={d.uses_count > 0}
                        title={d.uses_count > 0 ? 'Used codes can only be deactivated' : 'Delete'}
                        className={`${buttonClasses.ghost} px-2`}
                        aria-label={`Delete ${d.code}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
