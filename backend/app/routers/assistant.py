"""
Assistant endpoints.

Two separate surfaces on one engine: `/assistant` for signed-in shoppers (catalog, their own
cart and orders) and `/admin/assistant` for administrators (business analytics plus actions).
They never share a tool set, so a customer token cannot reach business data.

Admin actions are proposed, not performed: the model's call is parked here and only executed
when the same admin confirms it through /admin/assistant/confirm.
"""
import secrets
import threading
import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.assistant import run_chat
from app.assistant_tools import (
    ADMIN_SYSTEM_PROMPT,
    CUSTOMER_SYSTEM_PROMPT,
    admin_tools,
    customer_tools,
)
from app.auth import CurrentUser, get_current_user_info, require_admin
from app.routers.admin import archive_product, update_variant
from app.schemas import (
    AdminAssistantChatResponse,
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantConfirmRequest,
    AssistantConfirmResponse,
    VariantUpdate,
)

router = APIRouter()
admin_router = APIRouter(dependencies=[Depends(require_admin)])

NO_REPLY = "I couldn't come up with an answer for that. Could you try rephrasing?"

# ── Rate limiting ───────────────────────────────────────────────────────────
# Each turn costs at least two Gemini calls (tool round-trip, then the answer) and the free
# tier allows only a handful per minute, so keep the per-user cap below that.
RATE_LIMIT = 6
RATE_WINDOW_SECONDS = 60
_RATE_MAX_KEYS = 1000
_hits: dict[str, list[float]] = {}
_hits_lock = threading.Lock()


def _enforce_rate_limit(key: str) -> None:
    now = time.monotonic()
    with _hits_lock:
        if len(_hits) >= _RATE_MAX_KEYS:
            for stale in [k for k, times in _hits.items() if not times or now - times[-1] > RATE_WINDOW_SECONDS]:
                del _hits[stale]
        recent = [t for t in _hits.get(key, []) if now - t < RATE_WINDOW_SECONDS]
        if len(recent) >= RATE_LIMIT:
            raise HTTPException(status_code=429, detail="You're sending messages faster than the assistant can keep up. Give it a minute.")
        recent.append(now)
        _hits[key] = recent


# ── Pending admin actions ───────────────────────────────────────────────────
PENDING_TTL_SECONDS = 300
_pending: dict[str, dict] = {}
_pending_lock = threading.Lock()


def _proposer(admin_id: UUID):
    """Returns the `propose` callable the admin action tools use to queue a change."""
    def propose(tool: str, args: dict, description: str) -> dict:
        action_id = secrets.token_urlsafe(16)
        now = time.monotonic()
        with _pending_lock:
            for stale in [k for k, v in _pending.items() if v["expires_at"] <= now]:
                del _pending[stale]
            _pending[action_id] = {
                "tool": tool,
                "args": args,
                "description": description,
                "admin_id": str(admin_id),
                "expires_at": now + PENDING_TTL_SECONDS,
            }
        return {"id": action_id, "tool": tool, "description": description, "args": args}

    return propose


def _take_pending(action_id: str, admin_id: UUID) -> dict:
    """Single-use: the action is removed as it is read, so a confirmation can't be replayed."""
    with _pending_lock:
        action = _pending.get(action_id)
        if not action or action["expires_at"] <= time.monotonic():
            _pending.pop(action_id, None)
            raise HTTPException(status_code=404, detail="That request has expired. Ask the assistant again.")
        if action["admin_id"] != str(admin_id):
            raise HTTPException(status_code=404, detail="That request has expired. Ask the assistant again.")
        del _pending[action_id]
        return action


# ── Customer assistant ──────────────────────────────────────────────────────
@router.post("/chat", response_model=AssistantChatResponse)
def chat(payload: AssistantChatRequest, user: CurrentUser = Depends(get_current_user_info)):
    _enforce_rate_limit(str(user.id))
    outcome = run_chat(
        messages=payload.messages,
        system_instruction=CUSTOMER_SYSTEM_PROMPT,
        tools=customer_tools(user.id),
    )
    return {"reply": outcome.reply or NO_REPLY, "products": outcome.products}


# ── Admin assistant ─────────────────────────────────────────────────────────
@admin_router.post("/chat", response_model=AdminAssistantChatResponse)
def admin_chat(payload: AssistantChatRequest, admin: CurrentUser = Depends(require_admin)):
    _enforce_rate_limit(str(admin.id))
    outcome = run_chat(
        messages=payload.messages,
        system_instruction=ADMIN_SYSTEM_PROMPT,
        tools=admin_tools(_proposer(admin.id)),
    )
    return {
        "reply": outcome.reply or NO_REPLY,
        "report": outcome.report,
        "pending_action": outcome.pending_action,
    }


@admin_router.post("/confirm", response_model=AssistantConfirmResponse)
def admin_confirm(payload: AssistantConfirmRequest, admin: CurrentUser = Depends(require_admin)):
    action = _take_pending(payload.id, admin.id)
    if not payload.approve:
        return {"ok": False, "reply": "Cancelled — nothing was changed."}

    if action["tool"] == "archive_product":
        archive_product(UUID(action["args"]["product_id"]))
        return {"ok": True, "reply": "Done — the product is archived and no longer visible in the store."}

    if action["tool"] == "restock_variant":
        variant = update_variant(
            UUID(action["args"]["variant_id"]),
            VariantUpdate(stock_quantity=action["args"]["stock_quantity"]),
        )
        return {"ok": True, "reply": f"Done — stock is now {variant['stock_quantity']}."}

    raise HTTPException(status_code=400, detail="That action is no longer supported.")
