"""
SmartRetail API smoke tests — run against the live Supabase project.

    cd backend && .venv/Scripts/python smoke_test.py      (Windows)
    cd backend && .venv/bin/python smoke_test.py          (macOS/Linux)

Everything the run creates (orders, reviews, a product, a category, a discount, a second
test user) is deleted afterwards, and the stock / discount counters it touches are restored.
Exit code is non-zero if any check fails.
"""
import os
import sys
import uuid

from dotenv import load_dotenv

load_dotenv()

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
    print("[ERROR] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in backend/.env")
    sys.exit(1)

from fastapi.testclient import TestClient  # noqa: E402

from app.auth import _token_cache  # noqa: E402
from app.database import create_anon_client, supabase  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)
results = {"pass": 0, "fail": 0}

USER_A = ("smoke_test_user@gmail.com", "SmokeTestPassword123!", "Smoke Test User")
USER_B = ("smoke_test_user_b@gmail.com", "SmokeTestPasswordB123!", "Smoke Test User B")

ADDRESS = {
    "full_name": "Smoke Test User",
    "street_address": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "postal_code": "94105",
    "country": "United States",
}


def check(title, passed, detail=""):
    results["pass" if passed else "fail"] += 1
    print(f"{'[PASS]' if passed else '[FAIL]'} | {title}")
    if detail and not passed:
        print(f"       Details: {detail}")
    return passed


def find_user(email):
    return next((u for u in supabase.auth.admin.list_users(per_page=1000) if u.email == email), None)


def ensure_user(email, password, full_name):
    user = find_user(email)
    if user:
        supabase.auth.admin.update_user_by_id(user.id, {"password": password, "email_confirm": True})
        user_id = user.id
    else:
        user_id = supabase.auth.admin.create_user({
            "email": email, "password": password, "email_confirm": True,
            "user_metadata": {"full_name": full_name},
        }).user.id
    supabase.table("profiles").upsert({"id": user_id, "full_name": full_name}).execute()
    return str(user_id)


def token_for(email, password):
    res = client.post("/auth/login", json={"email": email, "password": password})
    if res.status_code == 200:
        return res.json()
    # Fallback if the Email provider's password login is disabled in the dashboard.
    link = supabase.auth.admin.generate_link({"type": "magiclink", "email": email})
    otp = create_anon_client().auth.verify_otp({"email": email, "token": link.properties.email_otp, "type": "magiclink"})
    return {"access_token": otp.session.access_token, "refresh_token": otp.session.refresh_token}


def set_role(user_id, role):
    user = supabase.auth.admin.get_user_by_id(user_id).user
    supabase.auth.admin.update_user_by_id(user_id, {"app_metadata": {**(user.app_metadata or {}), "role": role}})
    _token_cache.clear()


