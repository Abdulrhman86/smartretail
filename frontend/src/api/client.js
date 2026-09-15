/**
 * API Client — thin fetch wrapper for the FastAPI backend.
 *
 * • Reads base URL from the VITE_API_URL env var (set in .env or at build time).
 * • Auto-attaches the Bearer token from the stored session when present.
 * • On a 401 it tries once to exchange the refresh token for a new access token
 *   (Supabase access tokens expire after ~1h) and replays the request. If that
 *   fails the session is cleared and an `auth:logout` event is dispatched so
 *   AuthContext can react.
 * • Normalises errors: every non-2xx response throws an ApiError carrying
 *   `status` (number) and `message` (string) so callers can branch on status
 *   codes without inspecting raw Response objects.
 */
import { trackRequest } from './serverStatus';
import { clearSession, getSession, updateSessionTokens } from './session';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

// ── Custom error class ──────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// FastAPI validation errors (422) return `detail` as an array of objects.
function errorMessage(data, response) {
  const detail = data?.detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc.filter((p) => p !== 'body').join('.') : '';
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .join('; ');
  }
  return detail ?? data?.message ?? response.statusText ?? 'Request failed';
}

// ── Token refresh (single-flight) ───────────────────────────────────────────
let refreshPromise = null;

async function refreshAccessToken() {
  const session = getSession();
  if (!session?.refresh_token) return false;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        updateSessionTokens(data);
        window.dispatchEvent(new CustomEvent('auth:refreshed', { detail: data }));
        return true;
      } catch {
        return false;
      } finally {
        // Let concurrent callers await the same promise, then allow future refreshes.
        setTimeout(() => {
          refreshPromise = null;
        }, 0);
      }
    })();
  }
  return refreshPromise;
}

// ── Core request function ───────────────────────────────────────────────────
async function rawRequest(path, options = {}, { retryOnAuth = true } = {}) {
  const session = getSession();
  const headers = {
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  let response;
  try {
    response = await trackRequest(fetch(`${BASE_URL}${path}`, { ...options, headers }));
  } catch {
    throw new ApiError(0, 'Unable to reach the server. Check your connection and try again.');
  }

  if (response.status === 401 && retryOnAuth && session?.access_token && !path.startsWith('/auth/')) {
    if (await refreshAccessToken()) {
      return rawRequest(path, options, { retryOnAuth: false });
    }
    clearSession();
    window.dispatchEvent(new Event('auth:logout'));
  }

  // For 204 No Content (e.g. DELETE responses) there's no body to parse.
  if (response.status === 204) {
    return { data: null, response };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }

  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(data, response));
  }

  return { data, response };
}

export async function apiClient(path, options = {}) {
  const { data } = await rawRequest(path, options);
  return data;
}

/** GET that also returns the X-Total-Count header (for paginated lists). */
export async function getWithTotal(path, options = {}) {
  const { data, response } = await rawRequest(path, { ...options, method: 'GET' });
  const total = Number(response.headers.get('X-Total-Count'));
  return { data, total: Number.isFinite(total) ? total : (data?.length ?? 0) };
}

// ── Convenience methods ─────────────────────────────────────────────────────
export function get(path, options = {}) {
  return apiClient(path, { ...options, method: 'GET' });
}

export function post(path, body, options = {}) {
  return apiClient(path, { ...options, method: 'POST', body: JSON.stringify(body ?? {}) });
}

export function patch(path, body, options = {}) {
  return apiClient(path, { ...options, method: 'PATCH', body: JSON.stringify(body ?? {}) });
}

export function put(path, body, options = {}) {
  return apiClient(path, { ...options, method: 'PUT', body: JSON.stringify(body ?? {}) });
}

// Named `del` because `delete` is a JS reserved word.
export function del(path, options = {}) {
  return apiClient(path, { ...options, method: 'DELETE' });
}

// ── Assistant ───────────────────────────────────────────────────────────────
export function assistantChat(messages) {
  return post('/assistant/chat', { messages });
}

export function adminAssistantChat(messages) {
  return post('/admin/assistant/chat', { messages });
}

/** Approves or discards an action the admin assistant proposed. Nothing runs until this call. */
export function adminAssistantConfirm(id, approve) {
  return post('/admin/assistant/confirm', { id, approve });
}

/** Builds a query string, skipping empty values. */
export function toQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
