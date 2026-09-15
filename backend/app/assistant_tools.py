"""
Tool definitions for the two assistants.

Customer tools are read-only against the public catalog plus the caller's own cart and orders.
Admin tools add business analytics and two *action* tools which never execute: they queue a
proposal that the admin has to confirm in the UI.

Every tool resolves ids against the database itself. The model can only pass back ids it was
given by an earlier tool result, and each tool re-validates them, so a hallucinated id fails
cleanly instead of touching the wrong row.
"""
from typing import Callable, Optional
from uuid import UUID

from google.genai import types

from app import reporting
from app.assistant import Tool, ToolResult
from app.catalog import rating_summary, sanitize_search, search_catalog
from app.database import supabase
from app.pricing import FREE_SHIPPING_THRESHOLD, SHIPPING_RATES, unit_price_for

MAX_SEARCH_RESULTS = 8


# ── Argument coercion ───────────────────────────────────────────────────────
# Gemini sends numbers as floats and omits optional args entirely.
def _int(args: dict, key: str, default: int, low: int, high: int) -> int:
    try:
        return max(low, min(high, int(float(args.get(key, default)))))
    except (TypeError, ValueError):
        return default


def _float(args: dict, key: str) -> Optional[float]:
    value = args.get(key)
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _str(args: dict, key: str) -> Optional[str]:
    value = args.get(key)
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _uuid(args: dict, key: str) -> Optional[UUID]:
    value = _str(args, key)
    if not value:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def _schema(properties: dict, required: Optional[list[str]] = None) -> types.Schema:
    return types.Schema(type=types.Type.OBJECT, properties=properties, required=required or [])


STR = types.Schema(type=types.Type.STRING)
NUM = types.Schema(type=types.Type.NUMBER)
INT = types.Schema(type=types.Type.INTEGER)


def _report(kind: str, title: str, summary: list[dict], columns: list[dict], rows: list[dict]) -> dict:
    return {"kind": kind, "title": title, "summary": summary, "columns": columns, "rows": rows}


def _col(key: str, label: str, fmt: str = "text") -> dict:
    return {"key": key, "label": label, "format": fmt}


# ── Customer tools ──────────────────────────────────────────────────────────
def _trim_product(item: dict) -> dict:
    """The model only needs enough to talk about a product; the full card goes to the UI."""
    return {
        "product_id": item["id"],
        "name": item["name"],
        "brand": item.get("brand"),
        "price": item["min_price"] if item["min_price"] == item["max_price"] else f"{item['min_price']}-{item['max_price']}",
        "in_stock": item["total_stock"] > 0,
        "variant_count": item["variant_count"],
    }


def _search_products(args: dict) -> ToolResult:
    sort = _str(args, "sort") or "newest"
    if sort not in ("newest", "price-asc", "price-desc", "name-asc", "name-desc"):
        sort = "newest"
    items, total = search_catalog(
        search=_str(args, "query"),
        category=_str(args, "category"),
        brand=_str(args, "brand"),
        min_price=_float(args, "min_price"),
        max_price=_float(args, "max_price"),
        sort=sort,
        limit=_int(args, "limit", 6, 1, MAX_SEARCH_RESULTS),
    )
    return ToolResult(
        data={"total_matches": total, "returned": len(items), "products": [_trim_product(i) for i in items]},
        products=items,
    )


