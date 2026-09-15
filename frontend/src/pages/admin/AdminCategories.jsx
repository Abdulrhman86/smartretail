import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { del, get, patch, post } from '../../api/client';
import { ErrorBanner, PageHeading, buttonClasses, inputClass, labelClass } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import useDocumentTitle from '../../hooks/useDocumentTitle';

const EMPTY = { name: '', slug: '', parent_id: '', description: '' };

export default function AdminCategories() {
  useDocumentTitle('Categories · Admin');
  const { showToast } = useToast();
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | category id
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setCategories(await get('/categories'));
    } catch (err) {
      setError(err.message || 'Could not load categories.');
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startNew = (parentId = '') => {
    setEditing('new');
    setForm({ ...EMPTY, parent_id: parentId });
    setFormError('');
  };

  const startEdit = (category) => {
    setEditing(category.id);
    setForm({ name: category.name, slug: category.slug, parent_id: category.parent_id ?? '', description: category.description ?? '' });
    setFormError('');
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      parent_id: form.parent_id || null,
      ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
    };
    try {
      if (editing === 'new') await post('/admin/categories', payload);
      else await patch(`/admin/categories/${editing}`, payload);
      showToast({ title: `Category ${editing === 'new' ? 'created' : 'saved'}.`, tone: 'success' });
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err.message || 'Could not save category.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (category) => {
    if (!window.confirm(`Delete “${category.name}”? This only works for empty categories.`)) return;
    try {
      await del(`/admin/categories/${category.id}`);
      showToast({ title: 'Category deleted.', tone: 'success' });
      load();
    } catch (err) {
      showToast({ title: err.message || 'Could not delete category.', tone: 'error' });
    }
  };

  const topLevel = (categories ?? []).filter((c) => !c.parent_id);
  const childrenOf = (id) => (categories ?? []).filter((c) => c.parent_id === id);
  const editingHasChildren = editing && editing !== 'new' && childrenOf(editing).length > 0;

  return (
    <div>
      <PageHeading
        eyebrow="Catalog"
        title="Categories"
        actions={
          <button type="button" onClick={() => startNew()} className={buttonClasses.primary}>
            <Plus className="h-4 w-4" /> New Category
          </button>
        }
      >
        Two levels: departments and their subcategories. Products always belong to a subcategory.
      </PageHeading>

      <ErrorBanner message={error} onRetry={load} />

      {editing && (
        <form onSubmit={save} className="mb-8 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-foreground">{editing === 'new' ? 'New category' : 'Edit category'}</h2>
            <button type="button" onClick={() => setEditing(null)} className={buttonClasses.ghost} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="c-name" className={labelClass}>Name *</label>
              <input id="c-name" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor="c-parent" className={labelClass}>Parent department</label>
              <select
                id="c-parent"
                value={form.parent_id}
                disabled={editingHasChildren}
                onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="">None — this is a department</option>
                {topLevel
                  .filter((c) => c.id !== editing)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="c-slug" className={labelClass}>Slug</label>
              <input id="c-slug" maxLength={120} placeholder="Generated from the name" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor="c-desc" className={labelClass}>Description</label>
              <input id="c-desc" maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
            </div>
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

      {categories === null ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {topLevel.map((parent) => (
            <section key={parent.id} className="rounded-lg border border-border bg-card">
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <h2 className="font-display text-xl text-foreground">{parent.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">{parent.description || parent.slug}</p>
                </div>
                <div className="flex shrink-0 items-center">
                  <Link to={`/admin/products?category_id=${parent.id}`} className={`${buttonClasses.ghost} px-2 text-xs`}>Products</Link>
                  <button type="button" onClick={() => startEdit(parent)} className={`${buttonClasses.ghost} px-2`} aria-label={`Edit ${parent.name}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => remove(parent)} className={`${buttonClasses.ghost} px-2`} aria-label={`Delete ${parent.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {childrenOf(parent.id).map((child) => (
                  <li key={child.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{child.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{child.slug}</p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Link to={`/admin/products?category_id=${child.id}`} className={`${buttonClasses.ghost} px-2 text-xs`}>Products</Link>
                      <button type="button" onClick={() => startEdit(child)} className={`${buttonClasses.ghost} px-2`} aria-label={`Edit ${child.name}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => remove(child)} className={`${buttonClasses.ghost} px-2`} aria-label={`Delete ${child.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border px-5 py-3">
                <button type="button" onClick={() => startNew(parent.id)} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" /> Add subcategory
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
