-- SmartRetail — Migration 002: triggers & indexes (optional, recommended)
-- Run in the Supabase SQL Editor after 001. Safe to re-run.
--
-- Nothing in the app depends on this migration; it makes the database do work the
-- backend currently does by hand, and speeds up common queries as the data grows.

-- ------------------------------------------------------------
-- 1. Keep updated_at current automatically
-- (the backend sets it explicitly on some updates; the trigger covers every path,
--  including edits made directly in the Supabase dashboard)
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_carts_updated_at on public.carts;
create trigger trg_carts_updated_at before update on public.carts
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 2. Create a profile row for every new auth user
-- (signup through the API already does this; the trigger also covers users created
--  in the dashboard or via future OAuth providers)
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any existing users that don't have one.
insert into public.profiles (id, full_name, avatar_url)
select u.id, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'avatar_url'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ------------------------------------------------------------
-- 3. Indexes for the queries the app actually runs
-- ------------------------------------------------------------
-- Catalog search uses ILIKE '%term%' on name/brand/description; trigram indexes make
-- those scans index-assisted instead of full table scans.
create extension if not exists pg_trgm;
create index if not exists idx_products_name_trgm on public.products using gin (name gin_trgm_ops);
create index if not exists idx_products_brand_trgm on public.products using gin (brand gin_trgm_ops);

-- Default catalog sort and order history sort.
create index if not exists idx_products_created_at on public.products (created_at desc);
create index if not exists idx_orders_user_created on public.orders (user_id, created_at desc);
create index if not exists idx_orders_created_at on public.orders (created_at desc);

-- Foreign keys PostgreSQL doesn't index automatically.
create index if not exists idx_cart_items_variant on public.cart_items (variant_id);
create index if not exists idx_order_items_variant on public.order_items (variant_id);
create index if not exists idx_orders_discount on public.orders (discount_id);
create index if not exists idx_reviews_user on public.reviews (user_id);

-- Low-stock dashboard widget.
create index if not exists idx_variants_stock on public.product_variants (stock_quantity);
