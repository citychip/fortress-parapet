// ─── Shared semantic color maps (Sprint 13 #83) ──────────────────────────────

export const VERDICT_COLOR: Record<string, string> = {
  ACT: 'var(--red)', WATCH: 'var(--yellow)', SAFE: 'var(--green)',
};

export const VERDICT_BG: Record<string, string> = {
  ACT: 'rgba(239,68,68,0.12)', WATCH: 'rgba(245,158,11,0.1)', SAFE: 'rgba(34,197,94,0.1)',
};

export const URGENCY_COLOR: Record<string, string> = {
  urgent: 'var(--red)', warning: 'var(--yellow)', approaching: 'var(--accent)', none: 'var(--muted)',
};

export const URGENCY_BG: Record<string, string> = {
  urgent: 'rgba(239,68,68,0.1)', warning: 'rgba(245,158,11,0.1)',
  approaching: 'rgba(99,102,241,0.1)', none: 'rgba(100,116,139,0.1)',
};

export const ALERT_COLOR: Record<string, string> = {
  act: 'var(--red)', watch: 'var(--yellow)', safe: 'var(--green)', ok: 'var(--green)',
};

export const ALERT_BG: Record<string, string> = {
  act: 'rgba(239,68,68,0.1)', watch: 'rgba(245,158,11,0.1)',
  safe: 'rgba(34,197,94,0.1)', ok: 'rgba(34,197,94,0.1)',
};
