import { useCallback, useRef, useState } from 'react';

/** The server is stateless, so the last few turns are replayed with every request. */
const HISTORY_LIMIT = 10;

/**
 * Chat state shared by the storefront widget and the admin console.
 * `sendFn(messages)` posts to the relevant endpoint and resolves to the response body;
 * whatever extra fields it carries (products, report, pending_action) ride along on the
 * assistant message so each surface can render them its own way.
 */
export function useAssistantChat(sendFn) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const nextId = useRef(0);

  const send = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const history = [...messages, { id: `m${nextId.current++}`, role: 'user', content: trimmed }];
      setMessages(history);
      setLoading(true);
      setError(null);

      try {
        const data = await sendFn(
          history.slice(-HISTORY_LIMIT).map(({ role, content }) => ({ role, content })),
        );
        setMessages((prev) => [
          ...prev,
          {
            id: `m${nextId.current++}`,
            role: 'assistant',
            content: data.reply,
            products: data.products ?? [],
            report: data.report ?? null,
            pendingAction: data.pending_action ?? null,
          },
        ]);
      } catch (err) {
        setError(err.message || 'The assistant could not be reached.');
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, sendFn],
  );

  /** Used after a pending action is confirmed or cancelled, so the card can't be clicked twice. */
  const resolvePendingAction = useCallback((messageId, reply) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, pendingAction: null } : m)).concat(
        reply ? [{ id: `r${messageId}`, role: 'assistant', content: reply, products: [], report: null, pendingAction: null }] : [],
      ),
    );
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, send, reset, resolvePendingAction };
}
