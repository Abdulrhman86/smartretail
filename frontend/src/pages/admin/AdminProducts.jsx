import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Package, Plus, Search } from 'lucide-react';
import { get, getWithTotal, toQuery } from '../../api/client';
import { EmptyState, ErrorBanner, PageHeading, Pagination, buttonClasses, inputClass, selectClass } from '../../components/ui';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatPriceRange } from '../../lib/format';
import { fallbackImageFor, handleImageError } from '../../lib/images';

const PAGE_SIZE = 25;

export default function AdminProducts() {
  useDocumentTitle('Products · Admin');
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? 'all';
  const stock = params.get('stock') ?? 'all';
  const categoryId = params.get('category_id') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const offset = Number(params.get('offset') ?? 0) || 0;

  const [searchInput, setSearchInput] = useState(search);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => setSearchInput(search), [search]);

  useEffect(() => {
    get('/categories').then(setCategories).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setError('');
    try {
      const { data, total: count } = await getWithTotal(
        `/admin/products${toQuery({ search, status, stock, category_id: categoryId, sort, limit: PAGE_SIZE, offset })}`,
      );
      if (id !== requestId.current) return;
      setProducts(data);
      setTotal(count);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.message || 'Could not load products.');
      setProducts([]);
    }
  }, [search, status, stock, categoryId, sort, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    if (key !== 'offset') next.delete('offset');
    setParams(next);
  };

  const topLevel = categories.filter((c) => !c.parent_id);

  return (
    <div>
      <PageHeading
        eyebrow="Catalog"
        title="Products"
        actions={
          <Link to="/admin/products/new" className={buttonClasses.primary}>
            <Plus className="h-4 w-4" /> New Product
          </Link>
        }
      >
        Manage product details, pricing, variants and inventory.
      </PageHeading>

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setParam('search', searchInput.trim());
          }}
          role="search"
        >
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, brand or slug…"
            className={`${inputClass} pl-10`}
            aria-label="Search products"
          />
        </form>
        <div className="flex flex-wrap gap-3">
          <select value={categoryId} onChange={(e) => setParam('category_id', e.target.value)} className={selectClass} aria-label="Category">
            <option value="">All categories</option>
            {topLevel.map((parent) => (
              <optgroup key={parent.id} label={parent.name}>
                <option value={parent.id}>All {parent.name}</option>
                {categories
                  .filter((c) => c.parent_id === parent.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </optgroup>
            ))}
          </select>
          <select value={status} onChange={(e) => setParam('status', e.target.value)} className={selectClass} aria-label="Status">
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Archived</option>
          </select>
          <select value={stock} onChange={(e) => setParam('stock', e.target.value)} className={selectClass} aria-label="Stock">
            <option value="all">Any stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
          <select value={sort} onChange={(e) => setParam('sort', e.target.value)} className={selectClass} aria-label="Sort">
            <option value="newest">Newest</option>
            <option value="name-asc">Name A–Z</option>
            <option value="price-asc">Price low–high</option>
            <option value="price-desc">Price high–low</option>
          </select>
        </div>
      </div>

      <ErrorBanner message={error} onRetry={load} />

      {products === null ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : products.length === 0 && !error ? (
        <EmptyState icon={Package} title="No products match" action={<Link to="/admin/products/new" className={buttonClasses.primary}>Create a product</Link>}>
          Try clearing filters or searching for something else.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Stock</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link to={`/admin/products/${p.id}`} className="flex items-center gap-3">
                        <img
                          src={p.image_url || fallbackImageFor(p.id)}
                          onError={handleImageError(p.id)}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-md border border-border object-cover"
                          loading="lazy"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground hover:underline">{p.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{p.brand || '—'} · {p.variant_count} variant{p.variant_count === 1 ? '' : 's'}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.category_name}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{formatPriceRange(p.min_price, p.max_price)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                          p.total_stock === 0 ? 'bg-rose-50 text-rose-700' : p.total_stock <= 5 ? 'bg-amber-50 text-amber-800' : 'text-muted-foreground'
                        }`}
                      >
                        {p.total_stock === 0 ? 'Out of stock' : p.total_stock}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset ${
                          p.is_active ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' : 'bg-muted text-muted-foreground ring-border'
                        }`}
                      >
                        {p.is_active ? 'Active' : 'Archived'}
                      </span>
                    </td>
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