def _get_product(args: dict) -> ToolResult:
    product_id = _uuid(args, "product_id")
    if not product_id:
        return ToolResult(data={"error": "A valid product_id from a previous search is required."})

    res = (
        supabase.table("products")
        .select("*, category:categories(name, slug), product_variants(id, sku, size, color, price_override, stock_quantity)")
        .eq("id", str(product_id))
        .eq("is_active", True)
        .execute()
    )
    if not res.data:
        return ToolResult(data={"error": "Product not found."})

    product = res.data[0]
    reviews = supabase.table("reviews").select("rating").eq("product_id", str(product_id)).execute().data or []
    average, count = rating_summary(reviews)
    variants = product.get("product_variants") or []

    return ToolResult(data={
        "product_id": product["id"],
        "name": product["name"],
        "brand": product.get("brand"),
        "description": product.get("description"),
        "category": (product.get("category") or {}).get("name"),
        "base_price": float(product["base_price"]),
        "rating_average": average,
        "rating_count": count,
        "variants": [
            {
                "variant_id": v["id"],
                "size": v.get("size"),
                "color": v.get("color"),
                "price": unit_price_for(v, product),
                "stock": v["stock_quantity"],
            }
            for v in variants
        ],
    })


def _list_categories(_args: dict) -> ToolResult:
    rows = supabase.table("categories").select("id, parent_id, name, slug").order("name").execute().data or []
    departments = {r["id"]: r for r in rows if not r.get("parent_id")}
    return ToolResult(data={
        "departments": [
            {
                "name": dept["name"],
                "slug": dept["slug"],
                "subcategories": [r["name"] for r in rows if r.get("parent_id") == dept_id],
            }
            for dept_id, dept in departments.items()
        ]
    })


def _list_brands(_args: dict) -> ToolResult:
    rows = supabase.table("products").select("brand").eq("is_active", True).execute().data or []
    brands = sorted({r["brand"] for r in rows if r.get("brand")})
    return ToolResult(data={"brands": brands})


def _add_to_cart_tool(user_id: UUID) -> Callable[[dict], ToolResult]:
    def handler(args: dict) -> ToolResult:
        # Imported here to avoid a circular import: the cart router imports schemas that import
        # from this package's tree at startup.
        from app.routers.cart import add_cart_item
        from app.schemas import CartItemCreate

        variant_id = _uuid(args, "variant_id")
        if not variant_id:
            return ToolResult(data={"error": "A valid variant_id is required. Call get_product first to pick a size/colour."})
        quantity = _int(args, "quantity", 1, 1, 10)

        item = add_cart_item(CartItemCreate(variant_id=variant_id, quantity=quantity), user_id)
        variant = item.get("product_variants") or {}
        product = variant.get("products") or {}
        return ToolResult(data={
            "added": True,
            "product_name": product.get("name"),
            "quantity": item["quantity"],
            "line_total": item["line_total"],
        })

    return handler


def _my_orders_tool(user_id: UUID) -> Callable[[dict], ToolResult]:
    def handler(_args: dict) -> ToolResult:
        rows = (
            supabase.table("orders")
            .select("id, status, created_at, total_amount, order_items(product_name, quantity)")
            .eq("user_id", str(user_id))
            .order("created_at", desc=True)
            .limit(5)
            .execute()
            .data
            or []
        )
        return ToolResult(data={
            "orders": [
                {
                    "order_id": o["id"],
                    "status": o["status"],
                    "placed_on": o["created_at"][:10],
                    "total": float(o["total_amount"]),
                    "items": [f"{i['quantity']}x {i['product_name']}" for i in (o.get("order_items") or [])],
                }
                for o in rows
            ]
        })

    return handler


