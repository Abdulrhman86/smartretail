import { Link } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { assistantChat } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { buttonClasses } from '../ui';
import ProductCard from '../ProductCard';
import ChatInput from './ChatInput';
import ChatThread from './ChatThread';
import { useAssistantChat } from './useAssistantChat';

const SUGGESTIONS = [
  'What do you sell?',
  'Waterproof jacket under $150',
  'Gift ideas for a coffee lover',
  'Where is my last order?',
];

function Welcome({ onPick }) {
  return (
    <div className="py-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/40 text-brand">
        <Sparkles className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <h3 className="mt-3 font-display text-xl text-foreground">How can I help?</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Ask about products, sizes or stock and I&apos;ll search the store for you.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Panel body of the storefront assistant. Loaded on demand so the markdown renderer stays
 * out of the storefront's initial bundle. */
export default function AssistantPanel({ onClose }) {
  const { isAuthenticated } = useAuth();
  const { messages, loading, error, send } = useAssistantChat(assistantChat);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="font-display text-lg leading-none text-foreground">Shopping assistant</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">SmartRetail</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close assistant"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </header>

      {isAuthenticated ? (
        <>
          <div className="flex-1 overflow-y-auto px-5">
            <ChatThread
              className="py-5"
              messages={messages}
              loading={loading}
              error={error}
              empty={<Welcome onPick={send} />}
              renderAttachments={(message) =>
                message.products?.length ? (
                  <div className="grid gap-3 pt-1">
                    {message.products.slice(0, 4).map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                ) : null
              }
            />
          </div>
          <div className="border-t border-border p-3">
            <ChatInput onSend={send} disabled={loading} placeholder="Ask about products…" autoFocus />
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/40 text-brand">
            <Sparkles className="h-6 w-6" strokeWidth={1.5} />
          </span>
          <div>
            <p className="font-display text-xl text-foreground">Sign in to chat</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              The assistant searches the catalogue and can add items to your cart, so it needs to know who you are.
            </p>
          </div>
          <Link to="/login" onClick={onClose} className={buttonClasses.primary}>
            Sign in
          </Link>
        </div>
      )}
    </div>
  );
}
