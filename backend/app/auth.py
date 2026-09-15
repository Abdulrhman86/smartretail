import hashlib
import threading
import time
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase_auth.errors import AuthApiError, AuthError

from app.database import supabase

# HTTPBearer extracts the token from `Authorization: Bearer <token>` header
security = HTTPBearer(auto_error=False)

ADMIN_ROLE = "admin"


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: Optional[str]
    role: str  # "admin" or "customer"
    user_metadata: dict

    @property
    def is_admin(self) -> bool:
        return self.role == ADMIN_ROLE


def role_from_app_metadata(app_metadata: Optional[dict]) -> str:
    """Admin role lives in Supabase Auth app_metadata, which only the service_role key can
    write — users cannot grant it to themselves (unlike user_metadata)."""
    return ADMIN_ROLE if (app_metadata or {}).get("role") == ADMIN_ROLE else "customer"


# ── Token verification cache ────────────────────────────────────────────────
# Verifying a token calls Supabase Auth over the network. Every cart/order request
# needs it, so a short-lived cache removes most of that latency (noticeable on
# Render's free tier). Trade-off: a revoked token or a role change can take up to
# TOKEN_CACHE_TTL seconds to take effect. Keys are SHA-256 hashes, not raw tokens.
TOKEN_CACHE_TTL = 60
_TOKEN_CACHE_MAX = 1000
_token_cache: dict[str, tuple[float, CurrentUser]] = {}
_token_cache_lock = threading.Lock()


def _cache_get(key: str) -> Optional[CurrentUser]:
    with _token_cache_lock:
        entry = _token_cache.get(key)
        if entry and entry[0] > time.monotonic():
            return entry[1]
        _token_cache.pop(key, None)
        return None


def _cache_put(key: str, user: CurrentUser) -> None:
    with _token_cache_lock:
        if len(_token_cache) >= _TOKEN_CACHE_MAX:
            now = time.monotonic()
            for k in [k for k, (exp, _) in _token_cache.items() if exp <= now]:
                del _token_cache[k]
            if len(_token_cache) >= _TOKEN_CACHE_MAX:
                _token_cache.clear()
        _token_cache[key] = (time.monotonic() + TOKEN_CACHE_TTL, user)


def invalidate_user_cache(user_id: UUID) -> None:
    """Drop cached tokens for a user (e.g. after an admin changes their role)."""
    with _token_cache_lock:
        for k in [k for k, (_, u) in _token_cache.items() if u.id == user_id]:
            del _token_cache[k]


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user_info(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> CurrentUser:
    """
    FastAPI dependency to extract and verify the Supabase Auth JWT bearer token
    from the HTTP Authorization header. Returns the authenticated user.
    Raises HTTP 401 Unauthorized if the token is missing, malformed, or invalid.
    """
    if not credentials or not credentials.credentials:
        raise _unauthorized("Missing or invalid Authorization header. Expected 'Bearer <token>'.")

    token = credentials.credentials
    cache_key = hashlib.sha256(token.encode()).hexdigest()
    cached = _cache_get(cache_key)
    if cached:
        return cached

    try:
        user_response = supabase.auth.get_user(token)
    except (AuthApiError, AuthError) as exc:
        raise _unauthorized(f"Authentication failed: {getattr(exc, 'message', str(exc))}")
    except Exception:
        raise _unauthorized("Could not validate credentials.")

    if not user_response or not user_response.user:
        raise _unauthorized("Invalid or expired authentication token.")

    try:
        user = CurrentUser(
            id=UUID(user_response.user.id),
            email=user_response.user.email,
            role=role_from_app_metadata(user_response.user.app_metadata),
            user_metadata=user_response.user.user_metadata or {},
        )
    except ValueError:
        raise _unauthorized("Invalid user ID format returned from authentication service.")

    _cache_put(cache_key, user)
    return user


def get_current_user(user: CurrentUser = Depends(get_current_user_info)) -> UUID:
    """Returns only the authenticated user's UUID (used by cart/order routes)."""
    return user.id


def require_admin(user: CurrentUser = Depends(get_current_user_info)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return user