def customer_tools(user_id: UUID) -> list[Tool]:
    return [
        Tool(
            types.FunctionDeclaration(
                name="search_products",
                description="Search the store catalog by keywords, category, brand and price. Use this for any question about what the store sells.",
                parameters=_schema({
                    "query": STR,
                    "category": types.Schema(type=types.Type.STRING, description="Department or subcategory slug, e.g. 'footwear'."),
                    "brand": STR,
                    "min_price": NUM,
                    "max_price": NUM,
                    "sort": types.Schema(type=types.Type.STRING, enum=["newest", "price-asc", "price-desc", "name-asc", "name-desc"]),
                    "limit": INT,
                }),
            ),
            _search_products,
        ),
        Tool(
            types.FunctionDeclaration(
                name="get_product",
                description="Full detail for one product: description, rating and every size/colour variant with its own price and stock. Call this before adding anything to the cart.",
                parameters=_schema({"product_id": STR}, ["product_id"]),
            ),
            _get_product,
        ),
        Tool(
            types.FunctionDeclaration(
                name="list_categories",
                description="List the store's departments and their subcategories.",
                parameters=_schema({}),
            ),
            _list_categories,
        ),
        Tool(
            types.FunctionDeclaration(
                name="list_brands",
                description="List every brand currently stocked.",
                parameters=_schema({}),
            ),
            _list_brands,
        ),
        Tool(
            types.FunctionDeclaration(
                name="add_to_cart",
                description="Add a specific variant to the shopper's cart. Only call this after the shopper has clearly asked for it and a size/colour has been settled.",
                parameters=_schema({"variant_id": STR, "quantity": INT}, ["variant_id"]),
            ),
            _add_to_cart_tool(user_id),
        ),
        Tool(
            types.FunctionDeclaration(
                name="get_my_orders",
                description="The shopper's five most recent orders and their statuses.",
                parameters=_schema({}),
            ),
            _my_orders_tool(user_id),
        ),
    ]


CUSTOMER_SYSTEM_PROMPT = f"""You are the shopping assistant for SmartRetail, an online store.

Rules:
- Never invent products, prices, stock levels or order details. Every fact you state must come from a tool result. If the tools return nothing, say so plainly.
- The shopper sees product cards rendered from the search results, so don't repeat full specs in your text. Name the picks and say briefly why they fit, in 2-4 sentences.
- Prices are in USD. Shipping is ${SHIPPING_RATES['standard']} standard (free over ${FREE_SHIPPING_THRESHOLD:.0f}) or ${SHIPPING_RATES['express']} express.
- Before adding to the cart, make sure the shopper picked a size/colour when the product has several. Confirm what you added afterwards.
- SmartRetail is a portfolio demo store: orders aren't really fulfilled and no payment is taken. Say so if someone asks about delivery, returns or payment specifics rather than inventing a policy.
- Stay on topic. If asked something unrelated to the store, redirect politely."""


# ── Admin tools ─────────────────────────────────────────────────────────────
def _finance_report(args: dict) -> ToolResult:
    days = _int(args, "days", 30, 1, 365)
    data = reporting.finance_report(days)
    change = data["revenue_change_pct"]
    summary = [
        {"label": f"Revenue (last {days}d)", "value": data["revenue"], "format": "currency"},
        {"label": "Orders", "value": data["orders"], "format": "number"},
        {"label": "Avg order value", "value": data["average_order_value"], "format": "currency"},
        {"label": "Units sold", "value": data["units"], "format": "number"},
        {"label": "Discounts given", "value": data["discounts_given"], "format": "currency"},
        {"label": "Shipping collected", "value": data["shipping_collected"], "format": "currency"},
    ]
    if change is not None:
        summary.append({"label": "vs previous period", "value": f"{change:+.1f}%", "format": "text"})

    report = _report(
        "finance",
        f"Finance report — last {days} days",
        summary,
        [_col("date", "Date", "date"), _col("revenue", "Revenue", "currency"), _col("orders", "Orders", "number")],
        data["daily"],
    )
    model_view = {k: v for k, v in data.items() if k != "daily"}
    return ToolResult(data=model_view, report=report)


def _underperforming(args: dict) -> ToolResult:
    days = _int(args, "days", 30, 1, 365)
    limit = _int(args, "limit", 10, 1, 25)
    rows = reporting.underperforming_products(days, limit)
    report = _report(
        "underperforming",
        f"Underperforming products — last {days} days",
        [
            {"label": "Products listed", "value": len(rows), "format": "number"},
            {"label": "Stock value tied up", "value": round(sum(r["stock_value"] for r in rows), 2), "format": "currency"},
        ],
        [
            _col("product_name", "Product"),
            _col("brand", "Brand"),
            _col("units_sold", "Units sold", "number"),
            _col("revenue", "Revenue", "currency"),
            _col("stock_on_hand", "Stock", "number"),
            _col("stock_value", "Stock value", "currency"),
        ],
        rows,
    )
    return ToolResult(data={"days": days, "products": rows}, report=report)


