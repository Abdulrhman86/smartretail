from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

# Note: Using float instead of Decimal for the numeric(10,3) KD money fields for simplicity

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
PASSWORD_MIN_LENGTH = 8

OrderStatus = Literal["pending", "paid", "shipped", "delivered", "cancelled"]
ShippingMethod = Literal["standard", "express"]
UserRole = Literal["admin", "customer"]


def _strip_or_none(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


# --- Auth Schemas ---
class UserSignUp(BaseModel):
    email: str = Field(pattern=EMAIL_PATTERN, max_length=254)
    password: str = Field(
        min_length=PASSWORD_MIN_LENGTH,
        max_length=128,
        description=f"Password must be at least {PASSWORD_MIN_LENGTH} characters",
    )
    full_name: Optional[str] = Field(default=None, max_length=120)
    avatar_url: Optional[str] = Field(default=None, max_length=2048)

    _clean = field_validator("full_name", "avatar_url")(_strip_or_none)


class UserLogin(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class UserProfileResponse(BaseModel):
    id: UUID
    email: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: UserRole = "customer"


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    avatar_url: Optional[str] = Field(default=None, max_length=2048)

    _clean = field_validator("full_name", "avatar_url")(_strip_or_none)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: Optional[str] = None
    expires_at: Optional[int] = None
    # True when Supabase requires email confirmation: no session/tokens are issued yet.
    requires_email_confirmation: bool = False
    user: UserProfileResponse


# --- Category Schemas ---
class CategoryResponse(BaseModel):
    id: UUID
    parent_id: Optional[UUID] = None
    name: str
    slug: str
    description: Optional[str] = None
    created_at: datetime


class CategorySummary(BaseModel):
    id: UUID
    parent_id: Optional[UUID] = None
    name: str
    slug: str


# --- Product Variant Schemas ---
class ProductVariantResponse(BaseModel):
    id: UUID
    product_id: UUID
    sku: str
    size: Optional[str] = None
    color: Optional[str] = None
    price_override: Optional[float] = None
    stock_quantity: int
    image_url: Optional[str] = None
    created_at: datetime


# --- Product Image Schemas ---
class ProductImageResponse(BaseModel):
    id: UUID
    product_id: UUID
    url: str
    alt_text: Optional[str] = None
    display_order: int


# --- Product Schemas ---
class ProductResponse(BaseModel):
    id: UUID
    category_id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    brand: Optional[str] = None
    base_price: float
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProductListItem(ProductResponse):
    """Catalog card data: derived from variants/images so the list page never needs
    a follow-up detail request per product."""
    image_url: Optional[str] = None
    min_price: float
    max_price: float
    total_stock: int
    variant_count: int
    default_variant_id: Optional[UUID] = None  # first in-stock variant, else first variant


class ProductDetailResponse(ProductResponse):
    category: Optional[CategorySummary] = None
    product_variants: list[ProductVariantResponse] = []
    product_images: list[ProductImageResponse] = []
    rating_average: Optional[float] = None
    rating_count: int = 0


# --- Review Schemas ---
class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: Optional[str] = Field(default=None, max_length=120)
    body: Optional[str] = Field(default=None, max_length=4000)

    _clean = field_validator("title", "body")(_strip_or_none)


class ReviewResponse(BaseModel):
    id: UUID
    product_id: UUID
    user_id: UUID
    author_name: str
    rating: int
    title: Optional[str] = None
    body: Optional[str] = None
    created_at: datetime


class ReviewListResponse(BaseModel):
    rating_average: Optional[float] = None
    rating_count: int
    reviews: list[ReviewResponse]


# --- Cart Schemas ---
class CartItemCreate(BaseModel):
    variant_id: UUID
    quantity: int = Field(gt=0, le=99, description="Quantity must be between 1 and 99")


class CartItemUpdate(BaseModel):
    quantity: int = Field(gt=0, le=99, description="Quantity must be between 1 and 99")


class CartItemProductSummary(BaseModel):
    id: Optional[UUID] = None
    name: str
    slug: Optional[str] = None
    base_price: float
    is_active: bool = True
    image_url: Optional[str] = None


class CartItemVariantInfo(BaseModel):
    id: Optional[UUID] = None
    sku: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    price_override: Optional[float] = None
    stock_quantity: int
    image_url: Optional[str] = None
    products: Optional[CartItemProductSummary] = None


class CartItemResponse(BaseModel):
    id: UUID
    cart_id: UUID
    variant_id: UUID
    quantity: int
    added_at: datetime
    unit_price: float = 0.0
    line_total: float = 0.0
    product_variants: Optional[CartItemVariantInfo] = None


class CartResponse(BaseModel):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    subtotal: float = 0.0
    item_count: int = 0
    items: list[CartItemResponse] = []


# --- Order Schemas ---
class ShippingAddress(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    street_address: str = Field(min_length=1, max_length=200)
    suite_unit: Optional[str] = Field(default=None, max_length=100)
    city: str = Field(min_length=1, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    postal_code: str = Field(min_length=1, max_length=20)
    country: str = Field(min_length=1, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=40)
    delivery_notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("*", mode="before")
    @classmethod
    def _strip(cls, value):
        return value.strip() if isinstance(value, str) else value


class OrderQuoteRequest(BaseModel):
    shipping_method: ShippingMethod = "standard"
    discount_code: Optional[str] = Field(default=None, max_length=50)

    _clean = field_validator("discount_code")(_strip_or_none)


class OrderCreate(OrderQuoteRequest):
    shipping_address: ShippingAddress


class OrderQuoteResponse(BaseModel):
    subtotal: float
    discount_code: Optional[str] = None
    discount_amount: float
    shipping_method: ShippingMethod
    shipping_amount: float
    total_amount: float
    item_count: int
    free_shipping_threshold: float


class OrderItemResponse(BaseModel):
    id: UUID
    order_id: UUID
    variant_id: Optional[UUID] = None
    product_name: str
    variant_label: Optional[str] = None
    unit_price: float
    quantity: int
    line_total: float


class OrderResponse(BaseModel):
    id: UUID
    user_id: UUID
    status: OrderStatus
    subtotal: float
    discount_id: Optional[UUID] = None
    discount_amount: float
    shipping_amount: float
    total_amount: float
    shipping_address: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    item_count: int = 0


class OrderDetailResponse(OrderResponse):
    order_items: list[OrderItemResponse] = []


# --- Admin Schemas ---
class AdminOrderResponse(OrderResponse):
    customer_email: Optional[str] = None


class AdminOrderDetailResponse(OrderDetailResponse):
    customer_email: Optional[str] = None
    discount_code: Optional[str] = None


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class VariantInput(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    size: Optional[str] = Field(default=None, max_length=40)
    color: Optional[str] = Field(default=None, max_length=40)
    price_override: Optional[float] = Field(default=None, ge=0)
    stock_quantity: int = Field(default=0, ge=0)
    image_url: Optional[str] = Field(default=None, max_length=2048)

    _clean = field_validator("size", "color", "image_url")(_strip_or_none)


class VariantUpdate(BaseModel):
    sku: Optional[str] = Field(default=None, min_length=1, max_length=64)
    size: Optional[str] = Field(default=None, max_length=40)
    color: Optional[str] = Field(default=None, max_length=40)
    price_override: Optional[float] = Field(default=None, ge=0)
    stock_quantity: Optional[int] = Field(default=None, ge=0)
    image_url: Optional[str] = Field(default=None, max_length=2048)


class ImageInput(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    alt_text: Optional[str] = Field(default=None, max_length=200)
    display_order: int = Field(default=0, ge=0)


class ProductCreate(BaseModel):
    category_id: UUID
    name: str = Field(min_length=1, max_length=200)
    slug: Optional[str] = Field(default=None, max_length=220)
    description: Optional[str] = Field(default=None, max_length=5000)
    brand: Optional[str] = Field(default=None, max_length=100)
    base_price: float = Field(ge=0)
    is_active: bool = True
    variants: list[VariantInput] = Field(default_factory=list)
    images: list[ImageInput] = Field(default_factory=list)

    _clean = field_validator("slug", "description", "brand")(_strip_or_none)


class ProductUpdate(BaseModel):
    category_id: Optional[UUID] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=220)
    description: Optional[str] = Field(default=None, max_length=5000)
    brand: Optional[str] = Field(default=None, max_length=100)
    base_price: Optional[float] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class AdminProductListItem(ProductListItem):
    category_name: Optional[str] = None


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: Optional[str] = Field(default=None, max_length=120)
    parent_id: Optional[UUID] = None
    description: Optional[str] = Field(default=None, max_length=500)


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=120)
    parent_id: Optional[UUID] = None
    description: Optional[str] = Field(default=None, max_length=500)


class DiscountResponse(BaseModel):
    id: UUID
    code: str
    description: Optional[str] = None
    discount_type: Literal["percentage", "fixed"]
    discount_value: float
    min_order_amount: float
    max_uses: Optional[int] = None
    uses_count: int
    valid_from: datetime
    valid_until: Optional[datetime] = None
    is_active: bool


class DiscountCreate(BaseModel):
    code: str = Field(min_length=2, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    description: Optional[str] = Field(default=None, max_length=200)
    discount_type: Literal["percentage", "fixed"]
    discount_value: float = Field(gt=0)
    min_order_amount: float = Field(default=0, ge=0)
    max_uses: Optional[int] = Field(default=None, gt=0)
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    is_active: bool = True


class DiscountUpdate(BaseModel):
    description: Optional[str] = Field(default=None, max_length=200)
    discount_type: Optional[Literal["percentage", "fixed"]] = None
    discount_value: Optional[float] = Field(default=None, gt=0)
    min_order_amount: Optional[float] = Field(default=None, ge=0)
    max_uses: Optional[int] = Field(default=None, gt=0)
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    is_active: Optional[bool] = None


class AdminUserResponse(BaseModel):
    id: UUID
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: UserRole
    created_at: Optional[datetime] = None
    last_sign_in_at: Optional[datetime] = None
    email_confirmed: bool = False
    order_count: int = 0


class UserRoleUpdate(BaseModel):
    role: UserRole


class LowStockVariant(BaseModel):
    variant_id: UUID
    product_id: UUID
    product_name: str
    sku: str
    label: Optional[str] = None
    stock_quantity: int


class AdminStatsResponse(BaseModel):
    revenue_total: float
    revenue_last_30_days: float
    order_count: int
    orders_by_status: dict[str, int]
    average_order_value: float
    product_count: int
    active_product_count: int
    customer_count: int
    low_stock_threshold: int
    low_stock: list[LowStockVariant]
    recent_orders: list[AdminOrderResponse]
    revenue_by_day: list[dict[str, Any]]


# --- Assistant Schemas ---
class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class AssistantChatRequest(BaseModel):
    """Conversation history is held by the client and replayed on each turn, so the server
    stays stateless. Only the most recent messages are sent to the model."""
    messages: list[AssistantMessage] = Field(min_length=1, max_length=20)


class AssistantChatResponse(BaseModel):
    reply: str
    products: list[ProductListItem] = []


class AssistantReportColumn(BaseModel):
    key: str
    label: str
    format: Literal["text", "number", "currency", "date"] = "text"


class AssistantReportStat(BaseModel):
    label: str
    value: Any
    format: Literal["text", "number", "currency", "date"] = "text"


class AssistantReport(BaseModel):
    """A table the admin UI renders itself, so figures never depend on the model's formatting."""
    kind: str
    title: str
    summary: list[AssistantReportStat] = []
    columns: list[AssistantReportColumn] = []
    rows: list[dict[str, Any]] = []


class AssistantPendingAction(BaseModel):
    id: str
    tool: str
    description: str
    args: dict[str, Any]


class AdminAssistantChatResponse(BaseModel):
    reply: str
    report: Optional[AssistantReport] = None
    pending_action: Optional[AssistantPendingAction] = None


class AssistantConfirmRequest(BaseModel):
    id: str = Field(max_length=64)
    approve: bool


class AssistantConfirmResponse(BaseModel):
    ok: bool
    reply: str
