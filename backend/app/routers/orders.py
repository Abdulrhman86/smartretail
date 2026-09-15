from uuid import UUID
from fastapi import APIRouter, Depends, Query, Response

from app.auth import get_current_user
from app.database import supabase
from app.order_service import (
    CUSTOMER_CANCELLABLE,
    change_order_status,
    get_order_detail,
    place_order,
    quote_for_user,
    with_item_count,
)
from app.pricing import FREE_SHIPPING_THRESHOLD
from app.schemas import OrderCreate, OrderDetailResponse, OrderQuoteRequest, OrderQuoteResponse, OrderResponse

router = APIRouter()


@router.post("/quote", response_model=OrderQuoteResponse)
def quote_order(
    payload: OrderQuoteRequest,
    current_user_id: UUID = Depends(get_current_user),
):
    """Prices the current cart exactly as POST /orders would (shipping + discount), without
    placing an order. Returns 400 with a reason if the discount code can't be applied."""
    _, _, quote = quote_for_user(current_user_id, payload.shipping_method, payload.discount_code)
    return {
        "subtotal": quote.subtotal,
        "discount_code": quote.discount_code,
        "discount_amount": quote.discount_amount,
        "shipping_method": quote.shipping_method,
        "shipping_amount": quote.shipping_amount,
        "total_amount": quote.total_amount,
        "item_count": quote.item_count,
        "free_shipping_threshold": FREE_SHIPPING_THRESHOLD,
    }


@router.post("", response_model=OrderDetailResponse)
def create_order(
    payload: OrderCreate,
    current_user_id: UUID = Depends(get_current_user),
):
    return place_order(
        current_user_id,
        payload.shipping_address.model_dump(exclude_none=True),
        payload.shipping_method,
        payload.discount_code,
    )


@router.get("", response_model=list[OrderResponse])
def get_orders(
    response: Response,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user_id: UUID = Depends(get_current_user),
):
    res = (
        supabase.table("orders")
        .select("*, order_items(quantity)", count="exact")
        .eq("user_id", str(current_user_id))
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    response.headers["X-Total-Count"] = str(res.count if res.count is not None else len(res.data))
    return [with_item_count(o) for o in (res.data or [])]


@router.get("/{order_id}", response_model=OrderDetailResponse)
def get_order(
    order_id: UUID,
    current_user_id: UUID = Depends(get_current_user),
):
    return get_order_detail(str(order_id), current_user_id)


@router.post("/{order_id}/cancel", response_model=OrderDetailResponse)
def cancel_order(
    order_id: UUID,
    current_user_id: UUID = Depends(get_current_user),
):
    """Customers can cancel their own order while it is still pending; stock is restored."""
    order = get_order_detail(str(order_id), current_user_id)
    return change_order_status(order, "cancelled", CUSTOMER_CANCELLABLE)