def _top_products(args: dict) -> ToolResult:
    days = _int(args, "days", 30, 1, 365)
    limit = _int(args, "limit", 10, 1, 25)
    rows = reporting.top_products(days, limit)
    report = _report(
        "top_products",
        f"Best sellers — last {days} days",
        [{"label": "Units sold", "value": sum(r["units_sold"] for r in rows), "format": "number"},
         {"label": "Revenue", "value": round(sum(r["revenue"] for r in rows), 2), "format": "currency"}],
        [_col("product_name", "Product"), _col("brand", "Brand"), _col("units_sold", "Units sold", "number"), _col("revenue", "Revenue", "currency")],
        rows,
    )
    return ToolResult(data={"days": days, "products": rows}, report=report)


def _low_stock(args: dict) -> ToolResult:
    threshold = _int(args, "threshold", reporting.LOW_STOCK_THRESHOLD, 0, 100)
    limit = _int(args, "limit", 20, 1, 50)
    rows = reporting.low_stock(threshold, limit)
    report = _report(
        "low_stock",
        f"Stock at or below {threshold} units",
        [{"label": "Variants affected", "value": len(rows), "format": "number"},
         {"label": "Out of stock", "value": sum(1 for r in rows if r["stock_quantity"] == 0), "format": "number"}],
        [_col("product_name", "Product"), _col("label", "Variant"), _col("sku", "SKU"), _col("stock_quantity", "Stock", "number")],
        rows,
    )
    return ToolResult(data={"threshold": threshold, "variants": rows}, report=report)


def _top_customers(args: dict) -> ToolResult:
    days = _int(args, "days", 365, 1, 3650)
    limit = _int(args, "limit", 10, 1, 25)
    rows = reporting.top_customers(days, limit)
    report = _report(
        "top_customers",
        f"Top customers — last {days} days",
        [{"label": "Customers listed", "value": len(rows), "format": "number"},
         {"label": "Combined spend", "value": round(sum(r["total_spent"] for r in rows), 2), "format": "currency"}],
        [_col("email", "Customer"), _col("orders", "Orders", "number"), _col("total_spent", "Total spent", "currency"), _col("average_order_value", "Avg order", "currency")],
        rows,
    )
    return ToolResult(data={"days": days, "customers": rows}, report=report)


def _discount_performance(_args: dict) -> ToolResult:
    rows = reporting.discount_performance()
    report = _report(
        "discounts",
        "Discount code performance",
        [{"label": "Codes", "value": len(rows), "format": "number"},
         {"label": "Total discount given", "value": round(sum(r["discount_given"] for r in rows), 2), "format": "currency"}],
        [_col("code", "Code"), _col("type", "Type"), _col("orders", "Orders", "number"), _col("discount_given", "Discount given", "currency"), _col("revenue_generated", "Revenue", "currency")],
        rows,
    )
    return ToolResult(data={"discounts": rows}, report=report)


def _inventory_snapshot(_args: dict) -> ToolResult:
    return ToolResult(data=reporting.inventory_snapshot())


PRODUCT_LOOKUP_SELECT = "id, name, brand, is_active, product_variants(id, sku, size, color, stock_quantity)"


