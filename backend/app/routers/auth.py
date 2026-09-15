import logging
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from supabase_auth.errors import AuthApiError, AuthError

from app.auth import CurrentUser, get_current_user_info, role_from_app_metadata
from app.database import create_anon_client, supabase
from app.schemas import AuthResponse, ProfileUpdate, RefreshRequest, UserLogin, UserProfileResponse, UserSignUp

router = APIRouter()
logger = logging.getLogger("smartretail.auth")

"""
Tradeoff Discussion: Backend-side Profile Insertion vs. Postgres Trigger on auth.users
--------------------------------------------------------------------------------------
1. Postgres Trigger on `auth.users` (INSERT):
   - PROS: Fully transactional and database-enforced; executes regardless of where a user is created
     (Supabase Dashboard, OAuth providers, external scripts).
   - CONS: Requires creating a function and trigger in Postgres on the internal `auth` schema. In this
     project, the database schema is already deployed and fixed ("do not modify schema").
2. Backend-Side Profile Insertion (Chosen Approach):
   - PROS: The backend possesses the `service_role` key, allowing it to directly and reliably insert/upsert
     the profile row upon successful user registration without requiring changes to the live Postgres schema.
     Error handling and logging are explicit and directly controllable within the application layer.
   - CONS: If users are created outside this backend API (e.g. manually in the Supabase Auth dashboard),
     a profile record won't be automatically generated unless handled on-demand. Profile reads fall back
     to auth user_metadata, and PATCH /auth/me upserts the row.
"""


def _load_profile(user_id: str, user_metadata: dict) -> tuple[str | None, str | None]:
    profile_res = supabase.table("profiles").select("full_name, avatar_url").eq("id", user_id).execute()
    if profile_res.data:
        return profile_res.data[0].get("full_name"), profile_res.data[0].get("avatar_url")
    return (user_metadata or {}).get("full_name"), (user_metadata or {}).get("avatar_url")


def _session_response(auth_res) -> AuthResponse:
    user = auth_res.user
    full_name, avatar_url = _load_profile(user.id, user.user_metadata)
    return AuthResponse(
        access_token=auth_res.session.access_token,
        token_type=auth_res.session.token_type or "bearer",
        refresh_token=auth_res.session.refresh_token,
        expires_at=auth_res.session.expires_at,
        user=UserProfileResponse(
            id=UUID(user.id),
            email=user.email,
            full_name=full_name,
            avatar_url=avatar_url,
            role=role_from_app_metadata(user.app_metadata),
        ),
    )


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def sign_up(payload: UserSignUp):
    """
    Registers a new user with email and password in Supabase Auth using a request-scoped
    client (to avoid mutating the shared service_role client), and automatically
    populates their record in the `public.profiles` table using the service_role client.
    """
    try:
        auth_client = create_anon_client()
        auth_res = auth_client.auth.sign_up({
            "email": payload.email.strip().lower(),
            "password": payload.password,
            "options": {"data": {"full_name": payload.full_name, "avatar_url": payload.avatar_url}},
        })
    except (AuthApiError, AuthError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=getattr(exc, "message", str(exc)))
    except Exception:
        logger.exception("Unexpected signup failure")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An unexpected error occurred during signup.")

    if not auth_res.user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User creation failed in Supabase Auth.")

    supabase.table("profiles").upsert({
        "id": auth_res.user.id,
        "full_name": payload.full_name,
        "avatar_url": payload.avatar_url,
    }).execute()

    if auth_res.session:
        return _session_response(auth_res)

    # Email confirmation is enabled in Supabase: the account exists but no session is issued yet.
    return AuthResponse(
        access_token="",
        refresh_token=None,
        requires_email_confirmation=True,
        user=UserProfileResponse(
            id=UUID(auth_res.user.id),
            email=auth_res.user.email,
            full_name=payload.full_name,
            avatar_url=payload.avatar_url,
        ),
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLogin):
    """
    Authenticates a user via email and password with Supabase Auth using a request-scoped
    client, returning access and refresh tokens without mutating the shared service_role client.
    """
    try:
        auth_res = create_anon_client().auth.sign_in_with_password({
            "email": payload.email.strip().lower(),
            "password": payload.password,
        })
    except (AuthApiError, AuthError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=getattr(exc, "message", str(exc)))
    except Exception:
        logger.exception("Unexpected login failure")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An unexpected error occurred during login.")

    if not auth_res.session or not auth_res.user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid login credentials.")
    return _session_response(auth_res)


@router.post("/refresh", response_model=AuthResponse)
def refresh(payload: RefreshRequest):
    """Exchanges a refresh token for a new access token (Supabase access tokens expire after ~1h)."""
    try:
        auth_res = create_anon_client().auth.refresh_session(payload.refresh_token)
    except (AuthApiError, AuthError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=getattr(exc, "message", str(exc)))
    except Exception:
        logger.exception("Unexpected token refresh failure")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not refresh session.")

    if not auth_res.session or not auth_res.user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not refresh session.")
    return _session_response(auth_res)


@router.get("/me", response_model=UserProfileResponse)
def get_me(user: CurrentUser = Depends(get_current_user_info)):
    full_name, avatar_url = _load_profile(str(user.id), user.user_metadata)
    return UserProfileResponse(id=user.id, email=user.email, full_name=full_name, avatar_url=avatar_url, role=user.role)


@router.patch("/me", response_model=UserProfileResponse)
def update_me(payload: ProfileUpdate, user: CurrentUser = Depends(get_current_user_info)):
    changes = payload.model_dump(exclude_unset=True)
    row = {"id": str(user.id), **changes}
    if changes:
        row["updated_at"] = datetime.now(timezone.utc).isoformat()
    supabase.table("profiles").upsert(row).execute()
    return get_me(user)
