import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute — gate for authenticated-only routes.
 *
 * While AuthProvider is rehydrating (`loading === true`) we render nothing to
 * avoid a flash-redirect to /login. The attempted location is passed along so
 * LoginPage can send the user back after signing in.
 *
 * `requireAdmin` additionally requires the admin role; signed-in non-admins
 * are sent to the home page.
 *
 * Supports both wrapper patterns:
 *   <Route element={<ProtectedRoute />}>       ← uses <Outlet />
 *   <Route element={<ProtectedRoute><Page /></ProtectedRoute>}>  ← uses children
 */
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // wait for rehydration

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children ?? <Outlet />;
}