def _find_product(args: dict) -> ToolResult:
    # Admins refer to stock by SKU as often as by name, so both resolve here.
    query = sanitize_search(_str(args, "query") or _str(args, "name"))
    if not query:
        return ToolResult(data={"error": "A product name or SKU is required."})

    by_name = (
        supabase.table("products").select(PRODUCT_LOOKUP_SELECT).ilike("name", f"%{query}%").limit(5).execute().data or []
    )
    variant_rows = (
        supabase.table("product_variants").select("product_id").ilike("sku", f"%{query}%").limit(10).execute().data or []
    )
    extra_ids = {v["product_id"] for v in variant_rows} - {p["id"] for p in by_name}
    by_sku = (
        supabase.table("products").select(PRODUCT_LOOKUP_SELECT).in_("id", list(extra_ids)).limit(5).execute().data
        if extra_ids
        else []
    ) or []

    matches = by_name + by_sku
    if not matches:
        return ToolResult(data={"matches": [], "note": f"Nothing matched '{query}'."})
    return ToolResult(data={
        "matches": [
            {
                "product_id": p["id"],
                "name": p["name"],
                "brand": p.get("brand"),
                "is_active": p["is_active"],
                "variants": [
                    {
                        "variant_id": v["id"],
                        "sku": v["sku"],
                        "label": " / ".join(x for x in (v.get("size"), v.get("color")) if x) or "Default",
                        "stock": v["stock_quantity"],
                    }
                    for v in (p.get("product_variants") or [])
                ],
            }
            for p in matches
        ]
    })


def _archive_tool(propose: Callable[[str, dict, str], dict]) -> Callable[[dict], ToolResult]:
    def handler(args: dict) -> ToolResult:
        product_id = _uuid(args, "product_id")
        if not product_id:
            return ToolResult(data={"error": "A valid product_id is required — call find_product first."})
        res = supabase.table("products").select("id, name, is_active").eq("id", str(product_id)).execute()
        if not res.data:
            return ToolResult(data={"error": "Product not found."})
        product = res.data[0]
        if not product["is_active"]:
            return ToolResult(data={"error": f"'{product['name']}' is already archived."})

        action = propose(
            "archive_product",
            {"product_id": product["id"]},
            f"Archive '{product['name']}' — it will be hidden from the storefront. Order history is kept.",
        )
        return ToolResult(
            data={"queued": True, "needs_confirmation": True, "product_name": product["name"]},
            pending_action=action,
        )

    return handler


def _restock_tool(propose: Callable[[str, dict, str], dict]) -> Callable[[dict], ToolResult]:
    def handler(args: dict) -> ToolResult:
        variant_id = _uuid(args, "variant_id")
        if not variant_id:
            return ToolResult(data={"error": "A valid variant_id is required — call find_product or get_low_stock first."})
        quantity = args.get("stock_quantity")
        try:
            quantity = int(float(quantity))
        except (TypeError, ValueError):
            return ToolResult(data={"error": "stock_quantity must be a whole number."})
        if not 0 <= quantity <= 100000:
            return ToolResult(data={"error": "stock_quantity must be between 0 and 100000."})

        res = (
            supabase.table("product_variants")
            .select("id, sku, size, color, stock_quantity, products(name)")
            .eq("id", str(variant_id))
            .execute()
        )
        if not res.data:
            return ToolResult(data={"error": "Variant not found."})
        variant = res.data[0]
        label = " / ".join(x for x in (variant.get("size"), variant.get("color")) if x) or "default"
        product_name = (variant.get("products") or {}).get("name", "Unknown product")

        action = propose(
            "restock_variant",
            {"variant_id": variant["id"], "stock_quantity": quantity},
            f"Set stock for {product_name} ({label}, {variant['sku']}) from {variant['stock_quantity']} to {quantity}.",
        )
        return ToolResult(
            data={
                "queued": True,
                "needs_confirmation": True,
                "product_name": product_name,
                "current_stock": variant["stock_quantity"],
                "requested_stock": quantity,
            },
            pending_action=action,
        )

    return handler


