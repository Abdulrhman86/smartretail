# SmartRetail

A full-stack e-commerce store built as a portfolio project: a real product catalog, cart, checkout with discount codes and shipping rules, customer accounts with order history, product reviews, and an admin console for managing products, inventory, orders, discounts and users.

An AI shopping assistant (Gemini function-calling over the catalog) is the next planned feature.

**Stack:** React 18 + Vite + Tailwind CSS v4 · FastAPI (Python 3.11) · Supabase (Postgres + Auth) · planned deploy on Vercel (frontend) + Render (backend) — all free tier.

---

## Features

**Storefront**
- Home page with live "New Arrivals" and department links
- Catalog with server-side search (multi-word), department/subcategory filters, price ranges, sorting and pagination
- Product pages with size/color variant selection, per-variant stock, image gallery, reviews and related products
- Cart with live stock warnings, free-shipping progress and server-computed totals
- Checkout with a server-side price quote (shipping method + discount code), validated before the order is placed
- Account area: profile, order history, order detail with status progress, cancel pending orders
- Help / FAQ / policies page and a 404 page; responsive down to phone width

**Admin console** (`/admin`, admin role required)
- Dashboard: revenue, 14-day revenue chart, orders by status, recent orders, low-stock alerts
- Products: search/filter/sort, create with variants & images, edit details, manage variants (SKU/size/color/price/stock) and images, archive/restore
- Orders: filter by status, search by customer email or order #, status workflow (pending → paid → shipped → delivered, or cancel with automatic restock)
- Categories (two-level hierarchy), discount codes (percentage/fixed, minimums, usage caps, expiry), customers & admin roles

**Backend**
- Supabase JWT auth with token refresh; admin role stored in Supabase `app_metadata` (users can't grant it to themselves)
- Ownership checks on every cart/order operation
- Stock-safe ordering: an atomic Postgres function when `database/migrations/001` is applied, otherwise conditional updates with compensating rollbacks
- 82-check smoke test suite against the live database that cleans up after itself

---

## Project structure

```
smartretail/
├── backend/            FastAPI app (see backend/app), smoke tests, admin script
├── frontend/           React + Vite app
├── database/           schema.sql, seed_data.sql, migrations/
└── docs/               database reference
```

---

## Running locally

### 1. Database (Supabase)

1. Create a Supabase project.
2. In the SQL Editor, run `database/schema.sql`, then `database/seed_data.sql`.
3. Recommended: run `database/migrations/001_atomic_orders.sql` and `002_quality_of_life.sql`.

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env              # then fill in your Supabase URL + keys
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env              # VITE_API_URL=http://localhost:8000
npm run dev
```

Open http://localhost:5173

### 4. Make yourself an admin

Sign up on the site, then:

```bash
cd backend
python scripts/make_admin.py you@example.com
```

Sign out and back in; "Admin Dashboard" appears in the account menu.

### 5. Tests

```bash
cd backend
python smoke_test.py
```

Runs against the configured Supabase project. It uses dedicated test accounts and removes/restores everything it touches.

---

## API overview

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Auth | `POST /auth/signup` · `POST /auth/login` · `POST /auth/refresh` · `GET /auth/me` · `PATCH /auth/me` |
| Catalog | `GET /products` (search, category, brand, min/max price, sort, limit/offset; `X-Total-Count` header) · `GET /products/{id}` · `GET /categories` · `GET /brands` |
| Reviews | `GET /products/{id}/reviews` · `PUT /products/{id}/reviews/me` · `DELETE /products/{id}/reviews/me` |
| Cart | `GET /cart` · `DELETE /cart` · `POST /cart/items` · `PATCH /cart/items/{id}` · `DELETE /cart/items/{id}` |
| Orders | `POST /orders/quote` · `POST /orders` · `GET /orders` · `GET /orders/{id}` · `POST /orders/{id}/cancel` |
| Admin | `GET /admin/stats` · products, variants, images, categories, orders, discounts and users CRUD under `/admin/*` |
| Assistant | `POST /assistant/chat` (shoppers) · `POST /admin/assistant/chat` · `POST /admin/assistant/confirm` (admins) |

The assistants use Gemini function calling. The shopper's assistant searches the catalogue and can add to their own cart; the admin's answers sales/stock/customer questions from live queries and can *propose* changes (archive a product, restock a variant) that only run once the admin confirms them. Both are rate-limited per user, and the API returns structured products/reports so the UI renders real figures rather than the model's formatting.

Pricing rules (backend `app/pricing.py`): standard shipping $5.99, free from a $50 subtotal; express $14.99; discount codes are order-level and validated for active dates, usage limits and minimum subtotal.

---

## Environment variables

**backend/.env**

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only; bypasses RLS |
| `SUPABASE_ANON_KEY` | yes | Used for sign-up / login / refresh |
| `GEMINI_API_KEY` | for the assistant | Free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Without it the assistant endpoints return 503; everything else works. |
| `GEMINI_MODEL` | no | Default `gemini-3.5-flash-lite` (chosen for free-tier rate limits) |
| `ALLOWED_ORIGINS` | production | Comma-separated frontend origins for CORS (defaults to `*`) |
| `SUPABASE_TIMEOUT_SECONDS` | no | Default 15 |

**frontend/.env**

| Variable | Notes |
|---|---|
| `VITE_API_URL` | Backend base URL |

---

## Status

The storefront, backend API, authentication, admin console and AI assistants are complete. See [docs/DATABASE.md](docs/DATABASE.md) for the schema reference.

> SmartRetail is a demo — no real payments are processed and orders are not fulfilled.
