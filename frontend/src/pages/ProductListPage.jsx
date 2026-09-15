import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Loader2, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";

import { get, getWithTotal, toQuery } from "../api/client";
import ProductCard, { ProductCardSkeleton } from "../components/ProductCard";
import useDocumentTitle from "../hooks/useDocumentTitle";

const PAGE_SIZE = 20;

// Curated top-level tabs; `slug` is the real category slug (backend includes subcategories).
const PRESET_CATEGORIES = [
  { slug: "", label: "All Products" },
  { slug: "apparel", label: "Apparel" },
  { slug: "footwear", label: "Footwear" },
  { slug: "accessories", label: "Accessories" },
  { slug: "home-kitchen", label: "Home Goods" },
  { slug: "electronics", label: "Electronics" },
  { slug: "beauty-personal-care", label: "Beauty" },
];

// Old links used short ids (e.g. ?category=home-goods) — keep them working.
const CATEGORY_ALIASES = { "home-goods": "home-kitchen", beauty: "beauty-personal-care" };

const SORT_OPTIONS = [
  { value: "newest", label: "Newest Arrivals" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Alphabetical: A-Z" },
  { value: "name-desc", label: "Alphabetical: Z-A" },
];

const PRICE_RANGES = [
  { id: "", label: "Any price" },
  { id: "0-50", label: "Under $50", min: 0, max: 50 },
  { id: "50-100", label: "$50 – $100", min: 50, max: 100 },
  { id: "100-150", label: "$100 – $150", min: 100, max: 150 },
  { id: "150-", label: "$150 & up", min: 150 },
];

export default function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawCategory = searchParams.get("category") || "";
  const currentCategory = CATEGORY_ALIASES[rawCategory] || rawCategory;
  const currentSort = SORT_OPTIONS.some((o) => o.value === searchParams.get("sort")) ? searchParams.get("sort") : "newest";
  const currentSearch = searchParams.get("search") || "";
  const currentPrice = searchParams.get("price") || "";

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState(currentSearch);
  const requestId = useRef(0);

  // Keep the input in sync when search changes from elsewhere (e.g. header search).
  useEffect(() => setSearchInput(currentSearch), [currentSearch]);

  useEffect(() => {
    get("/categories")
      .then((data) => Array.isArray(data) && setCategories(data))
      .catch(() => {});
  }, []);

  const selectedCategory = categories.find((c) => c.slug === currentCategory);
  const topLevelSlug = selectedCategory?.parent_id
    ? categories.find((c) => c.id === selectedCategory.parent_id)?.slug
    : currentCategory;
  const topLevel = categories.find((c) => c.slug === topLevelSlug);
  const subcategories = useMemo(
    () => (topLevel ? categories.filter((c) => c.parent_id === topLevel.id) : []),
    [categories, topLevel],
  );

  const pageTitle = selectedCategory?.name || (currentSearch ? `Results for “${currentSearch}”` : "Shop");
  useDocumentTitle(selectedCategory?.name || "Shop");

  const queryParams = useMemo(() => {
    const range = PRICE_RANGES.find((r) => r.id === currentPrice);
    return {
      category: currentCategory,
      search: currentSearch.trim(),
      sort: currentSort,
      min_price: range?.min,
      max_price: range?.max,
      limit: PAGE_SIZE,
    };
  }, [currentCategory, currentSearch, currentSort, currentPrice]);

  // Fetch the first page whenever filters change. requestId drops stale responses
  // when filters change faster than the network responds.
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    getWithTotal(`/products${toQuery({ ...queryParams, offset: 0 })}`)
      .then(({ data, total: count }) => {
        if (id !== requestId.current) return;
        setProducts(data);
        setTotal(count);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        setProducts([]);
        setTotal(0);
        setError(err.message || "Failed to load products.");
      })
      .finally(() => id === requestId.current && setLoading(false));
  }, [queryParams]);

  const loadMore = async () => {
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const { data, total: count } = await getWithTotal(`/products${toQuery({ ...queryParams, offset: products.length })}`);
      if (id !== requestId.current) return;
      setProducts((prev) => [...prev, ...data.filter((p) => !prev.some((q) => q.id === p.id))]);
      setTotal(count);
    } catch (err) {
      setError(err.message || "Failed to load more products.");
    } finally {
      setLoadingMore(false);
    }
  };

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    updateParam("search", searchInput.trim());
  };

  const hasFilters = currentCategory || currentSearch || currentPrice;
  const hasMore = products.length < total;

  return (
    <>
      {/* Page Title & Subtitle Hero Banner */}
      <section className="pt-24 pb-8 sm:pt-28 sm:pb-10 border-b border-border/60 bg-secondary/15">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase mb-2">
                {topLevel && selectedCategory?.parent_id ? topLevel.name : "Catalog"}
              </p>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight text-foreground">
                {pageTitle}
              </h1>
              <p className="mt-3 max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed">
                {selectedCategory?.description ||
                  "Thoughtfully designed essentials for elevated living. Discover crafted apparel, refined footwear, and modern home goods."}
              </p>
            </div>
            <div className="text-xs text-muted-foreground sm:text-right" aria-live="polite">
              {!loading && (
                <span>
                  Showing {products.length} of {total} {total === 1 ? "product" : "products"}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Catalog Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Filter Bar & Search */}
        <div className="flex flex-col gap-5 mb-8 lg:mb-12">
          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {PRESET_CATEGORIES.map((cat) => {
              const isActive = (topLevelSlug || "") === cat.slug;
              return (
                <button
                  key={cat.slug || "all"}
                  type="button"
                  onClick={() => updateParam("category", cat.slug)}
                  className={`whitespace-nowrap px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-brand text-brand-foreground shadow-sm"
                      : "bg-background border border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Subcategory chips */}
          {subcategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <button
                type="button"
                onClick={() => updateParam("category", topLevel.slug)}
                className={`cursor-pointer transition-colors ${
                  currentCategory === topLevel.slug ? "font-semibold text-foreground underline underline-offset-8" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All {topLevel.name}
              </button>
              {subcategories.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => updateParam("category", sub.slug)}
                  className={`cursor-pointer transition-colors ${
                    currentCategory === sub.slug ? "font-semibold text-foreground underline underline-offset-8" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {sub.name}
                </button>
              ))}
            </div>
          )}

          {/* Search, Price and Sort Row */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md" role="search">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search products, brands..."
                aria-label="Search products"
                className="w-full rounded-md border border-border bg-background pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    updateParam("search", "");
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="relative">
                <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <select
                  value={currentPrice}
                  onChange={(e) => updateParam("price", e.target.value)}
                  aria-label="Filter by price"
                  className="appearance-none rounded-md border border-border bg-background pl-9 pr-9 py-2.5 text-xs sm:text-sm font-medium text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {PRICE_RANGES.map((r) => (
                    <option key={r.id || "any"} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>

              <label htmlFor="sort-select" className="text-xs uppercase tracking-wider text-muted-foreground font-medium hidden sm:inline">
                Sort by:
              </label>
              <div className="relative">
                <select
                  id="sort-select"
                  value={currentSort}
                  onChange={(e) => updateParam("sort", e.target.value)}
                  className="appearance-none rounded-md border border-border bg-background pl-3.5 pr-9 py-2.5 text-xs sm:text-sm font-medium text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </div>
        </div>

        {error && !loading && products.length > 0 && (
          <p className="mb-6 rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center border border-dashed border-border rounded-xl bg-secondary/10 px-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-4">
              <Sparkles className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <h3 className="font-display text-2xl font-medium text-foreground">
              {error ? "We couldn't load the catalog" : "No products found"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">
              {error
                ? error
                : "We couldn't find any items matching your selected criteria. Try adjusting your search query or selecting another category."}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearchParams({});
                }}
                className="mt-6 rounded-md bg-brand px-5 py-2.5 text-xs sm:text-sm font-semibold text-brand-foreground shadow-sm transition-opacity hover:opacity-90 cursor-pointer"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {hasMore && (
              <div className="mt-12 sm:mt-16 text-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-8 py-3 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-muted cursor-pointer"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span>Loading more products...</span>
                    </>
                  ) : (
                    <span>Load More Products ({total - products.length} remaining)</span>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