def admin_tools(propose: Callable[[str, dict, str], dict]) -> list[Tool]:
    return [
        Tool(
            types.FunctionDeclaration(
                name="get_finance_report",
                description="Revenue, order count, average order value, discounts and shipping for a period, with the trend against the previous period. Use for any 'how is the business doing' question.",
                parameters=_schema({"days": types.Schema(type=types.Type.INTEGER, description="Window length in days, default 30.")}),
            ),
            _finance_report,
        ),
        Tool(
            types.FunctionDeclaration(
                name="get_underperforming_products",
                description="Active products selling slowly or not at all while holding stock — the archive/markdown shortlist.",
                parameters=_schema({"days": INT, "limit": INT}),
            ),
            _underperforming,
        ),
        Tool(
            types.FunctionDeclaration(
                name="get_top_products",
                description="Best-selling products by units and revenue for a period.",
                parameters=_schema({"days": INT, "limit": INT}),
            ),
            _top_products,
        ),
        Tool(
            types.FunctionDeclaration(
                name="get_low_stock",
                description="Variants of active products at or below a stock threshold (default 5).",
                parameters=_schema({"threshold": INT, "limit": INT}),
            ),
            _low_stock,
        ),
        Tool(
            types.FunctionDeclaration(
                name="get_top_customers",
                description="Highest-spending customers, with order counts and average order value.",
                parameters=_schema({"days": INT, "limit": INT}),
            ),
            _top_customers,
        ),
        Tool(
            types.FunctionDeclaration(
                name="get_discount_performance",
                description="Every discount code with how often it was used, how much it gave away and the revenue on those orders.",
                parameters=_schema({}),
            ),
            _discount_performance,
        ),
        Tool(
            types.FunctionDeclaration(
                name="get_inventory_snapshot",
                description="Totals for active products, out-of-stock products, units on hand and stock value.",
                parameters=_schema({}),
            ),
            _inventory_snapshot,
        ),
        Tool(
            types.FunctionDeclaration(
                name="find_product",
                description="Look up products by name or by variant SKU, returning product ids and every variant id with its stock. Always call this first when the admin refers to something by name or SKU.",
                parameters=_schema({"query": types.Schema(type=types.Type.STRING, description="Product name fragment or a variant SKU.")}, ["query"]),
            ),
            _find_product,
        ),
        Tool(
            types.FunctionDeclaration(
                name="archive_product",
                description="Propose archiving a product (hides it from the storefront). This does NOT take effect immediately — it is queued for the admin to confirm.",
                parameters=_schema({"product_id": STR}, ["product_id"]),
            ),
            _archive_tool(propose),
        ),
        Tool(
            types.FunctionDeclaration(
                name="restock_variant",
                description="Propose setting a variant's stock to a new absolute quantity. This does NOT take effect immediately — it is queued for the admin to confirm.",
                parameters=_schema({"variant_id": STR, "stock_quantity": INT}, ["variant_id", "stock_quantity"]),
            ),
            _restock_tool(propose),
        ),
    ]


ADMIN_SYSTEM_PROMPT = """You are the operations analyst inside SmartRetail's admin console. You are talking to a store administrator.

Rules:
- Every number you state must come from a tool result. Never estimate, extrapolate or carry a figure over from earlier in the conversation without re-checking it.
- The admin sees the full table or chart rendered beneath your reply, so don't transcribe it. Lead with the figure that answers the question, then add the one or two things worth noticing (a trend, an outlier, a risk). Keep it under about six lines.
- Amounts are USD. When you quote a period, say which one.
- 'Underperforming' means active stock that isn't selling — use get_underperforming_products, and read it together with stock value, since slow-moving items with a lot of stock tied up matter most.
- archive_product and restock_variant only *propose* a change: the admin gets a confirmation prompt and nothing happens until they approve it. Say that you've queued it for approval rather than claiming it is done. Resolve names to ids with find_product first, and never guess an id.
- If a question can't be answered with the tools you have, say what you'd need instead of guessing."""
