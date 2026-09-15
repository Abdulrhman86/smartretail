/**
 * Small shared UI primitives in the storefront design language
 * (muted slate brand, Cormorant display headings, uppercase micro-labels).
 */
import { Loader2 } from 'lucide-react';
import { ORDER_STATUS_META } from '../lib/format';

export const buttonClasses = {
  primary:
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
  secondary:
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
  ghost:
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
  danger:
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-destructive/30 bg-background px-5 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
};

export const inputClass =
  'w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60';

/** Compact inline select for filter bars (no w-full, so several fit on one row). */
export const selectClass =
  'rounded-md border border-border bg-background px-3.5 py-2.5 text-sm text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand';

export const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground';

export function Eyebrow({ children, className = '' }) {
  return <p className={`text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground ${className}`}>{children}</p>;
}

export function PageHeading({ eyebrow, title, children, actions }) {
  return (
    <div className="mb-10 flex flex-col gap-4 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mt-1 font-display text-3xl font-normal tracking-tight text-foreground sm:text-4xl lg:text-5xl">{title}</h1>
        {children && <div className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const meta = ORDER_STATUS_META[status] ?? { label: status, className: 'bg-muted text-muted-foreground ring-border' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`animate-spin text-muted-foreground ${className}`} />;
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/10 px-4 py-16 text-center sm:py-20">
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-6 w-6" strokeWidth={1.5} />
        </div>
      )}
      <h3 className="font-display text-2xl font-medium text-foreground">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-4">
          Retry
        </button>
      )}
    </div>
  );
}

export function Pagination({ offset, limit, total, onChange }) {
  if (!total || total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border pt-4 text-sm text-muted-foreground">
      <span>
        {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={buttonClasses.secondary} disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))}>
          Previous
        </button>
        <span className="hidden tabular-nums sm:inline">
          Page {page} of {pages}
        </span>
        <button type="button" className={buttonClasses.secondary} disabled={page >= pages} onClick={() => onChange(offset + limit)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function StarRating({ value = 0, size = 'h-4 w-4', onChange }) {
  return (
    <div className="flex items-center gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label={onChange ? 'Rating' : `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = value >= star - 0.25;
        const icon = (
          <svg viewBox="0 0 24 24" className={`${size} ${filled ? 'fill-brand text-brand' : 'fill-transparent text-muted-foreground/50'}`} stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinejoin="round" d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9L12 3.5z" />
          </svg>
        );
        return onChange ? (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            onClick={() => onChange(star)}
            className="cursor-pointer p-0.5"
          >
            {icon}
          </button>
        ) : (
          <span key={star}>{icon}</span>
        );
      })}
    </div>
  );
}
