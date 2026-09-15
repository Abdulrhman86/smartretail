"""
Admin API. Every route requires a user whose Supabase Auth app_metadata.role == "admin"
(grant it with `python scripts/make_admin.py <email>`).
"""
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from postgrest.exceptions import APIError

from app.auth import CurrentUser, invalidate_user_cache, require_admin, role_from_app_metadata
from app.catalog import (
    PRODUCT_LIST_SELECT,
    apply_product_sort,
    category_ids_with_descendants,
    rating_summary,
    sanitize_search,
    slugify,
    to_product_list_item,
)
from app.database import supabase
from app.order_service import ADMIN_STATUS_TRANSITIONS, change_order_status, get_order_detail, with_item_count
from app.schemas import (
    AdminOrderDetailResponse,
    AdminOrderResponse,
    AdminProductListItem,
    AdminStatsResponse,
    AdminUserResponse,
    CategoryCreate,
    CategoryResponse,
    CategoryUpdate,
    DiscountCreate,
    DiscountResponse,
    DiscountUpdate,
    ImageInput,
    OrderStatus,
    OrderStatusUpdate,
    ProductCreate,
    ProductDetailResponse,
    ProductImageResponse,
    ProductUpdate,
    ProductVariantResponse,
    UserRoleUpdate,
    VariantInput,
    VariantUpdate,
)

router = APIRouter(dependencies=[Depends(require_admin)])

LOW_STOCK_THRESHOLD = 5


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _conflict_or_raise(exc: APIError, what: str):
    if exc.code == "23505":  # unique_violation
        raise HTTPException(status_code=409, detail=f"{what} already exists.")
    if exc.code == "23503":  # foreign_key_violation
        raise HTTPException(status_code=409, detail=f"{what} is referenced by other records.")
    raise exc


def _all_auth_users() -> list:
    users, page = [], 1
    while True:
        batch = supabase.auth.admin.list_users(page=page, per_page=1000)
        users.extend(batch)
        if len(batch) < 1000:
            return users
        page += 1


def _emails_by_id() -> dict[str, Optional[str]]:
    return {u.id: u.email for u in _all_auth_users()}


# ── Dashboard ───────────────────────────────────────────────────────────────
@router.get("/stats", response_model=AdminStatsResponse)
def get_stats():
    orders = supabase.table("orders").select("*, order_items(quantity)").order("created_at", desc=True).execute().data or []
    products = supabase.table("products").select("id, is_active").execute().data or []
    low = (
        supabase.table("product_variants")
        .select("id, product_id, sku, size, color, stock_quantity, products(name, is_active)")
        .lte("stock_quantity", LOW_STOCK_THRESHOLD)
        .order("stock_quantity")
        .limit(50)
        .execute()
        .data
        or []
    )
    users = _all_auth_users()

    revenue_orders = [o for o in orders if o["status"] != "cancelled"]
    since = datetime.now(timezone.utc) - timedelta(days=30)
    recent_revenue = [o for o in revenue_orders if datetime.fromisoformat(o["created_at"].replace("Z", "+00:00")) >= since]
    revenue_total = round(sum(float(o["total_amount"]) for o in revenue_orders), 2)

    by_day: dict[str, float] = {}
    for day_offset in range(13, -1, -1):
        by_day[(datetime.now(timezone.utc) - timedelta(days=day_offset)).date().isoformat()] = 0.0
    for o in revenue_orders:
        day = o["created_at"][:10]
        if day in by_day:
            by_day[day] = round(by_day[day] + float(o["total_amount"]), 2)

    emails = {u.id: u.email for u in users}
    return {
        "revenue_total": revenue_total,
        "revenue_last_30_days": round(sum(float(o["total_amount"]) for o in recent_revenue), 2),
        "order_count": len(orders),
        "orders_by_status": dict(Counter(o["status"] for o in orders)),
        "average_order_value": round(revenue_total / len(revenue_orders), 2) if revenue_orders else 0.0,
        "product_count": len(products),
        "active_product_count": sum(1 for p in products if p["is_active"]),
        "customer_count": sum(1 for u in users if role_from_app_metadata(u.app_metadata) != "admin"),
        "low_stock_threshold": LOW_STOCK_THRESHOLD,
        "low_stock": [
            {
                "variant_id": v["id"],
                "product_id": v["product_id"],
                "product_name": (v.get("products") or {}).get("name", "Unknown"),
                "sku": v["sku"],
                "label": " / ".join(x for x in (v.get("size"), v.get("color")) if x) or None,
                "stock_quantity": v["stock_quantity"],
            }
            for v in low
            if (v.get("products") or {}).get("is_active", False)
        ][:10],
        "recent_orders": [with_item_count({**o, "customer_email": emails.get(o["user_id"])}) for o in orders[:6]],
        "revenue_by_day": [{"date": d, "revenue": r} for d, r in by_day.items()],
    }


