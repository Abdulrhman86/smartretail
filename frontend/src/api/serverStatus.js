/**
 * Detects the backend waking from sleep so the UI can say so instead of looking frozen.
 *
 * The API runs on a free Render instance, which sleeps after 15 idle minutes and takes
 * 30–60 seconds to answer the next request. A slow request only counts as "waking" when
 * the server hasn't answered anything recently — otherwise an ordinary slow call (an
 * assistant reply can take several seconds) would wrongly show the notice.
 */
const SLOW_AFTER_MS = 4000;
const PRESUMED_AWAKE_MS = 10 * 60 * 1000;

let lastResponseAt = 0;
let wakingRequests = 0;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeServerWaking(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isServerWaking() {
  return wakingRequests > 0;
}

/** Wraps a fetch promise. Any HTTP response, error statuses included, proves the server is up. */
export async function trackRequest(fetchPromise) {
  const mayBeAsleep = Date.now() - lastResponseAt > PRESUMED_AWAKE_MS;
  let flagged = false;
  const timer = mayBeAsleep
    ? setTimeout(() => {
        flagged = true;
        wakingRequests += 1;
        notify();
      }, SLOW_AFTER_MS)
    : null;

  try {
    const response = await fetchPromise;
    lastResponseAt = Date.now();
    return response;
  } finally {
    clearTimeout(timer);
    if (flagged) {
      wakingRequests -= 1;
      notify();
    }
  }
}
