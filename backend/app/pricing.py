"""
Order pricing rules — single source of truth used by both POST /orders/quote and
POST /orders, so the total shown at checkout is always the total that gets charged.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

# The store prices and charges in Kuwaiti dinar, which is divided into 1000 fils —
# hence three decimals rather than two. Any other currency shown in the UI is a
# display-only conversion; every amount stored or charged is KD.
CURRENCY_CODE = "KWD"
CURRENCY_DECIMALS = 3

FREE_SHIPPING_THRESHOLD = 15.000
SHIPPING_RATES = {
    "standard": 1.750,  # free when subtotal >= FREE_SHIPPING_THRESHOLD
    "express": 4.500,
}


def unit_price_for(variant: dict, product: Optional[dict]) -> float:
    price_override = variant.get("price_override")
    if price_override is not None:
        return round(float(price_override), 3)
    return round(float((product or {}).get("base_price", 0.0)), 3)


def variant_label_for(variant: dict) -> Optional[str]:
    parts = []
    if variant.get("size"):
        parts.append(f"Size: {variant['size']}")
    if variant.get("color"):
        parts.append(f"Color: {variant['color']}")
    return ", ".join(parts) if parts else None


def shipping_amount_for(method: str, subtotal: float) -> float:
    if method == "standard" and subtotal >= FREE_SHIPPING_THRESHOLD:
        return 0.0
    return SHIPPING_RATES[method]


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def validate_discount(discount: Optional[dict], code: str, subtotal: float) -> float:
    """Raises HTTP 400 if the discount can't be applied; returns the discount amount otherwise."""
    if not discount:
        raise HTTPException(status_code=400, detail=f"Discount code '{code}' not found.")
    if not discount.get("is_active", False):
        raise HTTPException(status_code=400, detail="Discount code is inactive.")

    now = datetime.now(timezone.utc)
    if discount.get("valid_from") and now < _parse_ts(discount["valid_from"]):
        raise HTTPException(status_code=400, detail="Discount code is not yet valid.")
    if discount.get("valid_until") and now > _parse_ts(discount["valid_until"]):
        raise HTTPException(status_code=400, detail="Discount code has expired.")

    max_uses = discount.get("max_uses")
    if max_uses is not None and discount.get("uses_count", 0) >= max_uses:
        raise HTTPException(status_code=400, detail="Discount code usage limit has been reached.")

    min_order = float(discount.get("min_order_amount") or 0.0)
    if subtotal < min_order:
        raise HTTPException(
            status_code=400,
            detail=f"Order subtotal (${subtotal:.2f}) does not meet the minimum order requirement (${min_order:.2f}) for this discount.",
        )

    value = float(discount["discount_value"])
    if discount["discount_type"] == "percentage":
        return round(min(subtotal, subtotal * value / 100.0), 3)
    return round(min(value, subtotal), 3)


@dataclass
class Quote:
    subtotal: float
    discount_id: Optional[str]
    discount_code: Optional[str]
    discount_amount: float
    shipping_method: str
    shipping_amount: float
    total_amount: float
    item_count: int


def build_quote(cart_items: list[dict], shipping_method: str, discount: Optional[dict], discount_code: Optional[str]) -> Quote:
    subtotal = 0.0
    item_count = 0
    for item in cart_items:
        variant = item["product_variants"]
        subtotal += unit_price_for(variant, variant.get("products")) * item["quantity"]
        item_count += item["quantity"]
    subtotal = round(subtotal, 3)

    discount_amount = 0.0
    if discount_code:
        discount_amount = validate_discount(discount, discount_code, subtotal)

    shipping_amount = shipping_amount_for(shipping_method, subtotal)
    total = max(0.0, round(subtotal - discount_amount + shipping_amount, 3))

    return Quote(
        subtotal=subtotal,
        discount_id=discount["id"] if discount_code and discount else None,
        discount_code=discount["code"] if discount_code and discount else None,
        discount_amount=discount_amount,
        shipping_method=shipping_method,
        shipping_amount=shipping_amount,
        total_amount=total,
        item_count=item_count,
    )
