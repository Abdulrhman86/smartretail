import { Link } from 'react-router-dom';
import useDocumentTitle from '../hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center px-4 pb-16 pt-32 text-center sm:pt-40">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">404 Notice</p>
      <h1 className="mt-3 font-display text-4xl font-normal tracking-tight text-foreground sm:text-5xl">Page Not Found</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
        The page you were looking for doesn&apos;t exist or has moved. Let&apos;s get you back to something beautiful.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/" className="inline-flex items-center justify-center rounded-md bg-brand px-8 py-3 text-sm font-semibold text-brand-foreground shadow-sm transition-opacity hover:opacity-90">
          Go Home
        </Link>
        <Link to="/products" className="inline-flex items-center justify-center rounded-md border border-border bg-background px-8 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted">
          Browse the Shop
        </Link>
      </div>
    </main>
  );
}
