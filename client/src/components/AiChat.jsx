import React, { useState, useRef, useEffect } from 'react';
import { aiChatApi } from '../api';
import { usePlan } from '../hooks/usePlan';

// Floating chat assistant. The bubble lives in the bottom-right corner of
// every shopify-app page. Clicking opens a panel with a transcript-style
// conversation that talks to /api/ai-chat (which has access to the shop's
// recent analytics + audit data).
export default function AiChat() {
  const { can } = usePlan();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]); // [{ role, content }]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // Plan-gate: only render the chat at all if the merchant's plan grants it.
  // Must come AFTER all hooks (Rules of Hooks).
  if (!can('aiChat')) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const r = await aiChatApi.send(next);
      setMessages(m => [...m, { role: 'assistant', content: r.reply }]);
    } catch (err) {
      setError(err?.error || err?.message || 'Chat failed');
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Bubble */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            width: 56, height: 56, borderRadius: '50%',
            background: '#1a1a1a', color: '#fff', border: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)', cursor: 'pointer',
            fontSize: 22,
          }}
        >✨</button>
      )}

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 380, maxWidth: '92vw',
          height: 540, maxHeight: '80vh',
          background: '#fff',
          border: '1px solid var(--p-color-border)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--p-color-border-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#1a1a1a', color: '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>✨</span>
              <strong style={{ fontSize: 14 }}>Ask anything</strong>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 18 }}
            >×</button>
          </div>

          <div ref={scrollRef} style={{
            flex: 1, overflowY: 'auto', padding: 16,
            display: 'flex', flexDirection: 'column', gap: 8,
            background: '#fafbfb',
          }}>
            {messages.length === 0 && (
              <div style={{ color: '#6d7175', fontSize: 13, lineHeight: 1.6 }}>
                Hi! I have access to your store's recent analytics, audit, and Ads data. Try asking:
                <ul style={{ paddingLeft: 18, margin: '8px 0' }}>
                  <li>"What changed this week?"</li>
                  <li>"Which campaigns are losing money?"</li>
                  <li>"How's my Site Audit score trending?"</li>
                  <li>"Top 3 things to fix today?"</li>
                </ul>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                background: m.role === 'user' ? '#1a1a1a' : '#fff',
                color: m.role === 'user' ? '#fff' : '#202223',
                border: m.role === 'user' ? 'none' : '1px solid var(--p-color-border-secondary)',
                padding: '8px 12px', borderRadius: 12,
                fontSize: 13, lineHeight: 1.5, maxWidth: '85%',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {m.content}
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: 'flex-start', color: '#6d7175', fontSize: 12 }}>Thinking…</div>
            )}
            {error && (
              <div style={{ alignSelf: 'flex-start', color: '#d72c0d', fontSize: 12 }}>{error}</div>
            )}
          </div>

          <div style={{
            padding: 12, borderTop: '1px solid var(--p-color-border-secondary)',
            display: 'flex', gap: 8, alignItems: 'flex-end',
          }}>
            <textarea
              rows={2}
              placeholder="Ask about your store…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              disabled={loading}
              style={{
                flex: 1, resize: 'none',
                border: '1px solid var(--p-color-border)',
                borderRadius: 8, padding: '8px 10px',
                fontSize: 13, fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                background: '#1a1a1a', color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 14px', fontSize: 13,
                fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                opacity: !input.trim() ? 0.5 : 1,
              }}
            >Send</button>
          </div>
        </div>
      )}
    </>
  );
}