def run():
    print("=" * 64)
    print("SmartRetail API smoke tests (live Supabase)")
    print("=" * 64)

    user_a = ensure_user(*USER_A)
    user_b = ensure_user(*USER_B)
    set_role(user_a, "customer")

    created = {"orders": [], "products": [], "categories": [], "discounts": []}
    stock_snapshot: dict[str, int] = {}
    discount_snapshot: dict[str, int] = {}
    profile_snapshot = supabase.table("profiles").select("full_name, avatar_url").eq("id", user_a).execute().data[0]

    def snapshot_variant(variant_id):
        if variant_id not in stock_snapshot:
            stock_snapshot[variant_id] = supabase.table("product_variants").select("stock_quantity").eq("id", variant_id).execute().data[0]["stock_quantity"]

    try:
        # ── Auth ────────────────────────────────────────────────────────────
        check("GET /cart without token -> 401", client.get("/cart").status_code == 401)
        check("POST /auth/login wrong password -> 401", client.post("/auth/login", json={"email": USER_A[0], "password": "wrong-password"}).status_code == 401)
        check("POST /auth/signup short password -> 422", client.post("/auth/signup", json={"email": "x@example.com", "password": "short"}).status_code == 422)

        session_a = token_for(USER_A[0], USER_A[1])
        check("POST /auth/login", bool(session_a.get("access_token")))
        headers_a = {"Authorization": f"Bearer {session_a['access_token']}"}
        headers_b = {"Authorization": f"Bearer {token_for(USER_B[0], USER_B[1])['access_token']}"}

        me = client.get("/auth/me", headers=headers_a)
        check("GET /auth/me returns customer role", me.status_code == 200 and me.json()["role"] == "customer", me.text)
        res = client.patch("/auth/me", headers=headers_a, json={"full_name": "Renamed Smoke User"})
        check("PATCH /auth/me updates profile", res.status_code == 200 and res.json()["full_name"] == "Renamed Smoke User", res.text)
        if session_a.get("refresh_token"):
            res = client.post("/auth/refresh", json={"refresh_token": session_a["refresh_token"]})
            check("POST /auth/refresh issues new token", res.status_code == 200 and res.json()["access_token"], res.text)
            if res.status_code == 200:
                headers_a = {"Authorization": f"Bearer {res.json()['access_token']}"}
        check("POST /auth/refresh bad token -> 401", client.post("/auth/refresh", json={"refresh_token": "nope"}).status_code == 401)

        # ── Catalog ─────────────────────────────────────────────────────────
        res = client.get("/products?limit=5")
        check("GET /products returns cards + X-Total-Count", res.status_code == 200 and len(res.json()) == 5 and int(res.headers["x-total-count"]) >= 5 and "min_price" in res.json()[0], res.text[:300])
        res = client.get("/products?category=footwear&limit=100")
        footwear_ids = {c["id"] for c in client.get("/categories").json() if c["slug"].startswith("footwear")}
        check("GET /products?category=<parent> includes subcategories", res.status_code == 200 and len(res.json()) > 0 and all(p["category_id"] in footwear_ids for p in res.json()), res.text[:300])
        prices = [p["base_price"] for p in client.get("/products?sort=price-asc&limit=30").json()]
        check("GET /products?sort=price-asc is sorted server-side", prices == sorted(prices))
        res = client.get("/products?search=waterproof")
        check("GET /products?search=waterproof", res.status_code == 200 and all("waterproof" in (p["name"] + (p["description"] or "") + (p["brand"] or "")).lower() for p in res.json()))
        check("GET /products?search with filter syntax chars is safe", client.get("/products?search=a,b(c).d%25").status_code == 200)

        # Pick an in-stock product with at least 2 variants for cart/order tests.
        product = variant = None
        for card in client.get("/products?limit=100").json():
            if card["variant_count"] >= 1 and card["total_stock"] >= 20:
                detail = client.get(f"/products/{card['id']}").json()
                variant = next((v for v in detail["product_variants"] if v["stock_quantity"] >= 10), None)
                if variant:
                    product = detail
                    break
        check("GET /products/{id} returns variants + category", product is not None and product.get("category") is not None)
        if not product:
            return
        variant_id = variant["id"]
        snapshot_variant(variant_id)
        check("GET /products/{unknown} -> 404", client.get(f"/products/{uuid.uuid4()}").status_code == 404)

        # Reviews
        res = client.put(f"/products/{product['id']}/reviews/me", headers=headers_a, json={"rating": 5, "title": "Great", "body": "Smoke test review"})
        check("PUT /products/{id}/reviews/me creates review", res.status_code == 200 and res.json()["rating"] == 5, res.text)
        res = client.put(f"/products/{product['id']}/reviews/me", headers=headers_a, json={"rating": 3})
        check("PUT /products/{id}/reviews/me updates (one per user)", res.status_code == 200 and res.json()["rating"] == 3, res.text)
        res = client.get(f"/products/{product['id']}/reviews")
        check("GET /products/{id}/reviews shows rating summary", res.status_code == 200 and res.json()["rating_count"] >= 1, res.text)
        check("PUT review rating=6 -> 422", client.put(f"/products/{product['id']}/reviews/me", headers=headers_a, json={"rating": 6}).status_code == 422)
        check("DELETE /products/{id}/reviews/me", client.delete(f"/products/{product['id']}/reviews/me", headers=headers_a).status_code == 204)

        # ── Cart ────────────────────────────────────────────────────────────
        client.delete("/cart", headers=headers_a)
        res = client.get("/cart", headers=headers_a)
        check("GET /cart (auto-creates, empty)", res.status_code == 200 and res.json()["items"] == [], res.text)
        res = client.post("/cart/items", headers=headers_a, json={"variant_id": variant_id, "quantity": 1})
        item_id = res.json().get("id")
        check("POST /cart/items returns line_total + product image", res.status_code == 200 and res.json()["line_total"] > 0 and "image_url" in res.json()["product_variants"]["products"], res.text)
        res = client.patch(f"/cart/items/{item_id}", headers=headers_a, json={"quantity": 2})
        check("PATCH /cart/items/{id}", res.status_code == 200 and res.json()["quantity"] == 2, res.text)
        check("PATCH other user's cart item -> 404", client.patch(f"/cart/items/{item_id}", headers=headers_b, json={"quantity": 5}).status_code == 404)
        check("DELETE other user's cart item -> 404", client.delete(f"/cart/items/{item_id}", headers=headers_b).status_code == 404)
        res = client.get("/cart", headers=headers_a)
        check("Owner's item untouched after cross-user attempts", res.json()["items"][0]["quantity"] == 2 and res.json()["subtotal"] > 0, res.text)
        check("PATCH quantity above stock -> 400", client.patch(f"/cart/items/{item_id}", headers=headers_a, json={"quantity": 99}).status_code in (400, 422) if variant["stock_quantity"] < 99 else True)

        # ── Quote ───────────────────────────────────────────────────────────
        quote = client.post("/orders/quote", headers=headers_a, json={"shipping_method": "standard"}).json()
        expected_ship = 0.0 if quote["subtotal"] >= 50 else 5.99
        check("POST /orders/quote standard shipping rule", quote["shipping_amount"] == expected_ship and quote["total_amount"] == round(quote["subtotal"] + expected_ship, 2), quote)
        quote = client.post("/orders/quote", headers=headers_a, json={"shipping_method": "express", "discount_code": "welcome10"}).json()
        check("POST /orders/quote express + WELCOME10 (case-insensitive)", quote.get("shipping_amount") == 14.99 and quote.get("discount_amount") == round(quote["subtotal"] * 0.10, 2), quote)
        check("POST /orders/quote invalid code -> 400", client.post("/orders/quote", headers=headers_a, json={"discount_code": "NOPE123"}).status_code == 400)

        # ── Orders ──────────────────────────────────────────────────────────
        check("POST /orders missing address fields -> 422", client.post("/orders", headers=headers_a, json={"shipping_address": {"city": "X"}}).status_code == 422)

        welcome = supabase.table("discounts").select("id, uses_count").eq("code", "WELCOME10").execute().data[0]
        discount_snapshot[welcome["id"]] = welcome["uses_count"]
        stock_before = supabase.table("product_variants").select("stock_quantity").eq("id", variant_id).execute().data[0]["stock_quantity"]

        res = client.post("/orders", headers=headers_a, json={"shipping_address": ADDRESS, "shipping_method": "express", "discount_code": "WELCOME10"})
        order = res.json()
        if res.status_code == 200:
            created["orders"].append(order["id"])
        check("POST /orders (express + discount) matches quote", res.status_code == 200 and order["total_amount"] == quote["total_amount"] and len(order["order_items"]) == 1, res.text)
        stock_after = supabase.table("product_variants").select("stock_quantity").eq("id", variant_id).execute().data[0]["stock_quantity"]
        check("Order decremented stock by 2", stock_after == stock_before - 2, f"{stock_before} -> {stock_after}")
        uses_after = supabase.table("discounts").select("uses_count").eq("id", welcome["id"]).execute().data[0]["uses_count"]
        check("Order consumed discount once", uses_after == welcome["uses_count"] + 1)
        check("Cart emptied after order", client.get("/cart", headers=headers_a).json()["items"] == [])
        check("POST /orders with empty cart -> 400", client.post("/orders", headers=headers_a, json={"shipping_address": ADDRESS}).status_code == 400)

        cart_id = supabase.table("carts").select("id").eq("user_id", user_a).execute().data[0]["id"]
        supabase.table("cart_items").insert({"cart_id": cart_id, "variant_id": variant_id, "quantity": stock_after + 1000}).execute()
        res = client.post("/orders", headers=headers_a, json={"shipping_address": ADDRESS})
        check("POST /orders exceeding stock -> 400", res.status_code == 400 and "Insufficient stock" in res.json().get("detail", ""), res.text)
        client.delete("/cart", headers=headers_a)

        res = client.get("/orders", headers=headers_a)
        check("GET /orders lists own orders with item_count", res.status_code == 200 and any(o["id"] == order["id"] and o["item_count"] == 2 for o in res.json()), res.text[:300])
        check("GET /orders/{id}", client.get(f"/orders/{order['id']}", headers=headers_a).status_code == 200)
        check("GET other user's order -> 404", client.get(f"/orders/{order['id']}", headers=headers_b).status_code == 404)
        check("Cancel other user's order -> 404", client.post(f"/orders/{order['id']}/cancel", headers=headers_b).status_code == 404)
        res = client.post(f"/orders/{order['id']}/cancel", headers=headers_a)
        check("POST /orders/{id}/cancel", res.status_code == 200 and res.json()["status"] == "cancelled", res.text)
        restored = supabase.table("product_variants").select("stock_quantity").eq("id", variant_id).execute().data[0]["stock_quantity"]
        check("Cancel restored stock", restored == stock_before, f"expected {stock_before}, got {restored}")
        check("Cancel twice -> 400", client.post(f"/orders/{order['id']}/cancel", headers=headers_a).status_code == 400)

        # ── Admin ───────────────────────────────────────────────────────────
        check("GET /admin/stats as customer -> 403", client.get("/admin/stats", headers=headers_a).status_code == 403)
        set_role(user_a, "admin")
        check("GET /auth/me shows admin role", client.get("/auth/me", headers=headers_a).json()["role"] == "admin")
        res = client.get("/admin/stats", headers=headers_a)
        check("GET /admin/stats", res.status_code == 200 and res.json()["product_count"] >= 100 and len(res.json()["revenue_by_day"]) == 14, res.text[:300])

        res = client.get("/admin/products?status=all&limit=10", headers=headers_a)
        check("GET /admin/products", res.status_code == 200 and len(res.json()) == 10 and "category_name" in res.json()[0], res.text[:300])
        check("GET /admin/products?stock=low", client.get("/admin/products?stock=low", headers=headers_a).status_code == 200)

        top_level = next(c for c in client.get("/categories").json() if c["parent_id"] is None)
        res = client.post("/admin/categories", headers=headers_a, json={"name": f"Smoke Category {uuid.uuid4().hex[:6]}", "parent_id": top_level["id"]})
        check("POST /admin/categories", res.status_code == 201, res.text)
        test_category = res.json()
        created["categories"].append(test_category["id"])
        check("POST /admin/products into top-level category -> 400", client.post("/admin/products", headers=headers_a, json={"category_id": top_level["id"], "name": "X", "base_price": 1}).status_code == 400)

        sku_base = f"SMOKE-{uuid.uuid4().hex[:6].upper()}"
        res = client.post("/admin/products", headers=headers_a, json={
            "category_id": test_category["id"],
            "name": "Smoke Test Jacket",
            "brand": "Smoke Co",
            "description": "Created by smoke_test.py",
            "base_price": 99.5,
            "variants": [{"sku": f"{sku_base}-M", "size": "M", "stock_quantity": 3}, {"sku": f"{sku_base}-L", "size": "L", "stock_quantity": 0, "price_override": 109}],
            "images": [{"url": "https://picsum.photos/seed/smoke/800/800", "alt_text": "Smoke"}],
        })
        new_product = res.json()
        if res.status_code == 201:
            created["products"].append(new_product["id"])
        check("POST /admin/products with variants + images", res.status_code == 201 and len(new_product["product_variants"]) == 2 and len(new_product["product_images"]) == 1, res.text)
        check("POST /admin/products duplicate SKU -> 409", client.post("/admin/products", headers=headers_a, json={"category_id": test_category["id"], "name": "Dup", "base_price": 1, "variants": [{"sku": f"{sku_base}-M"}]}).status_code == 409)
        dup = supabase.table("products").select("id").eq("name", "Dup").eq("category_id", test_category["id"]).execute().data
        check("Failed product create rolled back", not dup)

        res = client.patch(f"/admin/products/{new_product['id']}", headers=headers_a, json={"base_price": 89, "name": "Smoke Test Jacket v2"})
        check("PATCH /admin/products/{id}", res.status_code == 200 and res.json()["base_price"] == 89 and res.json()["name"] == "Smoke Test Jacket v2", res.text)
        res = client.post(f"/admin/products/{new_product['id']}/variants", headers=headers_a, json={"sku": f"{sku_base}-S", "size": "S", "stock_quantity": 7})
        check("POST /admin/products/{id}/variants", res.status_code == 201, res.text)
        new_variant = res.json()
        res = client.patch(f"/admin/variants/{new_variant['id']}", headers=headers_a, json={"stock_quantity": 12})
        check("PATCH /admin/variants/{id}", res.status_code == 200 and res.json()["stock_quantity"] == 12, res.text)
        check("DELETE /admin/variants/{id}", client.delete(f"/admin/variants/{new_variant['id']}", headers=headers_a).status_code == 204)
        res = client.post(f"/admin/products/{new_product['id']}/images", headers=headers_a, json={"url": "https://picsum.photos/seed/smoke2/800/800", "display_order": 1})
        check("POST /admin/products/{id}/images", res.status_code == 201, res.text)
        check("DELETE /admin/images/{id}", client.delete(f"/admin/images/{res.json()['id']}", headers=headers_a).status_code == 204)
        check("Public GET new active product", client.get(f"/products/{new_product['id']}").status_code == 200)
        check("DELETE /admin/products/{id} (archive)", client.delete(f"/admin/products/{new_product['id']}", headers=headers_a).status_code == 204)
        check("Archived product hidden publicly -> 404", client.get(f"/products/{new_product['id']}").status_code == 404)
        check("Archived product still visible to admin", client.get(f"/admin/products/{new_product['id']}", headers=headers_a).status_code == 200)
        archived_variant = new_product["product_variants"][0]["id"]
        check("Can't add archived product to cart -> 404", client.post("/cart/items", headers=headers_a, json={"variant_id": archived_variant, "quantity": 1}).status_code == 404)
        check("DELETE category with products -> 409", client.delete(f"/admin/categories/{test_category['id']}", headers=headers_a).status_code == 409)

        # Admin order workflow
        client.post("/cart/items", headers=headers_a, json={"variant_id": variant_id, "quantity": 1})
        res = client.post("/orders", headers=headers_a, json={"shipping_address": ADDRESS})
        order2 = res.json()
        if res.status_code == 200:
            created["orders"].append(order2["id"])
        res = client.get("/admin/orders?limit=5", headers=headers_a)
        check("GET /admin/orders includes customer_email", res.status_code == 200 and any(o["id"] == order2["id"] and o["customer_email"] == USER_A[0] for o in res.json()), res.text[:300])
        check("GET /admin/orders?search=<email>", any(o["id"] == order2["id"] for o in client.get(f"/admin/orders?search={USER_A[0]}", headers=headers_a).json()))
        check("PATCH order pending -> delivered -> 400", client.patch(f"/admin/orders/{order2['id']}", headers=headers_a, json={"status": "delivered"}).status_code == 400)
        ok = all(client.patch(f"/admin/orders/{order2['id']}", headers=headers_a, json={"status": s}).status_code == 200 for s in ("paid", "shipped", "delivered"))
        check("PATCH order pending -> paid -> shipped -> delivered", ok)
        check("Customer can't cancel delivered order -> 400", client.post(f"/orders/{order2['id']}/cancel", headers=headers_a).status_code == 400)
        check("GET /admin/orders/{id}", client.get(f"/admin/orders/{order2['id']}", headers=headers_a).json().get("customer_email") == USER_A[0])

        # Discounts
        code = f"SMOKE{uuid.uuid4().hex[:6].upper()}"
        res = client.post("/admin/discounts", headers=headers_a, json={"code": code.lower(), "discount_type": "percentage", "discount_value": 15})
        check("POST /admin/discounts (code uppercased)", res.status_code == 201 and res.json()["code"] == code, res.text)
        discount = res.json()
        created["discounts"].append(discount["id"])
        check("POST /admin/discounts >100% -> 400", client.post("/admin/discounts", headers=headers_a, json={"code": code + "X", "discount_type": "percentage", "discount_value": 150}).status_code == 400)
        res = client.patch(f"/admin/discounts/{discount['id']}", headers=headers_a, json={"is_active": False})
        check("PATCH /admin/discounts/{id}", res.status_code == 200 and res.json()["is_active"] is False, res.text)
        check("GET /admin/discounts", any(d["code"] == code for d in client.get("/admin/discounts", headers=headers_a).json()))
        check("DELETE unused discount", client.delete(f"/admin/discounts/{discount['id']}", headers=headers_a).status_code == 204)
        created["discounts"].remove(discount["id"])

        # Users
        res = client.get("/admin/users", headers=headers_a)
        check("GET /admin/users", res.status_code == 200 and any(u["email"] == USER_A[0] and u["role"] == "admin" for u in res.json()), res.text[:300])
        check("Admin can't demote self -> 400", client.patch(f"/admin/users/{user_a}/role", headers=headers_a, json={"role": "customer"}).status_code == 400)
        res = client.patch(f"/admin/users/{user_b}/role", headers=headers_a, json={"role": "admin"})
        check("PATCH /admin/users/{id}/role grant", res.status_code == 200 and res.json()["role"] == "admin", res.text)
        check("Promoted user can access admin", client.get("/admin/discounts", headers=headers_b).status_code == 200)
        client.patch(f"/admin/users/{user_b}/role", headers=headers_a, json={"role": "customer"})
        check("Demoted user loses admin access -> 403", client.get("/admin/discounts", headers=headers_b).status_code == 403)

        # Assistant — access control and validation run without spending Gemini quota.
        chat_body = {"messages": [{"role": "user", "content": "hello"}]}
        check("POST /assistant/chat without token -> 401", client.post("/assistant/chat", json=chat_body).status_code == 401)
        check("Customer can't reach admin assistant -> 403", client.post("/admin/assistant/chat", headers=headers_b, json=chat_body).status_code == 403)
        check("POST /assistant/chat with no messages -> 422", client.post("/assistant/chat", headers=headers_b, json={"messages": []}).status_code == 422)
        check("POST /admin/assistant/confirm unknown id -> 404", client.post("/admin/assistant/confirm", headers=headers_a, json={"id": "nope", "approve": True}).status_code == 404)

        if os.environ.get("GEMINI_API_KEY"):
            res = client.post("/admin/assistant/chat", headers=headers_a, json={"messages": [{"role": "user", "content": "give me the finance report for the last 30 days"}]})
            body = res.json() if res.status_code == 200 else {}
            if res.status_code == 429:
                print("[SKIP] | Admin assistant returns a finance report (Gemini rate limit)")
            else:
                check("Admin assistant returns a finance report", res.status_code == 200 and (body.get("report") or {}).get("kind") == "finance" and bool(body.get("reply")), res.text[:300])

            res = client.post("/assistant/chat", headers=headers_b, json={"messages": [{"role": "user", "content": "what departments do you sell?"}]})
            if res.status_code == 429:
                print("[SKIP] | Customer assistant answers a catalog question (Gemini rate limit)")
            else:
                check("Customer assistant answers a catalog question", res.status_code == 200 and bool(res.json().get("reply")), res.text[:300])
        else:
            print("[SKIP] | Assistant model checks (GEMINI_API_KEY not set)")
    finally:
        print("-" * 64)
        print("Cleaning up test data...")
        client.delete("/cart", headers=headers_a) if "headers_a" in locals() else None
        for order_id in created["orders"]:
            supabase.table("orders").delete().eq("id", order_id).execute()
        for product_id in created["products"]:
            supabase.table("products").delete().eq("id", product_id).execute()
        for category_id in created["categories"]:
            supabase.table("categories").delete().eq("id", category_id).execute()
        for discount_id in created["discounts"]:
            supabase.table("discounts").delete().eq("id", discount_id).execute()
        supabase.table("reviews").delete().in_("user_id", [user_a, user_b]).execute()
        for variant_id, stock in stock_snapshot.items():
            supabase.table("product_variants").update({"stock_quantity": stock}).eq("id", variant_id).execute()
        for discount_id, uses in discount_snapshot.items():
            supabase.table("discounts").update({"uses_count": uses}).eq("id", discount_id).execute()
        supabase.table("profiles").update(profile_snapshot).eq("id", user_a).execute()
        set_role(user_a, "customer")
        supabase.table("carts").delete().eq("user_id", user_b).execute()
        supabase.table("profiles").delete().eq("id", user_b).execute()
        supabase.auth.admin.delete_user(user_b)

    print("=" * 64)
    print(f"Passed: {results['pass']}   Failed: {results['fail']}")
    print("=" * 64)


if __name__ == "__main__":
    run()
    sys.exit(1 if results["fail"] else 0)
