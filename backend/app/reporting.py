"""
Sales and inventory analytics.

Single source of truth for the numbers the admin assistant reports, kept out of the routers
for the same reason as pricing.py: so a figure quoted in chat can't drift from a figure shown
elsewhere. Every function returns plain dicts/lists of primitives, ready to hand to the model.

Note on joins: order_items snapshots product_name/unit_price and its variant_id is
ON DELETE SET NULL. Aggregations that need *current* product state (stock, is_active) resolve
variant_id -> product_id and therefore skip line items whose variant was hard-deleted; that is
intentional, since those products can no longer be acted on.
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from app.database import supabase

LOW_STOCK_THRESHOLD = 5
REVENUE_STATUSES = ("pending", "paid", "shipped", "delivered")  # everything except cancelled

ORDER_SELECT = (
    "id, user_id, status, created_at, subtotal, discount_amount, shipping_amount, total_amount, discount_id, "
    "order_items(product_name, variant_label, unit_price, quantity, line_total, variant_id)"
)


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _orders_since(days: int) -> list[dict]:
    res = (
        supabase.table("orders")
        .select(ORDER_SELECT)
        .gte("created_at", _since(days).isoformat())
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


def _variant_to_product() -> dict[str, str]:
    res = supabase.table("product_variants").select("id, product_id").execute()
    return {v["id"]: v["product_id"] for v in (res.data or [])}


def auth_users() -> list:
    users, page = [], 1
    while True:
        batch = supabase.auth.admin.list_users(page=page, per_page=1000)
        users.extend(batch)
        if len(batch) < 1000:
            return users
        page += 1


def finance_report(days: int = 30) -> dict:
    """Revenue, order volume and discount/shipping split for the last `days`, with the
    change against the equally long window before it."""
    orders = _orders_since(days * 2)  # current window + the one before, for the trend
    cutoff = _since(days)

    current = [o for o in orders if _parse(o["created_at"]) >= cutoff]
    previous = [o for o in orders if _parse(o["created_at"]) < cutoff]

    def totals(rows: list[dict]) -> dict:
        billable = [o for o in rows if o["status"] in REVENUE_STATUSES]
        revenue = sum(float(o["total_amount"]) for o in billable)
        units = sum(i["quantity"] for o in billable for i in (o.get("order_items") or []))
        return {
            "revenue": round(revenue, 3),
            "orders": len(billable),
            "units": units,
            "average_order_value": round(revenue / len(billable), 3) if billable else 0.0,
            "subtotal": round(sum(float(o["subtotal"]) for o in billable), 3),
            "discounts_given": round(sum(float(o["discount_amount"] or 0) for o in billable), 3),
            "shipping_collected": round(sum(float(o["shipping_amount"] or 0) for o in billable), 3),
        }

    now, before = totals(current), totals(previous)
    change = None
    if before["revenue"] > 0:
        change = round((now["revenue"] - before["revenue"]) / before["revenue"] * 100, 1)

    by_day: dict[str, dict] = {}
    for offset in range(days - 1, -1, -1):
        by_day[(datetime.now(timezone.utc) - timedelta(days=offset)).date().isoformat()] = {"revenue": 0.0, "orders": 0}
    for o in current:
        if o["status"] not in REVENUE_STATUSES:
            continue
        day = o["created_at"][:10]
        if day in by_day:
            by_day[day]["revenue"] = round(by_day[day]["revenue"] + float(o["total_amount"]), 3)
            by_day[day]["orders"] += 1

    status_counts: dict[str, int] = defaultdict(int)
    for o in current:
        status_counts[o["status"]] += 1

    return {
        "days": days,
        **now,
        "cancelled_orders": status_counts.get("cancelled", 0),
        "orders_by_status": dict(status_counts),
        "previous_period_revenue": before["revenue"],
        "revenue_change_pct": change,
        "daily": [{"date": d, **v} for d, v in by_day.items()],
    }


def _units_by_product(days: int) -> tuple[dict[str, int], dict[str, float]]:
    variant_product = _variant_to_product()
    units: dict[str, int] = defaultdict(int)
    revenue: dict[str, float] = defaultdict(float)
    for order in _orders_since(days):
        if order["status"] not in REVENUE_STATUSES:
            continue
        for item in order.get("order_items") or []:
            product_id = variant_product.get(item.get("variant_id"))
            if not product_id:
                continue
            units[product_id] += item["quantity"]
            revenue[product_id] += float(item["line_total"])
    return units, revenue


def _active_products_with_stock() -> list[dict]:
    res = (
        supabase.table("products")
        .select("id, name, brand, base_price, created_at, is_active, product_variants(stock_quantity)")
        .eq("is_active", True)
        .execute()
    )
    products = []
    for p in res.data or []:
        variants = p.pop("product_variants", None) or []
        products.append({**p, "stock_on_hand": sum(v.get("stock_quantity") or 0 for v in variants)})
    return products


def underperforming_products(days: int = 30, limit: int = 10) -> list[dict]:
    """Active products that are selling slowly while holding stock — the restock/archive
    shortlist. Ranked worst first: no sales outranks slow sales, and among those, more
    trapped stock outranks less."""
    units, revenue = _units_by_product(days)
    rows = []
    for p in _active_products_with_stock():
        sold = units.get(p["id"], 0)
        rows.append({
            "product_id": p["id"],
            "product_name": p["name"],
            "brand": p.get("brand"),
            "units_sold": sold,
            "revenue": round(revenue.get(p["id"], 0.0), 3),
            "stock_on_hand": p["stock_on_hand"],
            "base_price": float(p["base_price"]),
            "stock_value": round(p["stock_on_hand"] * float(p["base_price"]), 3),
            "listed_days_ago": (datetime.now(timezone.utc) - _parse(p["created_at"])).days,
        })
    rows.sort(key=lambda r: (r["units_sold"], -r["stock_value"]))
    return rows[:limit]


def top_products(days: int = 30, limit: int = 10) -> list[dict]:
    units, revenue = _units_by_product(days)
    names = {
        p["id"]: p for p in (supabase.table("products").select("id, name, brand").execute().data or [])
    }
    rows = [
        {
            "product_id": pid,
            "product_name": (names.get(pid) or {}).get("name", "Unknown"),
            "brand": (names.get(pid) or {}).get("brand"),
            "units_sold": sold,
            "revenue": round(revenue.get(pid, 0.0), 3),
        }
        for pid, sold in units.items()
    ]
    rows.sort(key=lambda r: (-r["units_sold"], -r["revenue"]))
    return rows[:limit]


def low_stock(threshold: int = LOW_STOCK_THRESHOLD, limit: int = 20) -> list[dict]:
    res = (
        supabase.table("product_variants")
        .select("id, product_id, sku, size, color, stock_quantity, products(name, brand, is_active)")
        .lte("stock_quantity", threshold)
        .order("stock_quantity")
        .limit(200)
        .execute()
    )
    rows = []
    for v in res.data or []:
        product = v.get("products") or {}
        if not product.get("is_active"):
            continue
        rows.append({
            "variant_id": v["id"],
            "product_id": v["product_id"],
            "product_name": product.get("name", "Unknown"),
            "brand": product.get("brand"),
            "sku": v["sku"],
            "label": " / ".join(x for x in (v.get("size"), v.get("color")) if x) or None,
            "stock_quantity": v["stock_quantity"],
        })
    return rows[:limit]


def top_customers(days: int = 365, limit: int = 10) -> list[dict]:
    spend: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)
    last_order: dict[str, str] = {}
    for o in _orders_since(days):
        if o["status"] not in REVENUE_STATUSES:
            continue
        uid = o["user_id"]
        spend[uid] += float(o["total_amount"])
        counts[uid] += 1
        if uid not in last_order or o["created_at"] > last_order[uid]:
            last_order[uid] = o["created_at"]

    emails = {u.id: u.email for u in auth_users()}
    rows = [
        {
            "user_id": uid,
            "email": emails.get(uid) or "unknown",
            "orders": counts[uid],
            "total_spent": round(total, 3),
            "average_order_value": round(total / counts[uid], 3),
            "last_order_at": last_order.get(uid),
        }
        for uid, total in spend.items()
    ]
    rows.sort(key=lambda r: -r["total_spent"])
    return rows[:limit]


def discount_performance() -> list[dict]:
    discounts = supabase.table("discounts").select("*").execute().data or []
    orders = supabase.table("orders").select("discount_id, discount_amount, total_amount, status").execute().data or []

    given: dict[str, float] = defaultdict(float)
    revenue: dict[str, float] = defaultdict(float)
    used: dict[str, int] = defaultdict(int)
    for o in orders:
        if not o.get("discount_id") or o["status"] not in REVENUE_STATUSES:
            continue
        given[o["discount_id"]] += float(o["discount_amount"] or 0)
        revenue[o["discount_id"]] += float(o["total_amount"])
        used[o["discount_id"]] += 1

    return [
        {
            "code": d["code"],
            "description": d.get("description"),
            "type": d["discount_type"],
            "value": float(d["discount_value"]),
            "is_active": d["is_active"],
            "orders": used.get(d["id"], 0),
            "discount_given": round(given.get(d["id"], 0.0), 3),
            "revenue_generated": round(revenue.get(d["id"], 0.0), 3),
            "uses_count": d.get("uses_count", 0),
            "max_uses": d.get("max_uses"),
        }
        for d in discounts
    ]


def inventory_snapshot() -> dict:
    products = _active_products_with_stock()
    out_of_stock = [p for p in products if p["stock_on_hand"] == 0]
    stock_value = sum(p["stock_on_hand"] * float(p["base_price"]) for p in products)
    return {
        "active_products": len(products),
        "out_of_stock_products": len(out_of_stock),
        "low_stock_variants": len(low_stock(limit=1000)),
        "total_units_on_hand": sum(p["stock_on_hand"] for p in products),
        "stock_value": round(stock_value, 3),
    }
