"""Catalog helpers shared by the public products router and the admin router."""
import re
import unicodedata
from typing import Optional
from uuid import UUID

from app.database import supabase

PRODUCT_LIST_SELECT = (
    "*, product_variants(id, price_override, stock_quantity, created_at, sku), "
    "product_images(url, display_order)"
)


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "item"


def sanitize_search(term: Optional[str]) -> Optional[str]:
    """PostgREST `or=` filters use commas, parentheses and dots as syntax, and `%`/`_`/`*`
    are ilike wildcards — strip them so user input can't alter the filter."""
    if not term:
        return None
    cleaned = re.sub(r"[,()%_*\\:\"]", " ", term)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or None


def category_ids_with_descendants(category_id: Optional[UUID] = None, slug: Optional[str] = None) -> list[str]:
    """Resolves a category (by id or slug) to itself plus its subcategories. Products only
    reference leaf subcategories, so filtering by a top-level category needs its children."""
    categories = supabase.table("categories").select("id, parent_id, slug").execute().data or []
    root = None
    for c in categories:
        if (category_id is not None and c["id"] == str(category_id)) or (slug and c["slug"] == slug):
            root = c
            break
    if not root:
        return []

    ids = {root["id"]}
    frontier = [root["id"]]
    while frontier:
        children = [c["id"] for c in categories if c.get("parent_id") in frontier and c["id"] not in ids]
        ids.update(children)
        frontier = children
    return list(ids)


def apply_product_sort(query, sort: str):
    if sort == "price-asc":
        return query.order("base_price").order("id")
    if sort == "price-desc":
        return query.order("base_price", desc=True).order("id")
    if sort == "name-asc":
        return query.order("name").order("id")
    if sort == "name-desc":
        return query.order("name", desc=True).order("id")
    # Secondary order on id keeps pagination stable (seeded rows share created_at).
    return query.order("created_at", desc=True).order("id")


def search_catalog(
    *,
    category_id: Optional[UUID] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    brand: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    sort: str = "newest",
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Active-catalog search shared by GET /products and the assistant's search tool, so both
    apply the same filters. Returns (cards, total_matches)."""
    query = supabase.table("products").select(PRODUCT_LIST_SELECT, count="exact").eq("is_active", True)

    if category_id is not None or category:
        ids = category_ids_with_descendants(category_id=category_id, slug=category)
        if not ids:
            return [], 0
        query = query.in_("category_id", ids)

    # Each word must match name, brand or description (words are ANDed, so
    # "waterproof jacket" finds "Waterproof Rain Jacket").
    term = sanitize_search(search)
    for word in (term.split(" ")[:5] if term else []):
        query = query.or_(f"name.ilike.%{word}%,brand.ilike.%{word}%,description.ilike.%{word}%")
    if brand:
        query = query.eq("brand", brand)
    # Price filters use base_price; variant price overrides are not considered at list level.
    if min_price is not None:
        query = query.gte("base_price", min_price)
    if max_price is not None:
        query = query.lte("base_price", max_price)

    query = apply_product_sort(query, sort)
    res = query.range(offset, offset + limit - 1).execute()
    total = res.count if res.count is not None else len(res.data)
    return [to_product_list_item(p) for p in res.data], total


def to_product_list_item(product: dict) -> dict:
    variants = sorted(product.pop("product_variants", None) or [], key=lambda v: (v.get("created_at") or "", v.get("sku") or ""))
    images = sorted(product.pop("product_images", None) or [], key=lambda i: i.get("display_order") or 0)

    base_price = float(product.get("base_price") or 0)
    prices = [float(v["price_override"]) if v.get("price_override") is not None else base_price for v in variants] or [base_price]
    in_stock = [v for v in variants if (v.get("stock_quantity") or 0) > 0]
    default_variant = (in_stock or variants or [None])[0]

    return {
        **product,
        "image_url": images[0]["url"] if images else None,
        "min_price": round(min(prices), 2),
        "max_price": round(max(prices), 2),
        "total_stock": sum(v.get("stock_quantity") or 0 for v in variants),
        "variant_count": len(variants),
        "default_variant_id": default_variant["id"] if default_variant else None,
    }


def rating_summary(reviews: list[dict]) -> tuple[Optional[float], int]:
    if not reviews:
        return None, 0
    return round(sum(r["rating"] for r in reviews) / len(reviews), 2), len(reviews)
