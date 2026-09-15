from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.auth import CurrentUser, get_current_user_info
from app.catalog import rating_summary, search_catalog
from app.database import supabase
from app.schemas import (
    CategoryResponse,
    ProductDetailResponse,
    ProductListItem,
    ReviewCreate,
    ReviewListResponse,
    ReviewResponse,
)

router = APIRouter()

ProductSort = Literal["newest", "price-asc", "price-desc", "name-asc", "name-desc"]


@router.get("/products", response_model=list[ProductListItem])
def get_products(
    response: Response,
    category_id: Optional[UUID] = Query(default=None, description="Category id; a top-level category includes its subcategories"),
    category: Optional[str] = Query(default=None, max_length=120, description="Category slug; a top-level category includes its subcategories"),
    search: Optional[str] = Query(default=None, max_length=100),
    brand: Optional[str] = Query(default=None, max_length=100),
    min_price: Optional[float] = Query(default=None, ge=0),
    max_price: Optional[float] = Query(default=None, ge=0),
    sort: ProductSort = "newest",
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """Public catalog. Inactive products are never returned here (admins use /admin/products).
    The total number of matches is returned in the X-Total-Count header."""
    items, total = search_catalog(
        category_id=category_id,
        category=category,
        search=search,
        brand=brand,
        min_price=min_price,
        max_price=max_price,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get("/products/{product_id}", response_model=ProductDetailResponse)
def get_product(product_id: UUID):
    res = (
        supabase.table("products")
        .select("*, category:categories(id, parent_id, name, slug), product_variants(*), product_images(*)")
        .eq("id", str(product_id))
        .eq("is_active", True)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Product not found")

    product = res.data[0]
    product["product_variants"] = sorted(
        product.get("product_variants") or [], key=lambda v: (v.get("created_at") or "", v.get("sku") or "")
    )
    product["product_images"] = sorted(product.get("product_images") or [], key=lambda i: i.get("display_order") or 0)

    ratings = supabase.table("reviews").select("rating").eq("product_id", str(product_id)).execute().data or []
    product["rating_average"], product["rating_count"] = rating_summary(ratings)
    return product


@router.get("/categories", response_model=list[CategoryResponse])
def get_categories():
    res = supabase.table("categories").select("*").order("name").execute()
    return res.data


@router.get("/brands", response_model=list[str])
def get_brands():
    res = supabase.table("products").select("brand").eq("is_active", True).execute()
    return sorted({p["brand"] for p in res.data if p.get("brand")})


# ── Reviews ─────────────────────────────────────────────────────────────────
def _author_names(user_ids: list[str]) -> dict[str, str]:
    if not user_ids:
        return {}
    res = supabase.table("profiles").select("id, full_name").in_("id", user_ids).execute()
    return {p["id"]: p.get("full_name") or "" for p in res.data}


def _to_review_response(review: dict, names: dict[str, str]) -> dict:
    return {**review, "author_name": names.get(review["user_id"]) or "Verified customer"}


def _ensure_active_product(product_id: UUID) -> None:
    res = supabase.table("products").select("id").eq("id", str(product_id)).eq("is_active", True).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Product not found")


@router.get("/products/{product_id}/reviews", response_model=ReviewListResponse)
def get_product_reviews(product_id: UUID):
    _ensure_active_product(product_id)
    reviews = (
        supabase.table("reviews")
        .select("*")
        .eq("product_id", str(product_id))
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    names = _author_names(list({r["user_id"] for r in reviews}))
    average, count = rating_summary(reviews)
    return {
        "rating_average": average,
        "rating_count": count,
        "reviews": [_to_review_response(r, names) for r in reviews],
    }


@router.put("/products/{product_id}/reviews/me", response_model=ReviewResponse)
def upsert_my_review(
    product_id: UUID,
    payload: ReviewCreate,
    user: CurrentUser = Depends(get_current_user_info),
):
    """Create or replace the caller's review (the schema allows one review per user per product)."""
    _ensure_active_product(product_id)
    res = (
        supabase.table("reviews")
        .upsert(
            {
                "product_id": str(product_id),
                "user_id": str(user.id),
                "rating": payload.rating,
                "title": payload.title,
                "body": payload.body,
            },
            on_conflict="product_id,user_id",
        )
        .execute()
    )
    review = res.data[0]
    return _to_review_response(review, _author_names([review["user_id"]]))


@router.delete("/products/{product_id}/reviews/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_review(
    product_id: UUID,
    user: CurrentUser = Depends(get_current_user_info),
):
    res = (
        supabase.table("reviews")
        .delete()
        .eq("product_id", str(product_id))
        .eq("user_id", str(user.id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Review not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
