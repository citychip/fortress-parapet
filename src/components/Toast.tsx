import { createContext, useContext, useState, useCallback, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
}

interface ToastCtx {
  showToast: (msg: string, type?: ToastType) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let _id = 0;

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((msg: string, type: ToastType = 'success') => {
    const id = ++_id;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Fixed bottom-right stack */}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <ToastBubble key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Bubble ────────────────────────────────────────────────────────────────────

const STYLES: Record<ToastType, { color: string; bg: string; border: string; icon: string }> = {
  success: { color: 'var(--green)',  bg: 'rgba(34,197,94,0.14)',  border: 'rgba(34,197,94,0.4)',  icon: '✓' },
  error:   { color: 'var(--red)',    bg: 'rgba(239,68,68,0.14)',  border: 'rgba(239,68,68,0.4)',  icon: '✕' },
  info:    { color: 'var(--accent)', bg: 'rgba(99,102,241,0.14)', border: 'rgba(99,102,241,0.4)', icon: 'ℹ' },
};

function ToastBubble({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 16);
    return () => clearTimeout(t);
  }, []);

  const { color, bg, border, icon } = STYLES[toast.type];

  return (
    <div
      onClick={onDismiss}
      style={{
        pointerEvents: 'auto', cursor: 'pointer',
        padding: '10px 14px', borderRadius: 8,
        background: bg, border: `1px solid ${border}`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', gap: 10,
        maxWidth: 320, minWidth: 180,
        transform: visible ? 'translateX(0)' : 'translateX(calc(100% + 40px))',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.22s ease, opacity 0.22s ease',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.4 }}>{toast.msg}</span>
    </div>
  );
}
