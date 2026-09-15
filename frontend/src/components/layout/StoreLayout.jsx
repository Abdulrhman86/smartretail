import { Outlet, useLocation } from 'react-router-dom';
import StoreAssistantWidget from '../assistant/StoreAssistantWidget';
import SiteFooter from './SiteFooter';
import SiteHeader from './SiteHeader';

/** Storefront chrome shared by all customer-facing pages (except login & checkout, which use focused layouts). */
export default function StoreLayout() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  return (
    <div className="flex min-h-screen flex-col bg-background font-body text-foreground">
      <SiteHeader transparentAtTop={isHome} />
      <div className="flex-1">
        <Outlet />
      </div>
      <SiteFooter className={isHome ? 'mt-0' : 'mt-20'} />
      <StoreAssistantWidget />
    </div>
  );
}
