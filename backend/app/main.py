import logging
import os
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError

load_dotenv()

from app.routers import admin, assistant, auth, cart, orders, products

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logging.getLogger("httpx").setLevel(logging.WARNING)  # per-request Supabase call logs are noisy
logger = logging.getLogger("smartretail")

app = FastAPI(title="SmartRetail API", version="0.2.0")

# ALLOWED_ORIGINS is a comma-separated list, e.g. "https://smartretail.vercel.app,http://localhost:5173".
# Defaults to "*" for local development — set it explicitly in production (Render env settings).
allowed_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

# Auth uses bearer tokens in the Authorization header (not cookies), so credentials stay disabled.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)


@app.exception_handler(APIError)
async def database_error_handler(request: Request, exc: APIError):
    # Don't leak raw PostgREST/Postgres error details to clients.
    logger.error("Database error on %s %s: code=%s message=%s", request.method, request.url.path, exc.code, exc.message)
    return JSONResponse(status_code=500, content={"detail": "A database error occurred. Please try again."})


@app.exception_handler(httpx.TransportError)
async def upstream_unavailable_handler(request: Request, exc: httpx.TransportError):
    # Network failures talking to Supabase. Handling them here (instead of letting them
    # escape as unhandled 500s) keeps CORS headers on the response, so the browser shows
    # a real error message instead of a misleading CORS failure.
    logger.error("Upstream error on %s %s: %r", request.method, request.url.path, exc)
    return JSONResponse(status_code=503, content={"detail": "The store is temporarily unavailable. Please try again in a moment."})


# Include routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(products.router, tags=["products"])
app.include_router(cart.router, prefix="/cart", tags=["cart"])
app.include_router(orders.router, prefix="/orders", tags=["orders"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(assistant.router, prefix="/assistant", tags=["assistant"])
app.include_router(assistant.admin_router, prefix="/admin/assistant", tags=["assistant"])


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}
