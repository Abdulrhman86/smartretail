import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, LogOut, Package, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/** Two-column account area: section nav on the left, page content on the right. */
export default function AccountLayout() {
  const { user, isAdmin, logout } = useAuth();

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
      isActive ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
    }`;

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-24 sm:px-6 sm:pt-28 lg:px-8">
      <div className="mb-10 sm:mb-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">My Account</p>
        <h1 className="mt-1 font-display text-3xl font-normal tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          {user?.full_name ? `Welcome back, ${user.full_name.split(' ')[0]}` : 'Welcome back'}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-16">
        <aside className="lg:col-span-3">
          <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Account sections">
            <NavLink to="/account" end className={linkClass}>
              <User className="h-4 w-4" strokeWidth={1.5} /> Profile
            </NavLink>
            <NavLink to="/account/orders" className={linkClass}>
              <Package className="h-4 w-4" strokeWidth={1.5} /> Orders
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={linkClass}>
                <LayoutDashboard className="h-4 w-4" strokeWidth={1.5} /> Admin Dashboard
              </NavLink>
            )}
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground lg:mt-4 lg:border-t lg:border-border lg:pt-4"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.5} /> Sign Out
            </button>
          </nav>
        </aside>
        <section className="lg:col-span-9">
          <Outlet />
        </section>
      </div>
    </main>
  );
}
