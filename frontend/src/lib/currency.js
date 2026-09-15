/**
 * The store prices, charges and stores everything in Kuwaiti dinar (3 decimals — KD is
 * divided into 1000 fils). US dollars are a display-only convenience at a fixed rate:
 * the figure the server quotes and charges is always the KD one.
 *
 * The chosen currency is read once at page load rather than held in React state. Prices are
 * rendered by a plain `formatPrice` helper in ~60 places, so switching currency reloads the
 * page — that guarantees every price on screen changes together, instead of leaving whichever
 * components happened not to re-render showing the old currency.
 */
export const STORE_CURRENCY = 'KWD';
export const USD_PER_KD = 3.25;

const STORAGE_KEY = 'smartretail.currency';

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'USD' ? 'USD' : 'KWD';
  } catch {
    return 'KWD'; // private mode / blocked storage
  }
}

/** Fixed for the lifetime of the page — see the note above. */
export const displayCurrency = readStored();

export function setDisplayCurrency(next) {
  if (next === displayCurrency) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Nothing persisted, but the reload below still applies it for this page.
  }
  window.location.reload();
}
