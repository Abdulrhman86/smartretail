import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BadgePercent, ClipboardList, ExternalLink, FolderTree, LayoutDashboard, LogOut, Menu, Package, Sparkles, Users, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/categories', label: 'Categories', icon: FolderTree },
  { to: '/admin/discounts', label: 'Discounts', icon: BadgePercent },
  { to: '/admin/users', label: 'Customers', icon: Users },
  { to: '/admin/assistant', label: 'Assistant', icon: Sparkles },
];

function SidebarContent({ onNavigate }) {
  const { user, logout } = useAuth();
  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
      isActive ? 'bg-brand text-brand-foreground font-medium shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-6 pt-7">
        <Link to="/admin" onClick={onNavigate} className="font-display text-2xl font-semibold tracking-tight text-foreground">
          SmartRetail
        </Link>
        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Admin Console</p>
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Admin">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClass} onClick={onNavigate}>
            <Icon className="h-4 w-4" strokeWidth={1.5} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t border-border px-3 py-4">
        <Link to="/" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ExternalLink className="h-4 w-4" strokeWidth={1.5} /> View Store
        </Link>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.5} /> Sign Out
        </button>
        <p className="truncate px-3 pt-2 text-xs text-muted-foreground" title={user?.email}>{user?.email}</p>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-card lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm lg:hidden">
        <button type="button" onClick={() => setOpen(true)} className="-ml-2 rounded-md p-2 text-foreground" aria-label="Open admin menu">
          <Menu className="h-5 w-5" strokeWidth={1.5} />
        </button>
        <span className="font-display text-xl font-semibold tracking-tight">SmartRetail Admin</span>
        <span className="w-9" />
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-card shadow-xl">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-6 rounded-md p-2 text-muted-foreground" aria-label="Close admin menu">
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
