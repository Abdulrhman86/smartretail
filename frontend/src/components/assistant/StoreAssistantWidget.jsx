import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle, X } from 'lucide-react';
import { Spinner } from '../ui';

// Kept out of the storefront's initial bundle — most visitors never open the assistant.
const AssistantPanel = lazy(() => import('./AssistantPanel'));

/** Floating assistant available on every storefront page. */
export default function StoreAssistantWidget() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  // A route change while the panel is open usually means the shopper followed a product link.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none"
            onClick={close}
          />
          <div
            role="dialog"
            aria-label="Shopping assistant"
            className="fixed inset-x-0 bottom-0 z-50 h-[85vh] rounded-t-2xl border border-border bg-background shadow-xl sm:inset-x-auto sm:bottom-24 sm:right-6 sm:h-[min(620px,calc(100vh-10rem))] sm:w-[400px] sm:rounded-2xl"
          >
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Spinner className="h-6 w-6" />
                </div>
              }
            >
              <AssistantPanel onClose={close} />
            </Suspense>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close shopping assistant' : 'Open shopping assistant'}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg transition-transform hover:scale-105"
      >
        {open ? <X className="h-6 w-6" strokeWidth={1.5} /> : <MessageCircle className="h-6 w-6" strokeWidth={1.5} />}
      </button>
    </>
  );
}
