import { useEffect, useSyncExternalStore } from 'react';
import { get } from '../api/client';
import { isServerWaking, subscribeServerWaking } from '../api/serverStatus';
import { Spinner } from './ui';

/** Shown while the sleeping backend spins up, so a cold start doesn't read as a broken site. */
export default function ServerWakeNotice() {
  const waking = useSyncExternalStore(subscribeServerWaking, isServerWaking);

  // Start the wake-up as soon as someone lands, even on pages that make no API call at first.
  useEffect(() => {
    get('/health').catch(() => {});
  }, []);

  if (!waking) return null;

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-4">
      <div className="flex max-w-md items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2.5 text-sm text-foreground shadow-lg backdrop-blur">
        <Spinner className="h-4 w-4 shrink-0" />
        <span>Waking up the server — the first visit after a quiet spell can take up to a minute.</span>
      </div>
    </div>
  );
}
