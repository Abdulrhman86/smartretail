-- ============================================================
-- 003: Switch the store's currency to Kuwaiti dinar
--
-- KWD is divided into 1000 fils, so money is quoted to three decimals rather
-- than two. Every monetary column widens from numeric(10,2) to numeric(10,3),
-- then existing amounts are converted at 3.25 USD = 1 KD.
--
-- The place_order() function from migration 001 casts to unqualified ::numeric,
-- so it picks up the new scale with no change needed.
-- ============================================================

begin;

-- 1. Widen the money columns -------------------------------------------------
alter table public.products          alter column base_price      type numeric(10,3);
alter table public.product_variants  alter column price_override  type numeric(10,3);

alter table public.orders
  alter column subtotal        type numeric(10,3),
  alter column discount_amount type numeric(10,3),
  alter column shipping_amount type numeric(10,3),
  alter column total_amount    type numeric(10,3);

alter table public.order_items
  alter column unit_price type numeric(10,3),
  alter column line_total type numeric(10,3);

alter table public.discounts
  alter column discount_value   type numeric(10,3),
  alter column min_order_amount type numeric(10,3);

-- 2. Convert existing amounts ------------------------------------------------
-- Catalogue prices snap to the nearest 250 fils so they read like shelf prices.
update public.products
   set base_price = round(base_price / 3.25 / 0.25) * 0.25
 where base_price is not null;

update public.product_variants
   set price_override = round(price_override / 3.25 / 0.25) * 0.25
 where price_override is not null;

-- Order rows are records of what was actually charged, so they convert exactly
-- rather than being re-rounded to shelf-price increments.
update public.orders
   set subtotal        = round(subtotal / 3.25, 3),
       discount_amount = round(coalesce(discount_amount, 0) / 3.25, 3),
       shipping_amount = round(coalesce(shipping_amount, 0) / 3.25, 3),
       total_amount    = round(total_amount / 3.25, 3);

update public.order_items
   set unit_price = round(unit_price / 3.25, 3),
       line_total = round(line_total / 3.25, 3);

-- A percentage discount is currency-independent: 20% off is 20% off. Only fixed
-- amounts and order minimums are money.
update public.discounts
   set discount_value = round(discount_value / 3.25, 3)
 where discount_type = 'fixed';

update public.discounts
   set min_order_amount = round(min_order_amount / 3.25, 3)
 where min_order_amount is not null and min_order_amount > 0;

-- The seeded fixed-amount codes convert to awkward figures (8 USD -> 2.462 KD), so round
-- them to amounts a store would actually advertise.
update public.discounts set discount_value = 2.500, min_order_amount = 12.500 where code = 'FREESHIP';
update public.discounts set discount_value = 7.500, min_order_amount = 37.500 where code = 'SUMMER25';
update public.discounts set min_order_amount = 30.000 where code = 'SAVE20';

commit;
