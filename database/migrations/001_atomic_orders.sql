-- SmartRetail — Migration 001: atomic order placement & stock adjustment
-- Run in the Supabase SQL Editor (safe to re-run: uses CREATE OR REPLACE).
--
-- Why: without this, POST /orders runs as several separate API writes. The backend has a
-- careful fallback (conditional updates + compensating rollbacks), but only a single
-- database transaction guarantees that stock, discount usage, the order and the cart
-- change together or not at all. The backend detects these functions automatically.

-- ------------------------------------------------------------
-- place_order: reserve stock, consume discount, insert order + items, clear ordered cart items
-- p_order: {subtotal, discount_amount, shipping_amount, total_amount, shipping_address}
-- p_items: [{cart_item_id, variant_id, sku, product_name, variant_label, unit_price, quantity, line_total}]
-- ------------------------------------------------------------
create or replace function public.place_order(
  p_user_id uuid,
  p_order jsonb,
  p_items jsonb,
  p_discount_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_rows int;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'EMPTY_CART' using errcode = 'P0001';
  end if;

  -- Reserve stock. The conditional UPDATE takes a row lock, so concurrent orders for the
  -- last unit serialize and the loser sees 0 rows updated.
  for v_item in select * from jsonb_array_elements(p_items) loop
    update public.product_variants
       set stock_quantity = stock_quantity - (v_item->>'quantity')::int
     where id = (v_item->>'variant_id')::uuid
       and stock_quantity >= (v_item->>'quantity')::int;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'INSUFFICIENT_STOCK:%', coalesce(v_item->>'sku', v_item->>'variant_id') using errcode = 'P0001';
    end if;
  end loop;

  if p_discount_id is not null then
    update public.discounts
       set uses_count = uses_count + 1
     where id = p_discount_id
       and is_active
       and (max_uses is null or uses_count < max_uses);
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'DISCOUNT_EXHAUSTED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.orders (user_id, status, subtotal, discount_id, discount_amount, shipping_amount, total_amount, shipping_address)
  values (
    p_user_id,
    'pending',
    (p_order->>'subtotal')::numeric,
    p_discount_id,
    coalesce((p_order->>'discount_amount')::numeric, 0),
    coalesce((p_order->>'shipping_amount')::numeric, 0),
    (p_order->>'total_amount')::numeric,
    p_order->'shipping_address'
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, variant_id, product_name, variant_label, unit_price, quantity, line_total)
  select v_order_id,
         (i->>'variant_id')::uuid,
         i->>'product_name',
         i->>'variant_label',
         (i->>'unit_price')::numeric,
         (i->>'quantity')::int,
         (i->>'line_total')::numeric
    from jsonb_array_elements(p_items) as i;

  -- Only remove the cart rows that were ordered; items added meanwhile stay in the cart.
  delete from public.cart_items
   where id in (select (i->>'cart_item_id')::uuid from jsonb_array_elements(p_items) as i)
     and cart_id in (select id from public.carts where user_id = p_user_id);

  return v_order_id;
end;
$$;

-- ------------------------------------------------------------
-- adjust_variant_stock: atomic stock += delta (never below zero). Used when cancelling orders.
-- ------------------------------------------------------------
create or replace function public.adjust_variant_stock(p_variant_id uuid, p_delta int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  update public.product_variants
     set stock_quantity = stock_quantity + p_delta
   where id = p_variant_id
     and stock_quantity + p_delta >= 0;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- SECURITY DEFINER functions are callable through the public API by default. These must only
-- be callable by the backend (service_role), never by anon/authenticated clients.
revoke all on function public.place_order(uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.adjust_variant_stock(uuid, int) from public, anon, authenticated;
grant execute on function public.place_order(uuid, jsonb, jsonb, uuid) to service_role;
grant execute on function public.adjust_variant_stock(uuid, int) to service_role;

-- Ask PostgREST to pick up the new functions immediately.
notify pgrst, 'reload schema';
