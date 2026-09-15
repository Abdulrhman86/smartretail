import os

import httpx
from dotenv import load_dotenv
from supabase import Client, ClientOptions, create_client

load_dotenv()

supabase_url: str = os.environ.get("SUPABASE_URL", "")
supabase_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
supabase_anon_key: str = os.environ.get("SUPABASE_ANON_KEY", "")

if not supabase_url or not supabase_key or not supabase_anon_key:
    raise RuntimeError(
        "Missing required environment variables: please set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY in your .env file."
    )

# The library default request timeout is 120s, which would leave a request hanging far
# past any sensible HTTP timeout if Supabase is slow (e.g. a paused free-tier project).
DB_TIMEOUT_SECONDS = float(os.environ.get("SUPABASE_TIMEOUT_SECONDS", "15"))

# One shared HTTP/1.1 connection pool for every Supabase call (PostgREST + Auth).
# supabase-py defaults to HTTP/2, whose pooled connections go stale after a few idle
# minutes; the next burst of requests then fails with "Server disconnected" (seen as
# random 500s — and CORS errors in the browser). httpcore checks idle HTTP/1.1
# connections before reuse, and `retries` re-attempts failed connection setups.
http_client = httpx.Client(
    http2=False,
    follow_redirects=True,
    timeout=httpx.Timeout(DB_TIMEOUT_SECONDS, connect=10.0),
    transport=httpx.HTTPTransport(
        retries=2,
        limits=httpx.Limits(max_connections=50, max_keepalive_connections=20, keepalive_expiry=20.0),
    ),
)

# Single reusable Supabase client instance initialized with service_role key (bypasses RLS).
# persist_session/auto_refresh are off because this client must never hold a user session.
supabase: Client = create_client(
    supabase_url,
    supabase_key,
    options=ClientOptions(auto_refresh_token=False, persist_session=False, httpx_client=http_client),
)


def create_anon_client() -> Client:
    """Request-scoped anon client for auth operations (sign_up / sign_in / refresh),
    so a user session is never attached to the shared service_role client."""
    return create_client(
        supabase_url,
        supabase_anon_key,
        options=ClientOptions(auto_refresh_token=False, persist_session=False, httpx_client=http_client),
    )
