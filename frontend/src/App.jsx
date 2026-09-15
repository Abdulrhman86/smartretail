import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './routes/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
import StoreLayout from './components/layout/StoreLayout';
import { Spinner } from './components/ui';

import HomePage from './pages/HomePage';
import ProductListPage from './pages/ProductListPage';
import ProductDetailPage from './pages/ProductDetailPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import LoginPage from './pages/LoginPage';
import HelpPage from './pages/HelpPage';
import NotFoundPage from './pages/NotFoundPage';
import AccountLayout from './pages/account/AccountLayout';
import ProfilePage from './pages/account/ProfilePage';
import OrdersPage from './pages/account/OrdersPage';
import OrderDetailPage from './pages/account/OrderDetailPage';

// Admin screens are code-split so shoppers never download them.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminProductForm = lazy(() => import('./pages/admin/AdminProductForm'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminOrderDetail = lazy(() => import('./pages/admin/AdminOrderDetail'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'));
const AdminDiscounts = lazy(() => import('./pages/admin/AdminDiscounts'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminAssistant = lazy(() => import('./pages/admin/AdminAssistant'));

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

/**
 * App — routing skeleton.
 *
 * Provider order matters: CartProvider depends on AuthContext (it reads
 * isAuthenticated), so AuthProvider must wrap it. ToastProvider sits inside
 * the router so toast actions can render <Link>s.
 */
export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <ToastProvider>
          <ScrollToTop />
          <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* Storefront (shared header + footer) */}
              <Route element={<StoreLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/products" element={<ProductListPage />} />
                <Route path="/products/:id" element={<ProductDetailPage />} />
                <Route path="/help" element={<HelpPage />} />

                <Route element={<ProtectedRoute />}>
                  <Route path="/cart" element={<CartPage />} />
                  <Route path="/account" element={<AccountLayout />}>
                    <Route index element={<ProfilePage />} />
                    <Route path="orders" element={<OrdersPage />} />
                    <Route path="orders/:orderId" element={<OrderDetailPage />} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFoundPage />} />
              </Route>

              {/* Focused layouts */}
              <Route path="/login" element={<LoginPage initialMode="login" />} />
              <Route path="/signup" element={<LoginPage initialMode="signup" />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/checkout" element={<CheckoutPage />} />
              </Route>

              {/* Admin console */}
              <Route element={<ProtectedRoute requireAdmin />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="orders/:orderId" element={<AdminOrderDetail />} />
                  <Route path="products" element={<AdminProducts />} />
                  <Route path="products/new" element={<AdminProductForm />} />
                  <Route path="products/:productId" element={<AdminProductForm />} />
                  <Route path="categories" element={<AdminCategories />} />
                  <Route path="discounts" element={<AdminDiscounts />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="assistant" element={<AdminAssistant />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </ToastProvider>
      </CartProvider>
    </AuthProvider>
  );
}
