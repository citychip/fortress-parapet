// ─── Badge — semantic pill (shared, Sprint 13 #83) ───────────────────────────

import { ReactNode } from 'react';

export type Tone = 'red' | 'yellow' | 'green' | 'blue' | 'accent' | 'muted';

const TONES: Record<Tone, { color: string; bg: string }> = {
  red:    { color: 'var(--red)',    bg: 'rgba(239,68,68,0.12)' },
  yellow: { color: 'var(--yellow)', bg: 'rgba(245,158,11,0.12)' },
  green:  { color: 'var(--green)',  bg: 'rgba(34,197,94,0.1)' },
  blue:   { color: '#38bdf8',       bg: 'rgba(56,189,248,0.1)' },
  accent: { color: 'var(--accent)', bg: 'rgba(99,102,241,0.15)' },
  muted:  { color: 'var(--muted)',  bg: 'rgba(100,116,139,0.12)' },
};

export default function Badge({ tone = 'muted', children, title, upper = true, mono = false }: {
  tone?: Tone; children: ReactNode; title?: string; upper?: boolean; mono?: boolean;
}) {
  const t = TONES[tone];
  return (
    <span title={title} style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      color: t.color, background: t.bg, whiteSpace: 'nowrap',
      textTransform: upper ? 'uppercase' : undefined,
      fontFamily: mono ? 'monospace' : undefined,
    }}>{children}</span>
  );
}

export function toneOfVerdict(v: string | null | undefined): Tone {
  if (v === 'ACT') return 'red';
  if (v === 'WATCH') return 'yellow';
  if (v === 'SAFE') return 'green';
  return 'muted';
}
