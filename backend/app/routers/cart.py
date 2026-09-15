from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Response, status
from postgrest.exceptions import APIError

from app.auth import get_current_user
from app.database import supabase
from app.pricing import unit_price_for
from app.schemas import CartItemCreate, CartItemResponse, CartItemUpdate, CartResponse

router = APIRouter()

CART_ITEM_SELECT = (
    "*, product_variants(*, products(id, name, slug, base_price, is_active, product_images(url, display_order)))"
)


def get_or_create_cart(user_id: UUID) -> dict:
    cart_res = supabase.table("carts").select("*").eq("user_id", str(user_id)).execute()
    if cart_res.data:
        return cart_res.data[0]
    try:
        return supabase.table("carts").insert({"user_id": str(user_id)}).execute().data[0]
    except APIError:
        # Two concurrent first requests can race on carts.user_id (unique) — the loser re-reads.
        cart_res = supabase.table("carts").select("*").eq("user_id", str(user_id)).execute()
        if cart_res.data:
            return cart_res.data[0]
        raise


def shape_cart_item(item: dict) -> dict:
    """Adds unit_price/line_total and flattens the product's primary image."""
    variant = item.get("product_variants") or {}
    product = variant.get("products") or {}
    images = sorted(product.pop("product_images", None) or [], key=lambda i: i.get("display_order") or 0)
    if product:
        product["image_url"] = images[0]["url"] if images else None
    unit_price = unit_price_for(variant, product) if variant else 0.0
    item["unit_price"] = unit_price
    item["line_total"] = round(unit_price * item["quantity"], 3)
    return item


def fetch_cart_items(cart_id: str) -> list[dict]:
    res = (
        supabase.table("cart_items")
        .select(CART_ITEM_SELECT)
        .eq("cart_id", cart_id)
        .order("added_at")
        .execute()
    )
    return [shape_cart_item(i) for i in (res.data or [])]


def _get_owned_item(item_id: UUID, user_id: UUID, columns: str = "*") -> dict:
    """Loads a cart item only if it belongs to the caller's cart. Items in other users'
    carts return 404 (not 403) so item ids can't be probed."""
    cart_res = supabase.table("carts").select("id").eq("user_id", str(user_id)).execute()
    if not cart_res.data:
        raise HTTPException(status_code=404, detail="Cart item not found")
    item_res = (
        supabase.table("cart_items")
        .select(columns)
        .eq("id", str(item_id))
        .eq("cart_id", cart_res.data[0]["id"])
        .execute()
    )
    if not item_res.data:
        raise HTTPException(status_code=404, detail="Cart item not found")
    return item_res.data[0]


def _fetch_item(item_id: str) -> dict:
    res = supabase.table("cart_items").select(CART_ITEM_SELECT).eq("id", item_id).execute()
    return shape_cart_item(res.data[0])


@router.get("", response_model=CartResponse)
def get_cart(
    current_user_id: UUID = Depends(get_current_user),
):
    cart = get_or_create_cart(current_user_id)
    items = fetch_cart_items(cart["id"])
    cart["items"] = items
    cart["subtotal"] = round(sum(i["line_total"] for i in items), 3)
    cart["item_count"] = sum(i["quantity"] for i in items)
    return cart


@router.post("/items", response_model=CartItemResponse)
def add_cart_item(
    payload: CartItemCreate,
    current_user_id: UUID = Depends(get_current_user),
):
    cart = get_or_create_cart(current_user_id)

    # Verify variant exists, belongs to an active product, and check available stock
    var_res = (
        supabase.table("product_variants")
        .select("id, stock_quantity, products(is_active)")
        .eq("id", str(payload.variant_id))
        .execute()
    )
    if not var_res.data or not (var_res.data[0].get("products") or {}).get("is_active", False):
        raise HTTPException(status_code=404, detail="Product variant not found")

    available_stock = var_res.data[0]["stock_quantity"]

    existing_item_res = (
        supabase.table("cart_items")
        .select("*")
        .eq("cart_id", cart["id"])
        .eq("variant_id", str(payload.variant_id))
        .execute()
    )

    if existing_item_res.data:
        existing_item = existing_item_res.data[0]
        new_quantity = existing_item["quantity"] + payload.quantity
        if new_quantity > available_stock:
            raise HTTPException(
                status_code=400,
                detail=f"Requested total quantity ({new_quantity}) exceeds available stock ({available_stock})",
            )
        update_res = (
            supabase.table("cart_items")
            .update({"quantity": new_quantity})
            .eq("id", existing_item["id"])
            .execute()
        )
        item_id = update_res.data[0]["id"]
    else:
        if payload.quantity > available_stock:
            raise HTTPException(
                status_code=400,
                detail=f"Requested quantity ({payload.quantity}) exceeds available stock ({available_stock})",
            )
        insert_res = (
            supabase.table("cart_items")
            .insert({
                "cart_id": cart["id"],
                "variant_id": str(payload.variant_id),
                "quantity": payload.quantity,
            })
            .execute()
        )
        item_id = insert_res.data[0]["id"]

    return _fetch_item(item_id)


@router.patch("/items/{item_id}", response_model=CartItemResponse)
def update_cart_item(
    item_id: UUID,
    payload: CartItemUpdate,
    current_user_id: UUID = Depends(get_current_user),
):
    item = _get_owned_item(item_id, current_user_id, "*, product_variants(stock_quantity)")
    available_stock = (item.get("product_variants") or {}).get("stock_quantity", 0)

    if payload.quantity > available_stock:
        raise HTTPException(
            status_code=400,
            detail=f"Requested quantity ({payload.quantity}) exceeds available stock ({available_stock})",
        )

    supabase.table("cart_items").update({"quantity": payload.quantity}).eq("id", str(item_id)).execute()
    return _fetch_item(str(item_id))


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cart_item(
    item_id: UUID,
    current_user_id: UUID = Depends(get_current_user),
):
    _get_owned_item(item_id, current_user_id, "id")
    supabase.table("cart_items").delete().eq("id", str(item_id)).execute()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_cart(
    current_user_id: UUID = Depends(get_current_user),
):
    cart_res = supabase.table("carts").select("id").eq("user_id", str(current_user_id)).execute()
    if cart_res.data:
        supabase.table("cart_items").delete().eq("cart_id", cart_res.data[0]["id"]).execute()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
