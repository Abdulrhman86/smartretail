"""
Order placement and cancellation.

Placement prefers the `place_order` Postgres function (database/migrations/001_*.sql),
which decrements stock, consumes the discount, inserts the order and clears the cart in
one transaction. If that migration hasn't been applied, a Python fallback runs the same
steps with conditional updates and compensating rollbacks — much safer than the original
read-then-write, but not truly atomic.
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.database import supabase
from app.pricing import Quote, build_quote, unit_price_for, variant_label_for

logger = logging.getLogger("smartretail.orders")

CHECKOUT_ITEM_SELECT = "*, product_variants(*, products(name, base_price, is_active))"

# Customers may cancel only before payment; admins follow ADMIN_STATUS_TRANSITIONS.
CUSTOMER_CANCELLABLE = {"pending"}
ADMIN_STATUS_TRANSITIONS = {
    "pending": {"paid", "cancelled"},
    "paid": {"shipped", "cancelled"},
    "shipped": {"delivered"},
    "delivered": set(),
    "cancelled": set(),
}

_rpc_available: dict[str, bool] = {}
_MAX_OPTIMISTIC_RETRIES = 3


def _is_missing_function(exc: APIError) -> bool:
    return exc.code == "PGRST202" or "Could not find the function" in (exc.message or "")


def _call_rpc(name: str, params: dict):
    """Returns the RPC result, or raises LookupError if the function isn't deployed."""
    if _rpc_available.get(name) is False:
        raise LookupError(name)
    try:
        result = supabase.rpc(name, params).execute()
        _rpc_available[name] = True
        return result.data
    except APIError as exc:
        if _is_missing_function(exc):
            logger.warning("RPC %s not found; using Python fallback (apply database/migrations).", name)
            _rpc_available[name] = False
            raise LookupError(name)
        raise


# ── Checkout preparation ────────────────────────────────────────────────────
def load_checkout_cart(user_id: UUID) -> tuple[str, list[dict]]:
    cart_res = supabase.table("carts").select("id").eq("user_id", str(user_id)).execute()
    if not cart_res.data:
        raise HTTPException(status_code=400, detail="Cart is empty. Cannot create an order with an empty cart.")
    cart_id = cart_res.data[0]["id"]
    items = supabase.table("cart_items").select(CHECKOUT_ITEM_SELECT).eq("cart_id", cart_id).execute().data or []
    if not items:
        raise HTTPException(status_code=400, detail="Cart is empty. Cannot create an order with an empty cart.")
    return cart_id, items


def validate_cart_items(items: list[dict]) -> None:
    unavailable, out_of_stock = [], []
    for item in items:
        variant = item.get("product_variants")
        if not variant:
            raise HTTPException(status_code=400, detail=f"Variant data missing for cart item {item['id']}")
        product = variant.get("products") or {}
        if not product.get("is_active", False):
            unavailable.append(product.get("name") or variant.get("sku"))
            continue
        available = variant.get("stock_quantity", 0)
        if item["quantity"] > available:
            out_of_stock.append(f"SKU {variant.get('sku')} (requested {item['quantity']}, available {available})")
    if unavailable:
        raise HTTPException(status_code=400, detail=f"No longer available: {', '.join(unavailable)}. Remove it from your cart to continue.")
    if out_of_stock:
        raise HTTPException(status_code=400, detail=f"Insufficient stock for: {', '.join(out_of_stock)}")


def load_discount(code: Optional[str]) -> Optional[dict]:
    if not code:
        return None
    res = supabase.table("discounts").select("*").eq("code", code.upper()).execute()
    return res.data[0] if res.data else None


def quote_for_user(user_id: UUID, shipping_method: str, discount_code: Optional[str]) -> tuple[str, list[dict], Quote]:
    cart_id, items = load_checkout_cart(user_id)
    validate_cart_items(items)
    quote = build_quote(items, shipping_method, load_discount(discount_code), discount_code)
    return cart_id, items, quote


# ── Placement ───────────────────────────────────────────────────────────────
def _order_item_rows(items: list[dict]) -> list[dict]:
    rows = []
    for item in items:
        variant = item["product_variants"]
        product = variant.get("products") or {}
        unit_price = unit_price_for(variant, product)
        rows.append({
            "cart_item_id": item["id"],
            "variant_id": variant["id"],
            "sku": variant.get("sku"),
            "product_name": product.get("name", "Unknown Product"),
            "variant_label": variant_label_for(variant),
            "unit_price": unit_price,
            "quantity": item["quantity"],
            "line_total": round(unit_price * item["quantity"], 3),
        })
    return rows


def place_order(user_id: UUID, shipping_address: dict, shipping_method: str, discount_code: Optional[str]) -> dict:
    cart_id, items, quote = quote_for_user(user_id, shipping_method, discount_code)
    rows = _order_item_rows(items)
    order_fields = {
        "subtotal": quote.subtotal,
        "discount_amount": quote.discount_amount,
        "shipping_amount": quote.shipping_amount,
        "total_amount": quote.total_amount,
        "shipping_address": shipping_address,
    }

    try:
        order_id = _call_rpc("place_order", {
            "p_user_id": str(user_id),
            "p_order": order_fields,
            "p_items": rows,
            "p_discount_id": quote.discount_id,
        })
    except LookupError:
        order_id = _place_order_fallback(user_id, order_fields, rows, quote.discount_id)
    except APIError as exc:
        message = exc.message or ""
        if "INSUFFICIENT_STOCK" in message:
            raise HTTPException(status_code=409, detail="An item in your cart just sold out. Please review your cart and try again.")
        if "DISCOUNT_EXHAUSTED" in message:
            raise HTTPException(status_code=400, detail="Discount code usage limit has been reached.")
        raise

    return get_order_detail(order_id)


