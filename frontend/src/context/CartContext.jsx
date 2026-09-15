import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { get, post as apiPost, patch, del } from '../api/client';
import { useAuth } from './AuthContext';

/**
 * CartContext — remote-first cart state.
 *
 * Design decisions:
 *   • Every mutation (add/update/remove) re-fetches the full cart from the
 *     server rather than optimistically patching local state. This keeps us
 *     in sync with backend-computed fields (line totals, subtotal, stock
 *     checks) with no risk of client/server drift. The trade-off is an extra
 *     GET per mutation, which is acceptable for a standard e-commerce flow.
 *   • When the user is logged out the cart is cleared locally and
 *     fetch/mutation functions no-op.
 *   • Expired sessions are handled by the API client (token refresh, then an
 *     `auth:logout` event), so this context doesn't need its own 401 logic.
 *   • Mutations re-throw errors so callers can show them inline; `error` only
 *     tracks failures loading the cart itself.
 */

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { isAuthenticated } = useAuth();

  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Fetch full cart ──────────────────────────────────────────────────────
  const fetchCart = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      setCart(await get('/cart'));
    } catch (err) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const refreshQuietly = useCallback(async () => {
    try {
      setCart(await get('/cart'));
    } catch {
      /* the next explicit fetch will surface the error */
    }
  }, []);

  // ── Mutations ────────────────────────────────────────────────────────────
  const addItem = useCallback(
    async (variantId, quantity = 1) => {
      if (!isAuthenticated) return;
      await apiPost('/cart/items', { variant_id: variantId, quantity });
      await refreshQuietly();
    },
    [isAuthenticated, refreshQuietly],
  );

  const updateItem = useCallback(
    async (itemId, quantity) => {
      if (!isAuthenticated) return;
      try {
        await patch(`/cart/items/${itemId}`, { quantity });
      } finally {
        await refreshQuietly();
      }
    },
    [isAuthenticated, refreshQuietly],
  );

  const removeItem = useCallback(
    async (itemId) => {
      if (!isAuthenticated) return;
      try {
        await del(`/cart/items/${itemId}`);
      } finally {
        await refreshQuietly();
      }
    },
    [isAuthenticated, refreshQuietly],
  );

  const clearCart = useCallback(async () => {
    if (!isAuthenticated) return;
    await del('/cart');
    await refreshQuietly();
  }, [isAuthenticated, refreshQuietly]);

  // ── Auto-fetch when auth state changes ───────────────────────────────────
  useEffect(() => {
    if (isAuthenticated) {
      fetchCart();
    } else {
      setCart(null);
      setError(null);
    }
  }, [isAuthenticated, fetchCart]);

  const value = useMemo(() => {
    const cartItems = cart?.items ?? [];
    return {
      cartItems,
      // Server-computed totals (price overrides already applied).
      cartTotal: cart?.subtotal ?? 0,
      itemCount: cart?.item_count ?? 0,
      // True until the first cart response arrives (including the render before the
      // initial fetch starts), so pages don't briefly treat the cart as empty.
      loading: isAuthenticated && !cart && !error,
      refreshing: loading,
      error,
      fetchCart,
      addItem,
      updateItem,
      removeItem,
      clearCart,
    };
  }, [cart, loading, error, isAuthenticated, fetchCart, addItem, updateItem, removeItem, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** Convenience hook — throws if used outside CartProvider. */
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
