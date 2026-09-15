import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, ExternalLink, ImagePlus, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { ApiError, del, get, patch, post } from '../../api/client';
import { ErrorBanner, buttonClasses, inputClass, labelClass } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatDateTime } from '../../lib/format';
import { handleImageError } from '../../lib/images';

const EMPTY_PRODUCT = { name: '', slug: '', brand: '', category_id: '', base_price: '', description: '', is_active: true };
const EMPTY_VARIANT = { sku: '', size: '', color: '', price_override: '', stock_quantity: '0', image_url: '' };

const toNumberOrNull = (value) => (value === '' || value === null || value === undefined ? null : Number(value));

function CategorySelect({ categories, value, onChange, id }) {
  const topLevel = categories.filter((c) => !c.parent_id);
  return (
    <select id={id} value={value} onChange={onChange} className={`${inputClass} cursor-pointer`} required>
      <option value="" disabled>Select a subcategory…</option>
      {topLevel.map((parent) => (
        <optgroup key={parent.id} label={parent.name}>
          {categories
            .filter((c) => c.parent_id === parent.id)
            .map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export default function AdminProductForm() {
  const { productId } = useParams();
  const isNew = !productId;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [categories, setCategories] = useState([]);
  const [product, setProduct] = useState(null); // saved server state (edit mode)
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [newVariants, setNewVariants] = useState([{ ...EMPTY_VARIANT }]); // create mode
  const [newImages, setNewImages] = useState(['']); // create mode
  const [loadError, setLoadError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useDocumentTitle(isNew ? 'New Product · Admin' : `${product?.name ?? 'Product'} · Admin`);

  useEffect(() => {
    get('/categories').then(setCategories).catch(() => {});
  }, []);

  const loadProduct = useCallback(async () => {
    if (isNew) return;
    setLoadError('');
    try {
      const data = await get(`/admin/products/${productId}`);
      setProduct(data);
      setForm({
        name: data.name,
        slug: data.slug,
        brand: data.brand ?? '',
        category_id: data.category_id,
        base_price: String(data.base_price),
        description: data.description ?? '',
        is_active: data.is_active,
      });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 422)) setNotFound(true);
      else setLoadError(err.message || 'Could not load product.');
    }
  }, [isNew, productId]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.category_id) {
      setFormError('Choose a subcategory.');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      category_id: form.category_id,
      base_price: Number(form.base_price),
      description: form.description.trim() || null,
      is_active: form.is_active,
      ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
    };

    try {
      if (isNew) {
        const variants = newVariants
          .filter((v) => v.sku.trim())
          .map((v) => ({
            sku: v.sku.trim(),
            size: v.size.trim() || null,
            color: v.color.trim() || null,
            price_override: toNumberOrNull(v.price_override),
            stock_quantity: Number(v.stock_quantity) || 0,
            image_url: v.image_url.trim() || null,
          }));
        const images = newImages
          .map((url) => url.trim())
          .filter(Boolean)
          .map((url, i) => ({ url, alt_text: payload.name, display_order: i }));
        const created = await post('/admin/products', { ...payload, variants, images });
        showToast({ title: `${created.name} created.`, tone: 'success' });
        navigate(`/admin/products/${created.id}`, { replace: true });
      } else {
        const updated = await patch(`/admin/products/${productId}`, payload);
        setProduct(updated);
        setForm((f) => ({ ...f, slug: updated.slug }));
        showToast({ title: 'Product saved.', tone: 'success' });
      }
    } catch (err) {
      setFormError(err.message || 'Could not save product.');
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    setSaving(true);
    try {
      if (product.is_active) {
        await del(`/admin/products/${productId}`);
        showToast({ title: 'Product archived — it is hidden from the store.', tone: 'success' });
      } else {
        await patch(`/admin/products/${productId}`, { is_active: true });
        showToast({ title: 'Product restored to the store.', tone: 'success' });
      }
      await loadProduct();
    } catch (err) {
      showToast({ title: err.message || 'Could not update product status.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <h1 className="font-display text-3xl text-foreground">Product not found</h1>
        <Link to="/admin/products" className={`mt-6 ${buttonClasses.secondary}`}>Back to Products</Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/admin/products" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All products
      </Link>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{isNew ? 'Create' : 'Edit product'}</p>
          <h1 className="mt-1 font-display text-3xl font-normal tracking-tight text-foreground sm:text-4xl">
            {isNew ? 'New Product' : product?.name ?? 'Loading…'}
          </h1>
          {product && (
            <p className="mt-2 text-xs text-muted-foreground">
              Last updated {formatDateTime(product.updated_at)}
              {product.rating_count > 0 && ` · ${product.rating_average.toFixed(1)}★ from ${product.rating_count} reviews`}
            </p>
          )}
        </div>
        {product && (
          <div className="flex flex-wrap gap-3">
            {product.is_active && (
              <Link to={`/products/${product.id}`} target="_blank" className={buttonClasses.secondary}>
                <ExternalLink className="h-4 w-4" /> View in Store
              </Link>
            )}
            <button type="button" onClick={toggleArchive} disabled={saving} className={product.is_active ? buttonClasses.danger : buttonClasses.secondary}>
              {product.is_active ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              {product.is_active ? 'Archive' : 'Restore'}
            </button>
          </div>
        )}
      </div>

      <ErrorBanner message={loadError} onRetry={loadProduct} />

      {!isNew && !product ? (
        !loadError && <div className="h-96 animate-pulse rounded-lg bg-muted" />
      ) : (
        <div className="space-y-8">
          <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 sm:p-8">
            <h2 className="font-display text-2xl text-foreground">Details</h2>
            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="p-name" className={labelClass}>Name *</label>
                <input id="p-name" required maxLength={200} value={form.name} onChange={setField('name')} className={inputClass} />
              </div>
              <div>
                <label htmlFor="p-brand" className={labelClass}>Brand</label>
                <input id="p-brand" maxLength={100} value={form.brand} onChange={setField('brand')} className={inputClass} />
              </div>
              <div>
                <label htmlFor="p-category" className={labelClass}>Subcategory *</label>
                <CategorySelect id="p-category" categories={categories} value={form.category_id} onChange={setField('category_id')} />
              </div>
              <div>
                <label htmlFor="p-price" className={labelClass}>Base price (USD) *</label>
                <input id="p-price" type="number" required min="0" step="0.01" value={form.base_price} onChange={setField('base_price')} className={inputClass} />
              </div>
              <div>
                <label htmlFor="p-slug" className={labelClass}>URL slug</label>
                <input id="p-slug" maxLength={220} placeholder="Generated from the name" value={form.slug} onChange={setField('slug')} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="p-description" className={labelClass}>Description</label>
                <textarea id="p-description" rows={4} maxLength={5000} value={form.description} onChange={setField('description')} className={`${inputClass} resize-y`} />
              </div>
              {isNew && (
                <label className="flex items-center gap-2 text-sm text-foreground md:col-span-2">
                  <input type="checkbox" checked={form.is_active} onChange={setField('is_active')} className="h-4 w-4 rounded border-border" />
                  Publish immediately (visible in the store)
                </label>
              )}
            </div>

            {isNew && (
              <>
                <h2 className="mt-10 font-display text-2xl text-foreground">Variants</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Stock is tracked per variant. Leave size and color empty for a single default variant; rows without a SKU are ignored (a default variant is created if none).
                </p>
                <div className="mt-4 space-y-3">
                  {newVariants.map((v, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 md:grid-cols-6">
                      {[
                        ['sku', 'SKU'],
                        ['size', 'Size'],
                        ['color', 'Color'],
                        ['price_override', 'Price override'],
                        ['stock_quantity', 'Stock'],
                      ].map(([key, label]) => (
                        <input
                          key={key}
                          aria-label={`Variant ${i + 1} ${label}`}
                          placeholder={label}
                          type={key === 'price_override' || key === 'stock_quantity' ? 'number' : 'text'}
                          min={key === 'price_override' || key === 'stock_quantity' ? '0' : undefined}
                          step={key === 'price_override' ? '0.01' : undefined}
                          value={v[key]}
                          onChange={(e) => setNewVariants((rows) => rows.map((row, j) => (j === i ? { ...row, [key]: e.target.value } : row)))}
                          className={inputClass}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => setNewVariants((rows) => (rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ ...EMPTY_VARIANT }]))}
                        className={buttonClasses.ghost}
                        aria-label={`Remove variant ${i + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setNewVariants((rows) => [...rows, { ...EMPTY_VARIANT }])} className={buttonClasses.secondary}>
                    <Plus className="h-4 w-4" /> Add variant
                  </button>
                </div>

                <h2 className="mt-10 font-display text-2xl text-foreground">Images</h2>
                <p className="mt-1 text-sm text-muted-foreground">Paste image URLs. The first image is used on product cards.</p>
                <div className="mt-4 space-y-2">
                  {newImages.map((url, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://…"
                        aria-label={`Image URL ${i + 1}`}
                        value={url}
                        onChange={(e) => setNewImages((rows) => rows.map((row, j) => (j === i ? e.target.value : row)))}
                        className={inputClass}
                      />
                      <button type="button" onClick={() => setNewImages((rows) => (rows.length > 1 ? rows.filter((_, j) => j !== i) : ['']))} className={buttonClasses.ghost} aria-label={`Remove image ${i + 1}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setNewImages((rows) => [...rows, ''])} className={buttonClasses.secondary}>
                    <ImagePlus className="h-4 w-4" /> Add image
                  </button>
                </div>
              </>
            )}

            {formError && <p className="mt-6 rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{formError}</p>}
            <div className="mt-8 flex justify-end gap-3 border-t border-border pt-6">
              <Link to="/admin/products" className={buttonClasses.ghost}>Cancel</Link>
              <button type="submit" disabled={saving} className={buttonClasses.primary}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isNew ? 'Create Product' : 'Save Details'}
              </button>
            </div>
          </form>

          {product && (
            <>
              <VariantsEditor product={product} onChanged={loadProduct} />
              <ImagesEditor product={product} onChanged={loadProduct} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function VariantRow({ variant, basePrice, onChanged, canDelete }) {
  const { showToast } = useToast();
  const [row, setRow] = useState(() => ({
    sku: variant.sku,
    size: variant.size ?? '',
    color: variant.color ?? '',
    price_override: variant.price_override ?? '',
    stock_quantity: String(variant.stock_quantity),
  }));
  const [busy, setBusy] = useState(false);

  const dirty =
    row.sku !== variant.sku ||
    row.size !== (variant.size ?? '') ||
    row.color !== (variant.color ?? '') ||
    String(row.price_override) !== String(variant.price_override ?? '') ||
    Number(row.stock_quantity) !== variant.stock_quantity;

  const save = async () => {
    setBusy(true);
    try {
      await patch(`/admin/variants/${variant.id}`, {
        sku: row.sku.trim(),
        size: row.size.trim() || null,
        color: row.color.trim() || null,
        price_override: toNumberOrNull(row.price_override),
        stock_quantity: Number(row.stock_quantity) || 0,
      });
      showToast({ title: `Variant ${row.sku.trim().toUpperCase()} saved.`, tone: 'success' });
      onChanged();
    } catch (err) {
      showToast({ title: err.message || 'Could not save variant.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete variant ${variant.sku}? Past orders keep their snapshot.`)) return;
    setBusy(true);
    try {
      await del(`/admin/variants/${variant.id}`);
      onChanged();
    } catch (err) {
      showToast({ title: err.message || 'Could not delete variant.', tone: 'error' });
      setBusy(false);
    }
  };

  const cell = `${inputClass} py-2`;
  return (
    <tr className="align-top">
      <td className="px-3 py-2"><input aria-label="SKU" value={row.sku} onChange={(e) => setRow({ ...row, sku: e.target.value })} className={cell} /></td>
      <td className="px-3 py-2"><input aria-label="Size" value={row.size} onChange={(e) => setRow({ ...row, size: e.target.value })} className={cell} /></td>
      <td className="px-3 py-2"><input aria-label="Color" value={row.color} onChange={(e) => setRow({ ...row, color: e.target.value })} className={cell} /></td>
      <td className="px-3 py-2">
        <input
          aria-label="Price override"
          type="number"
          min="0"
          step="0.01"
          placeholder={String(basePrice)}
          value={row.price_override}
          onChange={(e) => setRow({ ...row, price_override: e.target.value })}
          className={cell}
        />
      </td>
      <td className="px-3 py-2">
        <input
          aria-label="Stock"
          type="number"
          min="0"
          value={row.stock_quantity}
          onChange={(e) => setRow({ ...row, stock_quantity: e.target.value })}
          className={`${cell} ${Number(row.stock_quantity) === 0 ? 'text-rose-700' : ''}`}
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <button type="button" onClick={save} disabled={!dirty || busy} className={`${buttonClasses.primary} px-3 py-2`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="sr-only sm:not-sr-only">Save</span>
        </button>
        <button type="button" onClick={remove} disabled={!canDelete || busy} className={buttonClasses.ghost} title={canDelete ? 'Delete variant' : 'A product needs at least one variant'} aria-label="Delete variant">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

function VariantsEditor({ product, onChanged }) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const totalStock = product.product_variants.reduce((sum, v) => sum + v.stock_quantity, 0);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post(`/admin/products/${product.id}/variants`, {
        sku: draft.sku.trim(),
        size: draft.size.trim() || null,
        color: draft.color.trim() || null,
        price_override: toNumberOrNull(draft.price_override),
        stock_quantity: Number(draft.stock_quantity) || 0,
      });
      setDraft(null);
      onChanged();
    } catch (err) {
      showToast({ title: err.message || 'Could not add variant.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-foreground">Variants &amp; Inventory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {product.product_variants.length} variant{product.product_variants.length === 1 ? '' : 's'} · {totalStock} units in stock
          </p>
        </div>
        {!draft && (
          <button type="button" onClick={() => setDraft({ ...EMPTY_VARIANT })} className={buttonClasses.secondary}>
            <Plus className="h-4 w-4" /> Add Variant
          </button>
        )}
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">SKU</th>
              <th className="px-3 py-2 font-semibold">Size</th>
              <th className="px-3 py-2 font-semibold">Color</th>
              <th className="px-3 py-2 font-semibold">Price override</th>
              <th className="px-3 py-2 font-semibold">Stock</th>
              <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {product.product_variants.map((variant) => (
              <VariantRow
                key={`${variant.id}-${variant.sku}-${variant.stock_quantity}-${variant.price_override}-${variant.size}-${variant.color}`}
                variant={variant}
                basePrice={product.base_price}
                onChanged={onChanged}
                canDelete={product.product_variants.length > 1}
              />
            ))}
          </tbody>
        </table>
      </div>
      {draft && (
        <form onSubmit={create} className="mt-4 grid grid-cols-2 gap-2 rounded-md border border-dashed border-border p-3 md:grid-cols-6">
          {[
            ['sku', 'SKU *'],
            ['size', 'Size'],
            ['color', 'Color'],
            ['price_override', 'Price override'],
            ['stock_quantity', 'Stock'],
          ].map(([key, label]) => (
            <input
              key={key}
              aria-label={label}
              placeholder={label}
              required={key === 'sku'}
              type={key === 'price_override' || key === 'stock_quantity' ? 'number' : 'text'}
              min={key === 'price_override' || key === 'stock_quantity' ? '0' : undefined}
              step={key === 'price_override' ? '0.01' : undefined}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              className={inputClass}
            />
          ))}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={`${buttonClasses.primary} px-3`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
            </button>
            <button type="button" onClick={() => setDraft(null)} className={buttonClasses.ghost}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}

function ImagesEditor({ product, onChanged }) {
  const { showToast } = useToast();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const nextOrder = product.product_images.reduce((max, img) => Math.max(max, img.display_order + 1), 0);
      await post(`/admin/products/${product.id}/images`, { url: url.trim(), alt_text: product.name, display_order: nextOrder });
      setUrl('');
      onChanged();
    } catch (err) {
      showToast({ title: err.message || 'Could not add image.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (imageId) => {
    setBusy(true);
    try {
      await del(`/admin/images/${imageId}`);
      onChanged();
    } catch (err) {
      showToast({ title: err.message || 'Could not delete image.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-6 sm:p-8">
      <h2 className="font-display text-2xl text-foreground">Images</h2>
      <p className="mt-1 text-sm text-muted-foreground">The first image appears on product cards and at the top of the gallery.</p>
      {product.product_images.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No images yet — the store shows a placeholder.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {product.product_images.map((img, i) => (
            <li key={img.id} className="group relative overflow-hidden rounded-md border border-border">
              <img src={img.url} alt={img.alt_text ?? ''} onError={handleImageError(img.id)} className="aspect-square w-full object-cover" loading="lazy" />
              {i === 0 && (
                <span className="absolute left-2 top-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground">Primary</span>
              )}
              <button
                type="button"
                onClick={() => remove(img.id)}
                disabled={busy}
                className="absolute right-2 top-2 rounded-md bg-background/90 p-1.5 text-destructive opacity-100 shadow-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                aria-label="Delete image"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input type="url" required placeholder="https://… image URL" aria-label="New image URL" value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} />
        <button type="submit" disabled={busy || !url.trim()} className={buttonClasses.secondary}>
          <ImagePlus className="h-4 w-4" /> Add Image
        </button>
      </form>
    </section>
  );
}
