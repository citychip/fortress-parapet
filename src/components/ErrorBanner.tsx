export default function ErrorBanner({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div style={{
      background: 'rgba(239,68,68,0.1)',
      border: '1px solid rgba(239,68,68,0.3)',
      borderRadius: 8, padding: '10px 14px',
      color: 'var(--red)', display: 'flex',
      alignItems: 'center', gap: 10, marginBottom: 16,
    }}>
      <span style={{ flex: 1, fontSize: 13 }}>⚠ {msg}</span>
      {onRetry && (
        <button onClick={onRetry} style={{
          background: 'rgba(239,68,68,0.2)',
          color: 'var(--red)', padding: '4px 10px',
        }}>Retry</button>
      )}
    </div>
  );
}
