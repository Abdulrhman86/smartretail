import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles } from 'lucide-react';

/** Model replies are markdown; react-markdown escapes any HTML in them. */
export function AssistantMarkdown({ children }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_strong]:font-semibold">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1" aria-label="The assistant is thinking">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * Message list for both assistants. `renderAttachments(message)` draws whatever the reply
 * carried with it — product cards in the storefront, report tables in the admin console.
 */
export default function ChatThread({ messages, loading, error, empty, renderAttachments, className = '' }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  if (!messages.length && !loading) {
    return <div className={className}>{empty}</div>;
  }

  return (
    <div className={`space-y-5 ${className}`}>
      {messages.map((message) =>
        message.role === 'user' ? (
          <div key={message.id} className="flex justify-end">
            <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-brand-foreground">
              {message.content}
            </p>
          </div>
        ) : (
          <div key={message.id} className="flex gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/40 text-brand">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              {message.content && <AssistantMarkdown>{message.content}</AssistantMarkdown>}
              {renderAttachments?.(message)}
            </div>
          </div>
        ),
      )}

      {loading && (
        <div className="flex gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/40 text-brand">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
          </span>
          <div className="pt-2">
            <TypingDots />
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div ref={endRef} />
    </div>
  );
}
