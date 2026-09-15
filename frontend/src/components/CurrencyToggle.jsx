import { displayCurrency, setDisplayCurrency } from '../lib/currency';

const OPTIONS = [
  { code: 'KWD', label: 'KD' },
  { code: 'USD', label: '$' },
];

/**
 * Switches the currency prices are *shown* in. Orders are always priced and charged in KD;
 * dollars are a fixed-rate convenience, which the checkout says explicitly.
 */
export default function CurrencyToggle({ className = '' }) {
  return (
    <div
      role="group"
      aria-label="Display currency"
      className={`hidden items-center rounded-md border border-border p-0.5 sm:inline-flex ${className}`}
    >
      {OPTIONS.map(({ code, label }) => {
        const active = displayCurrency === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setDisplayCurrency(code)}
            aria-pressed={active}
            title={code === 'USD' ? 'Show prices converted to US dollars' : 'Show prices in Kuwaiti dinar'}
            className={`min-w-[2rem] rounded px-2 py-1 text-xs font-semibold transition-colors ${
              active ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
