/**
 * Session persistence.
 *
 * "Keep me signed in" stores the session in localStorage (survives browser
 * restarts); otherwise sessionStorage (cleared when the tab/browser closes).
 * Tokens live in Web Storage because the backend issues bearer tokens, not
 * cookies — the trade-off is XSS exposure, so never render untrusted HTML.
 */
const KEY = 'smartretail.session';
const LEGACY_KEYS = ['access_token', 'user'];

function safeStorage(kind) {
  try {
    const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
    const probe = '__probe__';
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function getSession() {
  for (const kind of ['session', 'local']) {
    const storage = safeStorage(kind);
    const raw = storage?.getItem(KEY);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.access_token && parsed?.user) return { ...parsed, persistent: kind === 'local' };
    } catch {
      storage.removeItem(KEY);
    }
  }
  return null;
}

export function setSession({ access_token, refresh_token, expires_at, user }, persistent = true) {
  clearSession();
  const storage = safeStorage(persistent ? 'local' : 'session');
  storage?.setItem(KEY, JSON.stringify({ access_token, refresh_token, expires_at, user }));
}

export function updateSessionTokens({ access_token, refresh_token, expires_at, user }) {
  const current = getSession();
  if (!current) return;
  setSession(
    {
      access_token,
      refresh_token: refresh_token ?? current.refresh_token,
      expires_at,
      user: user ?? current.user,
    },
    current.persistent,
  );
}

export function updateSessionUser(user) {
  const current = getSession();
  if (!current) return;
  setSession({ ...current, user }, current.persistent);
}

export function clearSession() {
  for (const kind of ['session', 'local']) {
    const storage = safeStorage(kind);
    storage?.removeItem(KEY);
    // Clean up keys written by the previous version of the app.
    LEGACY_KEYS.forEach((k) => storage?.removeItem(k));
  }
}