# ── Products ────────────────────────────────────────────────────────────────
@router.get("/products", response_model=list[AdminProductListItem])
def list_products(
    response: Response,
    search: Optional[str] = Query(default=None, max_length=100),
    category_id: Optional[UUID] = None,
    status_filter: Literal["all", "active", "inactive"] = Query(default="all", alias="status"),
    stock: Literal["all", "low", "out"] = "all",
    sort: Literal["newest", "price-asc", "price-desc", "name-asc", "name-desc"] = "newest",
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    query = supabase.table("products").select(PRODUCT_LIST_SELECT + ", categories(name)", count="exact")
    if status_filter != "all":
        query = query.eq("is_active", status_filter == "active")
    if category_id:
        ids = category_ids_with_descendants(category_id=category_id)
        if not ids:
            response.headers["X-Total-Count"] = "0"
            return []
        query = query.in_("category_id", ids)
    term = sanitize_search(search)
    for word in (term.split(" ")[:5] if term else []):
        query = query.or_(f"name.ilike.%{word}%,brand.ilike.%{word}%,slug.ilike.%{word}%")

    if stock == "all":
        res = apply_product_sort(query, sort).range(offset, offset + limit - 1).execute()
        response.headers["X-Total-Count"] = str(res.count or 0)
        rows = res.data or []
    else:
        # Stock is per-variant, so this filter is applied after aggregation (fine at catalog scale).
        rows = apply_product_sort(query, sort).execute().data or []

    items = []
    for p in rows:
        variant_stocks = [v.get("stock_quantity") or 0 for v in (p.get("product_variants") or [])]
        if stock == "out" and any(variant_stocks):
            continue
        if stock == "low" and not any(0 < s <= LOW_STOCK_THRESHOLD for s in variant_stocks):
            continue
        category_name = (p.pop("categories", None) or {}).get("name")
        items.append({**to_product_list_item(p), "category_name": category_name})

    if stock != "all":
        response.headers["X-Total-Count"] = str(len(items))
        items = items[offset: offset + limit]
    return items


@router.get("/products/{product_id}", response_model=ProductDetailResponse)
def get_product(product_id: UUID):
    res = (
        supabase.table("products")
        .select("*, category:categories(id, parent_id, name, slug), product_variants(*), product_images(*)")
        .eq("id", str(product_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Product not found")
    product = res.data[0]
    product["product_variants"] = sorted(product.get("product_variants") or [], key=lambda v: (v.get("created_at") or "", v["sku"]))
    product["product_images"] = sorted(product.get("product_images") or [], key=lambda i: i.get("display_order") or 0)
    ratings = supabase.table("reviews").select("rating").eq("product_id", str(product_id)).execute().data or []
    product["rating_average"], product["rating_count"] = rating_summary(ratings)
    return product


def _ensure_leaf_category(category_id: UUID) -> None:
    cats = supabase.table("categories").select("id, parent_id").execute().data or []
    match = next((c for c in cats if c["id"] == str(category_id)), None)
    if not match:
        raise HTTPException(status_code=400, detail="Category not found.")
    if any(c.get("parent_id") == match["id"] for c in cats):
        raise HTTPException(status_code=400, detail="Products must belong to a subcategory, not a top-level category.")


def _unique_slug(base: str, table: str, exclude_id: Optional[str] = None) -> str:
    slug, n = base, 2
    while True:
        query = supabase.table(table).select("id").eq("slug", slug)
        if exclude_id:
            query = query.neq("id", exclude_id)
        if not query.execute().data:
            return slug
        slug, n = f"{base}-{n}", n + 1


@router.post("/products", response_model=ProductDetailResponse, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate):
    _ensure_leaf_category(payload.category_id)
    slug = _unique_slug(slugify(payload.slug or payload.name), "products")
    try:
        product = supabase.table("products").insert({
            "category_id": str(payload.category_id),
            "name": payload.name.strip(),
            "slug": slug,
            "description": payload.description,
            "brand": payload.brand,
            "base_price": round(payload.base_price, 2),
            "is_active": payload.is_active,
        }).execute().data[0]
    except APIError as exc:
        _conflict_or_raise(exc, "A product with this slug")

    # Stock always lives on variants, so every product gets at least one (a default) variant.
    variants = payload.variants or [VariantInput(sku=f"{slug[:48].upper()}-DEFAULT", stock_quantity=0)]
    try:
        supabase.table("product_variants").insert([
            {**v.model_dump(), "sku": v.sku.strip().upper(), "product_id": product["id"]} for v in variants
        ]).execute()
        if payload.images:
            supabase.table("product_images").insert([
                {**img.model_dump(), "product_id": product["id"]} for img in payload.images
            ]).execute()
    except APIError as exc:
        supabase.table("products").delete().eq("id", product["id"]).execute()
        _conflict_or_raise(exc, "A variant with this SKU (or size/color combination)")
    return get_product(UUID(product["id"]))


@router.patch("/products/{product_id}", response_model=ProductDetailResponse)
def update_product(product_id: UUID, payload: ProductUpdate):
    changes = payload.model_dump(exclude_unset=True)
    if "category_id" in changes and changes["category_id"] is not None:
        _ensure_leaf_category(changes["category_id"])
        changes["category_id"] = str(changes["category_id"])
    if "slug" in changes and changes["slug"]:
        changes["slug"] = _unique_slug(slugify(changes["slug"]), "products", exclude_id=str(product_id))
    if "base_price" in changes and changes["base_price"] is not None:
        changes["base_price"] = round(changes["base_price"], 2)
    changes = {k: v for k, v in changes.items() if v is not None or k in ("description", "brand")}
    if changes:
        changes["updated_at"] = _now_iso()
        try:
            res = supabase.table("products").update(changes).eq("id", str(product_id)).execute()
        except APIError as exc:
            _conflict_or_raise(exc, "A product with this slug")
        if not res.data:
            raise HTTPException(status_code=404, detail="Product not found")
    return get_product(product_id)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_product(product_id: UUID):
    """Soft delete: hides the product from the storefront. Hard deletes would cascade into
    carts and null out order history references, so they're intentionally not exposed."""
    res = supabase.table("products").update({"is_active": False, "updated_at": _now_iso()}).eq("id", str(product_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Product not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Variants & images ───────────────────────────────────────────────────────
@router.post("/products/{product_id}/variants", response_model=ProductVariantResponse, status_code=status.HTTP_201_CREATED)
def create_variant(product_id: UUID, payload: VariantInput):
    if not supabase.table("products").select("id").eq("id", str(product_id)).execute().data:
        raise HTTPException(status_code=404, detail="Product not found")
    try:
        return supabase.table("product_variants").insert({
            **payload.model_dump(), "sku": payload.sku.strip().upper(), "product_id": str(product_id)
        }).execute().data[0]
    except APIError as exc:
        _conflict_or_raise(exc, "A variant with this SKU (or size/color combination)")


@router.patch("/variants/{variant_id}", response_model=ProductVariantResponse)
def update_variant(variant_id: UUID, payload: VariantUpdate):
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("sku"):
        changes["sku"] = changes["sku"].strip().upper()
    for key in ("size", "color", "image_url"):
        if key in changes and isinstance(changes[key], str):
            changes[key] = changes[key].strip() or None
    if not changes:
        raise HTTPException(status_code=400, detail="No changes provided.")
    try:
        res = supabase.table("product_variants").update(changes).eq("id", str(variant_id)).execute()
    except APIError as exc:
        _conflict_or_raise(exc, "A variant with this SKU (or size/color combination)")
    if not res.data:
        raise HTTPException(status_code=404, detail="Variant not found")
    return res.data[0]


@router.delete("/variants/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_variant(variant_id: UUID):
    variant = supabase.table("product_variants").select("id, product_id").eq("id", str(variant_id)).execute().data
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")
    siblings = supabase.table("product_variants").select("id").eq("product_id", variant[0]["product_id"]).execute().data
    if len(siblings) <= 1:
        raise HTTPException(status_code=400, detail="A product must keep at least one variant. Set its stock to 0 or archive the product instead.")
    # order_items.variant_id is ON DELETE SET NULL, and order items snapshot name/price, so history survives.
    supabase.table("product_variants").delete().eq("id", str(variant_id)).execute()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/products/{product_id}/images", response_model=ProductImageResponse, status_code=status.HTTP_201_CREATED)
def add_image(product_id: UUID, payload: ImageInput):
    if not supabase.table("products").select("id").eq("id", str(product_id)).execute().data:
        raise HTTPException(status_code=404, detail="Product not found")
    return supabase.table("product_images").insert({**payload.model_dump(), "product_id": str(product_id)}).execute().data[0]


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(image_id: UUID):
    res = supabase.table("product_images").delete().eq("id", str(image_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Image not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Categories ──────────────────────────────────────────────────────────────
@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryCreate):
    if payload.parent_id:
        parent = supabase.table("categories").select("id, parent_id").eq("id", str(payload.parent_id)).execute().data
        if not parent:
            raise HTTPException(status_code=400, detail="Parent category not found.")
        if parent[0]["parent_id"]:
            raise HTTPException(status_code=400, detail="Categories are limited to two levels.")
    try:
        return supabase.table("categories").insert({
            "name": payload.name.strip(),
            "slug": _unique_slug(slugify(payload.slug or payload.name), "categories"),
            "parent_id": str(payload.parent_id) if payload.parent_id else None,
            "description": payload.description,
        }).execute().data[0]
    except APIError as exc:
        _conflict_or_raise(exc, "A category with this name")


@router.patch("/categories/{category_id}", response_model=CategoryResponse)
def update_category(category_id: UUID, payload: CategoryUpdate):
    changes = payload.model_dump(exclude_unset=True)
    if "parent_id" in changes:
        changes["parent_id"] = str(changes["parent_id"]) if changes["parent_id"] else None
        if changes["parent_id"] == str(category_id):
            raise HTTPException(status_code=400, detail="A category can't be its own parent.")
        if changes["parent_id"]:
            # Keep the hierarchy at two levels: the new parent must be top-level, and a
            # category that has subcategories can't itself become a subcategory.
            parent = supabase.table("categories").select("parent_id").eq("id", changes["parent_id"]).execute().data
            if not parent:
                raise HTTPException(status_code=400, detail="Parent category not found.")
            if parent[0]["parent_id"]:
                raise HTTPException(status_code=400, detail="Categories are limited to two levels.")
            if supabase.table("categories").select("id").eq("parent_id", str(category_id)).limit(1).execute().data:
                raise HTTPException(status_code=400, detail="This category has subcategories, so it must stay top-level.")
        elif supabase.table("products").select("id").eq("category_id", str(category_id)).limit(1).execute().data:
            raise HTTPException(status_code=400, detail="This category has products, which must stay in a subcategory. Move them first.")
    if changes.get("slug"):
        changes["slug"] = _unique_slug(slugify(changes["slug"]), "categories", exclude_id=str(category_id))
    if not changes:
        raise HTTPException(status_code=400, detail="No changes provided.")
    try:
        res = supabase.table("categories").update(changes).eq("id", str(category_id)).execute()
    except APIError as exc:
        _conflict_or_raise(exc, "A category with this name")
    if not res.data:
        raise HTTPException(status_code=404, detail="Category not found")
    return res.data[0]


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: UUID):
    if supabase.table("categories").select("id").eq("parent_id", str(category_id)).limit(1).execute().data:
        raise HTTPException(status_code=409, detail="Remove or move this category's subcategories first.")
    if supabase.table("products").select("id").eq("category_id", str(category_id)).limit(1).execute().data:
        raise HTTPException(status_code=409, detail="This category still has products. Move them first.")
    res = supabase.table("categories").delete().eq("id", str(category_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Category not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Orders ──────────────────────────────────────────────────────────────────
@router.get("/orders", response_model=list[AdminOrderResponse])
def list_orders(
    response: Response,
    status_filter: Optional[OrderStatus] = Query(default=None, alias="status"),
    search: Optional[str] = Query(default=None, max_length=100, description="Order id prefix or customer email"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    emails = _emails_by_id()
    query = supabase.table("orders").select("*, order_items(quantity)", count="exact").order("created_at", desc=True)
    if status_filter:
        query = query.eq("status", status_filter)

    term = (search or "").strip().lower()
    if term:
        # Order ids are UUIDs (no text search in PostgREST) and emails live in auth.users, so match in Python.
        rows = query.execute().data or []
        rows = [o for o in rows if o["id"].startswith(term) or term in (emails.get(o["user_id"]) or "").lower()]
        response.headers["X-Total-Count"] = str(len(rows))
        rows = rows[offset: offset + limit]
    else:
        res = query.range(offset, offset + limit - 1).execute()
        response.headers["X-Total-Count"] = str(res.count or 0)
        rows = res.data or []
    return [with_item_count({**o, "customer_email": emails.get(o["user_id"])}) for o in rows]


def _admin_order_detail(order_id: str) -> dict:
    order = get_order_detail(order_id)
    try:
        order["customer_email"] = supabase.auth.admin.get_user_by_id(order["user_id"]).user.email
    except Exception:
        order["customer_email"] = None
    if order.get("discount_id"):
        d = supabase.table("discounts").select("code").eq("id", order["discount_id"]).execute().data
        order["discount_code"] = d[0]["code"] if d else None
    return order


@router.get("/orders/{order_id}", response_model=AdminOrderDetailResponse)
def get_order(order_id: UUID):
    return _admin_order_detail(str(order_id))


@router.patch("/orders/{order_id}", response_model=AdminOrderDetailResponse)
def update_order_status(order_id: UUID, payload: OrderStatusUpdate):
    order = get_order_detail(str(order_id))
    if payload.status == order["status"]:
        return _admin_order_detail(str(order_id))
    if payload.status not in ADMIN_STATUS_TRANSITIONS[order["status"]]:
        allowed = ", ".join(sorted(ADMIN_STATUS_TRANSITIONS[order["status"]])) or "none"
        raise HTTPException(status_code=400, detail=f"Cannot move an order from '{order['status']}' to '{payload.status}'. Allowed: {allowed}.")
    change_order_status(order, payload.status, {order["status"]})
    return _admin_order_detail(str(order_id))


# ── Discounts ───────────────────────────────────────────────────────────────
def _validate_discount_values(discount_type: str, value: float, valid_from, valid_until):
    if discount_type == "percentage" and value > 100:
        raise HTTPException(status_code=400, detail="Percentage discounts can't exceed 100.")
    if valid_from and valid_until and valid_until <= valid_from:
        raise HTTPException(status_code=400, detail="valid_until must be after valid_from.")


def _serialize_dates(data: dict) -> dict:
    return {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in data.items()}


@router.get("/discounts", response_model=list[DiscountResponse])
def list_discounts():
    return supabase.table("discounts").select("*").order("code").execute().data


@router.post("/discounts", response_model=DiscountResponse, status_code=status.HTTP_201_CREATED)
def create_discount(payload: DiscountCreate):
    _validate_discount_values(payload.discount_type, payload.discount_value, payload.valid_from, payload.valid_until)
    data = payload.model_dump(exclude_none=True)
    data["code"] = data["code"].upper()
    try:
        return supabase.table("discounts").insert(_serialize_dates(data)).execute().data[0]
    except APIError as exc:
        _conflict_or_raise(exc, "A discount with this code")


@router.patch("/discounts/{discount_id}", response_model=DiscountResponse)
def update_discount(discount_id: UUID, payload: DiscountUpdate):
    current = supabase.table("discounts").select("*").eq("id", str(discount_id)).execute().data
    if not current:
        raise HTTPException(status_code=404, detail="Discount not found")
    changes = payload.model_dump(exclude_unset=True)
    merged = {**current[0], **_serialize_dates(changes)}

    def _ts(v):
        return datetime.fromisoformat(v.replace("Z", "+00:00")) if isinstance(v, str) else v

    _validate_discount_values(merged["discount_type"], float(merged["discount_value"]), _ts(merged.get("valid_from")), _ts(merged.get("valid_until")))
    if not changes:
        return current[0]
    return supabase.table("discounts").update(_serialize_dates(changes)).eq("id", str(discount_id)).execute().data[0]


@router.delete("/discounts/{discount_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_discount(discount_id: UUID):
    """Only never-used codes can be deleted; used codes should be deactivated so order history keeps its reference."""
    current = supabase.table("discounts").select("uses_count").eq("id", str(discount_id)).execute().data
    if not current:
        raise HTTPException(status_code=404, detail="Discount not found")
    used = supabase.table("orders").select("id").eq("discount_id", str(discount_id)).limit(1).execute().data
    if current[0]["uses_count"] > 0 or used:
        raise HTTPException(status_code=409, detail="This code has been used. Deactivate it instead of deleting it.")
    supabase.table("discounts").delete().eq("id", str(discount_id)).execute()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Users ───────────────────────────────────────────────────────────────────
@router.get("/users", response_model=list[AdminUserResponse])
def list_users(search: Optional[str] = Query(default=None, max_length=100)):
    users = _all_auth_users()
    profiles = {p["id"]: p for p in (supabase.table("profiles").select("id, full_name").execute().data or [])}
    order_counts = Counter(o["user_id"] for o in (supabase.table("orders").select("user_id").execute().data or []))
    term = (search or "").strip().lower()

    result = []
    for u in users:
        full_name = (profiles.get(u.id) or {}).get("full_name") or (u.user_metadata or {}).get("full_name")
        if term and term not in (u.email or "").lower() and term not in (full_name or "").lower():
            continue
        result.append({
            "id": u.id,
            "email": u.email,
            "full_name": full_name,
            "role": role_from_app_metadata(u.app_metadata),
            "created_at": u.created_at,
            "last_sign_in_at": u.last_sign_in_at,
            "email_confirmed": bool(u.email_confirmed_at),
            "order_count": order_counts.get(u.id, 0),
        })
    result.sort(key=lambda r: r["created_at"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return result


@router.patch("/users/{user_id}/role", response_model=AdminUserResponse)
def update_user_role(user_id: UUID, payload: UserRoleUpdate, admin: CurrentUser = Depends(require_admin)):
    if user_id == admin.id and payload.role != "admin":
        raise HTTPException(status_code=400, detail="You can't remove your own admin role.")
    try:
        existing = supabase.auth.admin.get_user_by_id(str(user_id)).user
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")

    app_metadata = {**(existing.app_metadata or {}), "role": payload.role}
    supabase.auth.admin.update_user_by_id(str(user_id), {"app_metadata": app_metadata})
    invalidate_user_cache(user_id)

    return next(u for u in list_users(search=None) if u["id"] == str(user_id))
