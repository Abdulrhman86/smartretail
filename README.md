# SmartRetail

An online store with AI built into both sides of the counter.

Shoppers browse a real catalogue — variants, stock, reviews, cart, checkout with discount codes and shipping rules — and can just *ask* for what they want: "waterproof pants under KD 20" returns real product cards, not a chatbot's guess at the price. Staff get an admin console plus an analytics assistant that answers "which products aren't selling?" or "how did we do this month?" from live queries, and can propose inventory changes that a human approves before anything happens.

**Stack:** React 18 · Vite · Tailwind CSS v4 · FastAPI (Python 3.11) · Supabase (Postgres + Auth) · Gemini function calling · deployed on Vercel + Render.

> SmartRetail is a demonstration store: no payments are processed and no orders are fulfilled.

---

## Features

**Storefront**
- Home page with live "New Arrivals" and department links
- Catalogue with server-side search (multi-word), department/subcategory filters, price ranges, sorting and pagination
- Product pages with size/colour variant selection, per-variant stock, image gallery, reviews and related products
- Cart with live stock warnings, free-shipping progress and server-computed totals
- Checkout with a server-side price quote (shipping method + discount code), validated before the order is placed
- Account area: profile, order history, order detail with status progress, cancel pending orders
- Prices in Kuwaiti dinar, with an optional US dollar view
- Help / FAQ / policies page and a 404 page; responsive down to phone width

**AI assistants** — two surfaces, one tool-calling engine, separate tool sets and permissions
- *Shopping assistant* (floating panel, storefront): searches the catalogue, compares variants, checks stock, adds to the cart and looks up the shopper's own orders
- *Admin assistant* (`/admin/assistant`): revenue and trend reports, underperforming products ranked by trapped stock value, best sellers, low stock, top customers, discount performance
- Admin actions are **proposed, never executed** — archiving a product or restocking a variant returns a confirmation card, and only runs once the admin approves it
- Replies carry structured data, so the UI renders real product cards and report tables instead of trusting the model to format figures

**Admin console** (`/admin`, admin role required)
- Dashboard: revenue, 14-day revenue chart, orders by status, recent orders, low-stock alerts
- Products: search/filter/sort, create with variants & images, edit details, manage variants (SKU/size/colour/price/stock) and images, archive/restore
- Orders: filter by status, search by customer email or order #, status workflow (pending → paid → shipped → delivered, or cancel with automatic restock)
- Categories (two-level hierarchy), discount codes (percentage/fixed, minimums, usage caps, expiry), customers & admin roles

---

## Technical notes

A few decisions worth knowing if you're reading the code:

- **One source of truth for money.** `app/pricing.py` computes shipping and discounts for both `POST /orders/quote` and `POST /orders`, so the total shown at checkout is always the total charged. `app/catalog.py` does the same for catalogue filtering, shared by `GET /products` and the assistant's search tool.
- **Orders are stock-safe.** Placement runs in an atomic Postgres function (`place_order`), with a fallback path using conditional updates and compensating rollbacks if it isn't deployed. Stock is reserved before a discount is consumed.
- **Privilege can't be self-granted.** The admin role lives in Supabase Auth `app_metadata`, which only the service-role key can write.
- **Ownership, not just authentication.** Every cart and order operation verifies the row belongs to the caller; other users' rows return 404 rather than 403, so ids can't be probed.
- **The model never touches the database directly.** It can only call declared tools, each of which re-validates its arguments, so a hallucinated id fails cleanly.
- **Currency.** Everything is stored and charged in Kuwaiti dinar at three decimals (1000 fils). The dollar view is a fixed-rate display conversion and says so at checkout.

---

## Project structure

```
smartretail/
├── backend/            FastAPI app (see backend/app), smoke tests, scripts
├── frontend/           React + Vite app
├── database/           schema.sql, seed_data.sql, migrations/
├── docs/               database reference
└── render.yaml         backend deployment blueprint
```

---

## Running locally

### 1. Database (Supabase)

1. Create a Supabase project.
2. In the SQL Editor run `database/schema.sql`, then `database/seed_data.sql`.
3. Run the migrations in order: `001_atomic_orders.sql`, `002_quality_of_life.sql`, `003_kuwaiti_dinar.sql`.

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

88 checks against the configured Supabase project, covering auth, catalogue, cart ownership, quote/order maths, stock and discount accounting, the admin surface and the assistant endpoints. It uses dedicated test accounts and restores everything it touches.

---

## API overview

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Auth | `POST /auth/signup` · `POST /auth/login` · `POST /auth/refresh` · `GET /auth/me` · `PATCH /auth/me` |
| Catalogue | `GET /products` (search, category, brand, min/max price, sort, limit/offset; `X-Total-Count` header) · `GET /products/{id}` · `GET /categories` · `GET /brands` |
| Reviews | `GET /products/{id}/reviews` · `PUT /products/{id}/reviews/me` · `DELETE /products/{id}/reviews/me` |
| Cart | `GET /cart` · `DELETE /cart` · `POST /cart/items` · `PATCH /cart/items/{id}` · `DELETE /cart/items/{id}` |
| Orders | `POST /orders/quote` · `POST /orders` · `GET /orders` · `GET /orders/{id}` · `POST /orders/{id}/cancel` |
| Admin | `GET /admin/stats` · products, variants, images, categories, orders, discounts and users CRUD under `/admin/*` |
| Assistant | `POST /assistant/chat` (shoppers) · `POST /admin/assistant/chat` · `POST /admin/assistant/confirm` (admins) |

Both assistants are rate-limited per user, and conversation history is held client-side so the API stays stateless.

Pricing rules (`backend/app/pricing.py`): standard shipping KD 1.750, free from a KD 15.000 subtotal; express KD 4.500. Discount codes are order-level and validated for active dates, usage limits and minimum subtotal.

---

## Environment variables

**backend/.env**

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only; bypasses RLS |
| `SUPABASE_ANON_KEY` | yes | Used for sign-up / login / refresh |
| `GEMINI_API_KEY` | for the assistants | Free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Without it the assistant endpoints return 503; everything else works. |
| `GEMINI_MODEL` | no | Default `gemini-3.5-flash-lite`, chosen for free-tier rate limits |
| `ALLOWED_ORIGINS` | production | Comma-separated frontend origins for CORS (defaults to `*`) |
| `SUPABASE_TIMEOUT_SECONDS` | no | Default 15 |
| `PEXELS_API_KEY` | no | Only for `scripts/fetch_product_images.py`, which populates catalogue imagery |

**frontend/.env**

| Variable | Notes |
|---|---|
| `VITE_API_URL` | Backend base URL |

---

## Deployment

The backend deploys to Render from `render.yaml` (Blueprint), and the frontend to Vercel with **Root Directory** set to `frontend` — `frontend/vercel.json` adds the SPA rewrite so deep links survive a refresh.

Deploy the backend first, set `VITE_API_URL` on Vercel to its URL, then set `ALLOWED_ORIGINS` on Render to the Vercel URL. Each side needs the other's address, so it takes two passes.

Note that Render's free instances sleep after 15 minutes of inactivity, making the first request take 30–60 seconds, and Supabase pauses free projects after about a week idle.
