import { useState } from 'react';
import { AlertTriangle, RotateCcw, Sparkles } from 'lucide-react';
import { adminAssistantChat, adminAssistantConfirm } from '../../api/client';
import ChatInput from '../../components/assistant/ChatInput';
import ChatThread from '../../components/assistant/ChatThread';
import { useAssistantChat } from '../../components/assistant/useAssistantChat';
import { useToast } from '../../context/ToastContext';
import { buttonClasses, PageHeading } from '../../components/ui';
import { formatDate, formatPrice } from '../../lib/format';
import useDocumentTitle from '../../hooks/useDocumentTitle';

const SUGGESTIONS = [
  'How is the business doing this month?',
  'Which products are not selling?',
  "What's running low on stock?",
  'Who are our best customers?',
  'How are the discount codes performing?',
];

function formatCell(value, format) {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'currency') return formatPrice(value);
  if (format === 'number') return Number(value).toLocaleString();
  if (format === 'date') return formatDate(value);
  return String(value);
}

function ReportCard({ report }) {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? report.rows : report.rows.slice(0, 8);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background">
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{report.title}</h3>
      </header>

      {report.summary?.length > 0 && (
        <dl className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-3 lg:grid-cols-4">
          {report.summary.map((stat) => (
            <div key={stat.label} className="bg-background px-4 py-3">
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{stat.label}</dt>
              <dd className="mt-1 text-lg font-semibold text-foreground">{formatCell(stat.value, stat.format)}</dd>
            </div>
          ))}
        </dl>
      )}

      {report.rows?.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/10">
                <tr>
                  {report.columns.map((column) => (
                    <th key={column.key} className="whitespace-nowrap px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.product_id ?? row.variant_id ?? row.user_id ?? row.code ?? row.date ?? index} className="border-b border-border/60 last:border-0">
                    {report.columns.map((column) => (
                      <td key={column.key} className="whitespace-nowrap px-4 py-2 text-foreground">
                        {formatCell(row[column.key], column.format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.rows.length > 8 && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="w-full border-t border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {expanded ? 'Show less' : `Show all ${report.rows.length} rows`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function PendingActionCard({ action, onResolve }) {
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const resolve = async (approve) => {
    setBusy(true);
    try {
      const result = await adminAssistantConfirm(action.id, approve);
      onResolve(result.reply);
      if (approve) showToast({ title: 'Change applied', tone: 'success' });
    } catch (err) {
      showToast({ title: err.message || 'That change could not be applied.', tone: 'error' });
      onResolve(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-4">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Confirm this change</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{action.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => resolve(true)} className={buttonClasses.primary}>
              {busy ? 'Applying…' : 'Confirm'}
            </button>
            <button type="button" disabled={busy} onClick={() => resolve(false)} className={buttonClasses.secondary}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Welcome({ onPick }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-secondary/10 px-6 py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-background text-brand">
        <Sparkles className="h-6 w-6" strokeWidth={1.5} />
      </span>
      <h2 className="mt-4 font-display text-2xl text-foreground">Ask about the store</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Sales, stock and customer questions, answered from live data. It can also propose changes — archiving a product or
        restocking a variant — which you approve before anything happens.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-full border border-border bg-background px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AdminAssistant() {
  useDocumentTitle('Assistant · Admin');
  const { messages, loading, error, send, reset, resolvePendingAction } = useAssistantChat(adminAssistantChat);

  return (
    <>
      <PageHeading
        eyebrow="Admin"
        title="Assistant"
        actions={
          messages.length > 0 && (
            <button type="button" onClick={reset} className={buttonClasses.secondary}>
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} /> New chat
            </button>
          )
        }
      >
        Business questions answered from live store data.
      </PageHeading>

      <ChatThread
        messages={messages}
        loading={loading}
        error={error}
        empty={<Welcome onPick={send} />}
        renderAttachments={(message) => (
          <>
            {message.report && <ReportCard report={message.report} />}
            {message.pendingAction && (
              <PendingActionCard
                action={message.pendingAction}
                onResolve={(reply) => resolvePendingAction(message.id, reply)}
              />
            )}
          </>
        )}
      />

      <div className="sticky bottom-0 -mx-4 mt-6 bg-background/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <ChatInput onSend={send} disabled={loading} placeholder="Ask about sales, stock or customers…" autoFocus />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Figures come from live queries. Changes are never applied without your confirmation.
        </p>
      </div>
    </>
  );
}
