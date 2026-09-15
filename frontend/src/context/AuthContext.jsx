import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { get, patch, post as apiPost } from '../api/client';
import { clearSession, getSession, setSession, updateSessionUser } from '../api/session';

/**
 * AuthContext — manages user session state.
 *
 * Persistence strategy:
 *   The session (tokens + user) lives in api/session.js — localStorage when
 *   "keep me signed in" is checked, sessionStorage otherwise. On app load we
 *   rehydrate synchronously, then re-validate against GET /auth/me in the
 *   background so role/profile changes (e.g. being made an admin) show up.
 *   The API client refreshes expired access tokens itself and emits
 *   `auth:refreshed` / `auth:logout` window events that we mirror here.
 *
 * Loading flag:
 *   `loading` is true only during the initial rehydration check so downstream
 *   components (e.g. ProtectedRoute) can wait before deciding to redirect.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(null);
  const [loading, setLoading] = useState(true); // true until rehydration done

  // ── Rehydrate on mount, then re-validate in the background ──────────────
  useEffect(() => {
    const stored = getSession();
    setSessionState(stored);
    setLoading(false);

    if (stored) {
      get('/auth/me')
        .then((me) => {
          updateSessionUser(me);
          setSessionState(getSession());
        })
        .catch(() => {
          // 401s are handled by the client (refresh or auth:logout); ignore network errors.
        });
    }
  }, []);

  // ── Mirror token refresh / forced logout from the API client ─────────────
  useEffect(() => {
    const onRefreshed = () => setSessionState(getSession());
    const onLogout = () => setSessionState(null);
    window.addEventListener('auth:refreshed', onRefreshed);
    window.addEventListener('auth:logout', onLogout);
    return () => {
      window.removeEventListener('auth:refreshed', onRefreshed);
      window.removeEventListener('auth:logout', onLogout);
    };
  }, []);

  const persist = useCallback((data, persistent) => {
    setSession(data, persistent);
    setSessionState(getSession());
  }, []);

  // ── Signup ───────────────────────────────────────────────────────────────
  // Returns { requiresEmailConfirmation } — when Supabase email confirmation is
  // enabled no session is issued until the user clicks the emailed link.
  const signup = useCallback(async (email, password, full_name) => {
    const body = { email, password };
    if (full_name) body.full_name = full_name;

    const data = await apiPost('/auth/signup', body);
    if (data.requires_email_confirmation || !data.access_token) {
      return { requiresEmailConfirmation: true, user: data.user };
    }
    persist(data, true);
    return { requiresEmailConfirmation: false, user: data.user };
  }, [persist]);

  // ── Login ────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password, remember = true) => {
    const data = await apiPost('/auth/login', { email, password });
    persist(data, remember);
    return data.user;
  }, [persist]);

  // ── Logout ───────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    clearSession();
    setSessionState(null);
  }, []);

  // ── Profile ──────────────────────────────────────────────────────────────
  const updateProfile = useCallback(async (changes) => {
    const me = await patch('/auth/me', changes);
    updateSessionUser(me);
    setSessionState(getSession());
    return me;
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await get('/auth/me');
    updateSessionUser(me);
    setSessionState(getSession());
    return me;
  }, []);

  const value = useMemo(() => {
    const user = session?.user ?? null;
    return {
      user,
      token: session?.access_token ?? null,
      isAuthenticated: !!session?.access_token,
      isAdmin: user?.role === 'admin',
      loading,
      signup,
      login,
      logout,
      updateProfile,
      refreshUser,
    };
  }, [session, loading, signup, login, logout, updateProfile, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Convenience hook — throws if used outside AuthProvider. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
