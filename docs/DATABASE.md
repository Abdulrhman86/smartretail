# SmartRetail — Database Reference

Supabase Postgres. Schema defined in [`database/schema.sql`](../database/schema.sql),
sample data in [`database/seed_data.sql`](../database/seed_data.sql).

## Tables

| Table | Purpose | Populated? |
|---|---|---|
| `categories` | Product categories, self-referencing (`parent_id`) for a 2-level hierarchy: 6 top-level, 18 subcategories | Yes |
| `products` | One row per product. Belongs to exactly one **subcategory** (never a top-level category directly) | Yes — 132 |
| `product_variants` | Purchasable size/color combos of a product. Stock is tracked per-variant, not per-product | Yes — 366 |
| `product_images` | Gallery images per product, linked by URL | Yes — 265 |
| `discounts` | Order-level coupon codes (percentage or fixed amount) | Yes — 4 sample codes |
| `profiles` | Extends `auth.users` with app-specific fields (name, avatar) | Yes — created on signup |
| `carts` | One active cart per authenticated user | Yes — created on first cart access |
| `cart_items` | Line items in a cart, referencing a variant | Yes |
| `orders` | A placed order, snapshots totals + shipping address | Yes — test orders from smoke-test users |
| `order_items` | Line items in an order — snapshots `product_name` and `unit_price` at purchase time, independent of the live product/variant | Yes |
| `reviews` | One review per user per product, 1–5 rating | Empty — API + UI exist since 2026-09-14 |

## Key relationships

- `categories.parent_id → categories.id` — self-reference. `null` = top-level category, otherwise it's a subcategory.
- `products.category_id → categories.id` — always points to a **leaf subcategory**, e.g. Apparel → Outerwear, not "Apparel" directly.
- `product_variants.product_id → products.id` — a product has 1+ variants. Even products without real size/color options (electronics, home goods) have at least one variant row, since stock is always tracked at the variant level.
- `cart_items.variant_id` / `order_items.variant_id → product_variants.id` — carts and orders always reference a specific variant, never a bare product.
- `orders.discount_id → discounts.id` — nullable. Discounts apply once per order, not per product.
- `orders.user_id`, `carts.user_id`, `reviews.user_id → auth.users.id` — all owned by a Supabase Auth user. There is currently **no guest checkout path**.

## Design decisions worth remembering

- **IDs are UUIDs everywhere**, not sequential integers — required to match `auth.users.id`, and prevents guessable/enumerable IDs (e.g. `/orders/1`, `/orders/2`).
- **Single category per product** (no tagging/multi-category) — deliberate simplification, confirmed with the project owner. Would need a `product_categories` join table to change later.
- **Order-level discounts only** — no per-product sale pricing.
- **`order_items` snapshots** `product_name` and `unit_price` — so a past order stays accurate even if the product is later edited, repriced, or deleted.
- **Variant attributes are fixed to `size` and `color` columns** (both nullable) rather than a generic attribute system. Adding a third fixed attribute later (e.g. material, storage capacity) is a simple `ALTER TABLE`, not a redesign.
- **Row Level Security is already enabled** on every table:
  - Public **read** access: `categories`, `products`, `product_variants`, `product_images`, active `discounts`, `reviews`.
  - **Owner-only** access (via `auth.uid()`): `profiles`, `carts`, `cart_items`, `orders`, `order_items`, and write access on `reviews`.
  - Your FastAPI backend can use the `service_role` key to bypass RLS entirely when it needs to (e.g. admin operations) — keep that key server-side only, never in frontend code.

## Roles & admin access

- There is no role column in the schema. The admin role is stored in **Supabase Auth `app_metadata.role`** (`"admin"`), which only the service_role key can write — users can't grant it to themselves.
- Grant it with `python backend/scripts/make_admin.py <email>` (or from the Admin → Customers page once you're an admin).

## Order lifecycle & stock

- Statuses: `pending → paid → shipped → delivered`; `pending`/`paid` can also go to `cancelled`. Customers can cancel only `pending` orders.
- Placing an order decrements `product_variants.stock_quantity`; cancelling restores it.
- `discounts.uses_count` is incremented when an order using the code is placed (cancellation does not give the use back).
- `orders.shipping_address` is JSON with keys `full_name, street_address, suite_unit?, city, state?, postal_code, country, phone?, delivery_notes?` (older test orders use `street`/`zip`).

## Migrations

Run in the Supabase SQL editor, in order, after `schema.sql` + `seed_data.sql`:

| File | What it does | Status |
|---|---|---|
| `migrations/001_atomic_orders.sql` | `place_order()` and `adjust_variant_stock()` functions so ordering/cancelling are single transactions (backend auto-detects them) | Applied (verified 2026-09-15) |
| `migrations/002_quality_of_life.sql` | `updated_at` triggers, auto-create `profiles` on signup (+ backfill), trigram search + FK indexes | Applied (verified 2026-09-15) |
| `migrations/003_kuwaiti_dinar.sql` | Widens every money column to `numeric(10,3)` and converts amounts from USD to Kuwaiti dinar at 3.25 | Applied (2026-09-15) |

## Credentials

From Supabase dashboard → Project Settings → API:
- **Project URL**
- **anon public key** — safe for frontend use, respects RLS
- **service_role key** — full access, bypasses RLS, backend-only, never expose it

## Known limitations

- Money is stored in Kuwaiti dinar at three decimals. `schema.sql` and `seed_data.sql` still define USD at two decimals; migration 003 performs the conversion, so run the migrations after seeding.
- Product photos are Pexels images linked by URL, chosen per product type by `backend/scripts/fetch_product_images.py`. A fresh seed starts with placeholder images until that script is run.
