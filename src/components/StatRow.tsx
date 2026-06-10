interface Stat {
  label: string;
  value: string | number;
  color?: string;
  mono?: boolean;
}

// `compact` (Sprint 13 #92): secondary stat tier renders ~70% size so the
// primary numbers (NLV, Δ, Θ, Regime) carry the visual weight.
export default function StatRow({ stats, compact = false }: { stats: Stat[]; compact?: boolean }) {
  return (
    <div style={{
      display: 'flex', gap: 0,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {stats.map((s, i) => (
        <div key={i} style={{
          flex: 1, padding: compact ? '9px 14px' : '14px 20px',
          borderRight: i < stats.length - 1 ? '1px solid var(--border)' : 'none',
        }}>
          <div style={{ fontSize: compact ? 10 : 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: compact ? 3 : 6 }}>
            {s.label}
          </div>
          <div style={{
            fontSize: compact ? 14 : 20, fontWeight: 600,
            color: s.color ?? 'var(--text)',
            fontFamily: s.mono ? 'monospace' : undefined,
          }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
