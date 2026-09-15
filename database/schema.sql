-- SmartRetail — Database Schema
-- Target: Supabase (Postgres). Run via SQL Editor or `supabase db push`.
-- Assumes Supabase Auth is enabled (auth.users table exists).

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ============================================================
-- PROFILES  (1:1 extension of auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CATEGORIES
-- ============================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete set null,
  name text not null unique,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);
create index idx_categories_parent on public.categories(parent_id);

-- ============================================================
-- PRODUCTS
-- ============================================================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text,
  brand text,
  base_price numeric(10,2) not null check (base_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_category on public.products(category_id);
create index idx_products_active on public.products(is_active) where is_active = true;

-- ============================================================
-- PRODUCT_VARIANTS
-- Each purchasable unit (size/color combo). stock is tracked per-variant.
-- For products with no meaningful size/color (e.g. electronics), size/color
-- can be null and there's a single variant per product.
-- ============================================================
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  size text,
  color text,
  price_override numeric(10,2) check (price_override >= 0), -- null = use product.base_price
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  image_url text,
  created_at timestamptz not null default now(),
  unique (product_id, size, color)
);
create index idx_variants_product on public.product_variants(product_id);

-- ============================================================
-- PRODUCT_IMAGES  (general gallery, not tied to a specific variant)
-- ============================================================
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt_text text,
  display_order integer not null default 0
);
create index idx_images_product on public.product_images(product_id);

-- ============================================================
-- CARTS  (one active cart per user)
-- ============================================================
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CART_ITEMS
-- ============================================================
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  added_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);
create index idx_cart_items_cart on public.cart_items(cart_id);

-- ============================================================
-- DISCOUNTS  (order-level coupon codes)
-- ============================================================
create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type text not null check (discount_type in ('percentage','fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  min_order_amount numeric(10,2) not null default 0,
  max_uses integer,
  uses_count integer not null default 0,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  is_active boolean not null default true
);

-- ============================================================
-- ORDERS
-- ============================================================
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending','paid','shipped','delivered','cancelled')),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  discount_id uuid references public.discounts(id) on delete set null,
  discount_amount numeric(10,2) not null default 0,
  shipping_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null check (total_amount >= 0),
  shipping_address jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_orders_user on public.orders(user_id);
create index idx_orders_status on public.orders(status);

-- ============================================================
-- ORDER_ITEMS
-- Snapshots product_name / variant_label + unit_price at time of purchase,
-- so historical orders stay accurate even if the product changes later.
-- ============================================================
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_label text,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(10,2) not null check (line_total >= 0)
);
create index idx_order_items_order on public.order_items(order_id);

-- ============================================================
-- REVIEWS  (one review per user per product)
-- ============================================================
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  title text,
  body text,
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index idx_reviews_product on public.reviews(product_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- Supabase enables RLS-capable auth automatically; policies must be added
-- explicitly or these tables are unreachable via the anon/authenticated
-- client roles (only the service role, which the FastAPI backend uses,
-- bypasses RLS).
-- ============================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.discounts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews enable row level security;

-- Public read on catalog data
create policy "categories are publicly readable" on public.categories for select using (true);
create policy "products are publicly readable" on public.products for select using (true);
create policy "variants are publicly readable" on public.product_variants for select using (true);
create policy "images are publicly readable" on public.product_images for select using (true);
create policy "active discounts are publicly readable" on public.discounts for select using (is_active = true);
create policy "reviews are publicly readable" on public.reviews for select using (true);

-- Owner-only access on personal data
create policy "users manage their own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "users manage their own cart" on public.carts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage their own cart items" on public.cart_items
  for all using (auth.uid() = (select user_id from public.carts where id = cart_id))
  with check (auth.uid() = (select user_id from public.carts where id = cart_id));
create policy "users view their own orders" on public.orders
  for select using (auth.uid() = user_id);
create policy "users create their own orders" on public.orders
  for insert with check (auth.uid() = user_id);
create policy "users view their own order items" on public.order_items
  for select using (auth.uid() = (select user_id from public.orders where id = order_id));
create policy "users manage their own reviews" on public.reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);