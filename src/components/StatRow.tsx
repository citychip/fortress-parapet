interface Stat {
  label: string;
  value: string | number;
  color?: string;
  mono?: boolean;
}

export default function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <div style={{
      display: 'flex', gap: 0,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {stats.map((s, i) => (
        <div key={i} style={{
          flex: 1, padding: '14px 20px',
          borderRight: i < stats.length - 1 ? '1px solid var(--border)' : 'none',
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            {s.label}
          </div>
          <div style={{
            fontSize: 20, fontWeight: 600,
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