def _conditional_stock_change(variant_id: str, delta: int) -> bool:
    """Applies `stock += delta` only if stock hasn't changed since read (and stays >= 0).
    Retries on concurrent modification. Returns False if stock is insufficient."""
    for _ in range(_MAX_OPTIMISTIC_RETRIES):
        current = supabase.table("product_variants").select("stock_quantity").eq("id", variant_id).execute().data
        if not current:
            return delta > 0  # variant deleted: nothing to restore, can't sell
        stock = current[0]["stock_quantity"]
        if stock + delta < 0:
            return False
        updated = (
            supabase.table("product_variants")
            .update({"stock_quantity": stock + delta})
            .eq("id", variant_id)
            .eq("stock_quantity", stock)
            .execute()
        )
        if updated.data:
            return True
    return False


def adjust_stock(variant_id: str, delta: int) -> bool:
    try:
        return bool(_call_rpc("adjust_variant_stock", {"p_variant_id": variant_id, "p_delta": delta}))
    except LookupError:
        return _conditional_stock_change(variant_id, delta)


def _consume_discount(discount_id: str) -> bool:
    for _ in range(_MAX_OPTIMISTIC_RETRIES):
        d = supabase.table("discounts").select("uses_count, max_uses").eq("id", discount_id).execute().data
        if not d:
            return False
        uses, max_uses = d[0]["uses_count"], d[0]["max_uses"]
        if max_uses is not None and uses >= max_uses:
            return False
        if supabase.table("discounts").update({"uses_count": uses + 1}).eq("id", discount_id).eq("uses_count", uses).execute().data:
            return True
    return False


def _place_order_fallback(user_id: UUID, order_fields: dict, rows: list[dict], discount_id: Optional[str]) -> str:
    decremented: list[tuple[str, int]] = []

    def rollback_stock():
        for variant_id, qty in decremented:
            if not _conditional_stock_change(variant_id, qty):
                logger.error("Failed to restore %s units of stock for variant %s", qty, variant_id)

    # 1. Reserve stock first so two buyers can't both take the last unit.
    for row in rows:
        if not _conditional_stock_change(row["variant_id"], -row["quantity"]):
            rollback_stock()
            raise HTTPException(status_code=409, detail="An item in your cart just sold out. Please review your cart and try again.")
        decremented.append((row["variant_id"], row["quantity"]))

    # 2. Consume the discount only once stock is secured.
    if discount_id and not _consume_discount(discount_id):
        rollback_stock()
        raise HTTPException(status_code=400, detail="Discount code usage limit has been reached.")

    def rollback_all():
        rollback_stock()
        if discount_id:
            d = supabase.table("discounts").select("uses_count").eq("id", discount_id).execute().data
            if d and d[0]["uses_count"] > 0:
                supabase.table("discounts").update({"uses_count": d[0]["uses_count"] - 1}).eq("id", discount_id).execute()

    # 3. Insert the order and its snapshot items.
    try:
        order = supabase.table("orders").insert({
            "user_id": str(user_id),
            "status": "pending",
            "discount_id": discount_id,
            **order_fields,
        }).execute().data[0]
    except Exception:
        rollback_all()
        raise HTTPException(status_code=500, detail="Failed to create order.")

    try:
        supabase.table("order_items").insert([
            {k: row[k] for k in ("variant_id", "product_name", "variant_label", "unit_price", "quantity", "line_total")}
            | {"order_id": order["id"]}
            for row in rows
        ]).execute()
    except Exception:
        supabase.table("orders").delete().eq("id", order["id"]).execute()
        rollback_all()
        raise HTTPException(status_code=500, detail="Failed to create order items.")

    # 4. Remove only the items that were ordered (anything added meanwhile stays).
    supabase.table("cart_items").delete().in_("id", [row["cart_item_id"] for row in rows]).execute()
    return order["id"]


# ── Reads & cancellation ────────────────────────────────────────────────────
def with_item_count(order: dict) -> dict:
    items = order.get("order_items") or []
    order["item_count"] = sum(i.get("quantity", 0) for i in items)
    return order


def get_order_detail(order_id: str, user_id: Optional[UUID] = None) -> dict:
    query = supabase.table("orders").select("*, order_items(*)").eq("id", str(order_id))
    if user_id is not None:
        query = query.eq("user_id", str(user_id))
    res = query.execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Order not found")
    return with_item_count(res.data[0])


def change_order_status(order: dict, new_status: str, allowed_from: set[str]) -> dict:
    """Moves an order to new_status; restores stock when cancelling. The conditional update on
    the current status makes concurrent transitions (e.g. double-cancel) fail safely."""
    if order["status"] not in allowed_from:
        raise HTTPException(status_code=400, detail=f"Cannot change an order from '{order['status']}' to '{new_status}'.")

    updated = (
        supabase.table("orders")
        .update({"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", order["id"])
        .eq("status", order["status"])
        .execute()
    )
    if not updated.data:
        raise HTTPException(status_code=409, detail="Order was modified by someone else. Refresh and try again.")

    if new_status == "cancelled":
        for item in order.get("order_items") or []:
            if item.get("variant_id") and not adjust_stock(item["variant_id"], item["quantity"]):
                logger.error("Could not restore stock for variant %s on cancelled order %s", item["variant_id"], order["id"])

    return get_order_detail(order["id"])
