import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LayoutDashboard, LogOut, Menu, Package, Search, ShoppingBag, User, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import CurrencyToggle from '../CurrencyToggle';

const NAV_CATEGORIES = [
  { slug: 'apparel', label: 'Apparel' },
  { slug: 'footwear', label: 'Footwear' },
  { slug: 'accessories', label: 'Accessories' },
  { slug: 'home-kitchen', label: 'Home' },
];

/**
 * Shared storefront header (extracted from the original page headers).
 * `transparentAtTop` keeps the home page hero look: see-through until scrolled.
 */
export default function SiteHeader({ transparentAtTop = false }) {
  const { isAuthenticated, isAdmin, user, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const accountRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menus on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
    setAccountOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  // Close the account dropdown on outside click / Escape
  useEffect(() => {
    if (!accountOpen) return undefined;
    const onClick = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setAccountOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const term = searchTerm.trim();
    navigate(term ? `/products?search=${encodeURIComponent(term)}` : '/products');
    setSearchTerm('');
  };

  const solid = !transparentAtTop || isScrolled || searchOpen;
  const firstName = user?.full_name?.split(' ')[0] || 'Account';
  const navLinkClass = ({ isActive }) =>
    `text-sm font-medium tracking-wide text-foreground transition-colors hover:text-muted-foreground ${
      isActive ? 'underline underline-offset-8' : ''
    }`;
  const currentCategory = new URLSearchParams(location.search).get('category');

  return (
    <>
      <header
        className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
          solid
            ? isScrolled
              ? 'border-b border-border bg-background/95 backdrop-blur-sm'
              : 'bg-background/80 backdrop-blur-sm'
            : 'bg-transparent'
        }`}
      >
        <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="-ml-2 inline-flex items-center justify-center rounded-md p-2 text-foreground transition-colors hover:text-muted-foreground lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" strokeWidth={1.5} />
          </button>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-7 lg:flex">
            <NavLink to="/products" end className={({ isActive }) => navLinkClass({ isActive: isActive && !currentCategory })}>
              Shop
            </NavLink>
            {NAV_CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                to={`/products?category=${cat.slug}`}
                className={navLinkClass({ isActive: location.pathname === '/products' && currentCategory === cat.slug })}
              >
                {cat.label}
              </Link>
            ))}
          </nav>

          {/* Logo */}
          <Link
            to="/"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
          >
            SmartRetail
          </Link>

          {/* Right actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            <CurrencyToggle />

            <button
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
              className="inline-flex items-center rounded-md p-2 text-foreground transition-colors hover:text-muted-foreground"
              aria-label="Search products"
              aria-expanded={searchOpen}
            >
              <Search className="h-5 w-5" strokeWidth={1.5} />
            </button>

            {isAuthenticated ? (
              <div className="relative hidden lg:block" ref={accountRef}>
                <button
                  type="button"
                  onClick={() => setAccountOpen((open) => !open)}
                  className="inline-flex items-center gap-2 rounded-md p-2 text-sm font-medium text-foreground transition-colors hover:text-muted-foreground"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                >
                  <User className="h-5 w-5" strokeWidth={1.5} />
                  <span className="max-w-[8rem] truncate">{firstName}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {accountOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-card py-1.5 text-card-foreground shadow-xl"
                  >
                    <div className="border-b border-border px-4 pb-2.5 pt-1.5">
                      <p className="truncate text-sm font-medium">{user?.full_name || 'Signed in'}</p>
                      <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                    <Link role="menuitem" to="/account" className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-muted">
                      <User className="h-4 w-4" strokeWidth={1.5} /> My Account
                    </Link>
                    <Link role="menuitem" to="/account/orders" className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-muted">
                      <Package className="h-4 w-4" strokeWidth={1.5} /> Orders
                    </Link>
                    {isAdmin && (
                      <Link role="menuitem" to="/admin" className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-muted">
                        <LayoutDashboard className="h-4 w-4" strokeWidth={1.5} /> Admin Dashboard
                      </Link>
                    )}
                    <button
                      role="menuitem"
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 border-t border-border px-4 py-2 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <LogOut className="h-4 w-4" strokeWidth={1.5} /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                state={{ from: location }}
                className="hidden items-center gap-2 rounded-md p-2 text-sm font-medium text-foreground transition-colors hover:text-muted-foreground lg:inline-flex"
              >
                <User className="h-5 w-5" strokeWidth={1.5} />
                <span>Sign In</span>
              </Link>
            )}

            <Link
              to="/cart"
              className="relative inline-flex items-center rounded-md p-2 text-foreground transition-colors hover:text-muted-foreground"
              aria-label={`Cart${itemCount ? `, ${itemCount} items` : ''}`}
            >
              <ShoppingBag className="h-5 w-5" strokeWidth={1.5} />
              {itemCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground">
                  {itemCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="border-t border-border bg-background">
            <form onSubmit={handleSearch} className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search products, brands..."
                className="flex-1 bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                aria-label="Search products"
              />
              <button type="submit" className="rounded-md bg-brand px-4 py-1.5 text-xs font-semibold text-brand-foreground hover:opacity-90">
                Search
              </button>
            </form>
          </div>
        )}
      </header>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 top-0 flex h-full w-72 max-w-[80vw] flex-col bg-background p-6 shadow-xl">
            <div className="mb-8 flex items-center justify-between">
              <span className="font-display text-xl font-semibold tracking-tight">SmartRetail</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md p-2 text-foreground transition-colors hover:text-muted-foreground"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <nav className="flex flex-col gap-4">
              <Link to="/products" className="text-base font-medium text-foreground transition-colors hover:text-muted-foreground">
                Shop All
              </Link>
              {NAV_CATEGORIES.map((cat) => (
                <Link
                  key={cat.slug}
                  to={`/products?category=${cat.slug}`}
                  className="text-base text-foreground/80 transition-colors hover:text-muted-foreground"
                >
                  {cat.label}
                </Link>
              ))}
            </nav>
            <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6">
              {isAuthenticated ? (
                <>
                  <Link to="/account" className="text-base font-medium text-foreground hover:text-muted-foreground">My Account</Link>
                  <Link to="/account/orders" className="text-base font-medium text-foreground hover:text-muted-foreground">Orders</Link>
                  {isAdmin && (
                    <Link to="/admin" className="text-base font-medium text-foreground hover:text-muted-foreground">Admin Dashboard</Link>
                  )}
                  <button type="button" onClick={handleLogout} className="text-left text-base font-medium text-muted-foreground hover:text-foreground">
                    Sign Out
                  </button>
                </>
              ) : (
                <Link to="/login" state={{ from: location }} className="text-base font-medium text-foreground hover:text-muted-foreground">
                  Sign In / Register
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
