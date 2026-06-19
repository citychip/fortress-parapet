import { useEffect, useState } from 'react';
import { getDataIntegrity, type IntegrityData, type IntegrityState } from '../lib/api';

// Always-visible market-data integrity badge (top of every page). Reads the
// gateway-down integrity guard, so it shows whether the numbers on screen are
// real-time (IBKR) or a delayed yfinance fallback — independent of the briefing
// `staleness` field, which lingers "fresh" after the gateway dies.

const CFG: Record<IntegrityState, { label: string; glyph: string; color: string; bg: string; border: string }> = {
  live:     { label: 'Live',     glyph: '●', color: 'var(--green)',  bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.35)' },
  fallback: { label: 'Delayed',  glyph: '▲', color: 'var(--yellow)', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.4)' },
  down:     { label: 'No data',  glyph: '■', color: 'var(--red)',    bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.4)' },
  unknown:  { label: '—',        glyph: '○', color: 'var(--muted)',  bg: 'rgba(100,116,139,0.08)', border: 'var(--border)' },
};

const POLL_MS = 60_000;

// Actionable fix shown in the tooltip when the feed is degraded — mirrors the
// Handoff Step-0 recovery procedure so the operator knows exactly what to do.
const FIX_HINT = 'Fix: restart the gateway — `docker restart cp-gateway` (WSL) or Parapet → System → Connections → Sync.';

// Shared poller — lifted into a hook so the Layout header can tint itself with
// the same state the badge shows (single source of truth, single fetch).
export function useIntegrity(): IntegrityData | null {
  const [data, setData] = useState<IntegrityData | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = () => getDataIntegrity()
      .then(d => { if (alive) setData(d); })
      .catch(() => {});
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return data;
}

export function integrityState(data: IntegrityData | null): IntegrityState {
  if (!data) return 'unknown';
  return CFG[data.integrity] ? data.integrity : 'unknown';
}

// Header tint applied by Layout: amber when delayed, red when no data, normal
// otherwise. Returns the bits Layout overlays on its header bar.
export function headerTint(state: IntegrityState): { background?: string; borderBottom?: string } {
  if (state === 'fallback') return { background: 'rgba(245,158,11,0.10)', borderBottom: '1px solid rgba(245,158,11,0.45)' };
  if (state === 'down')     return { background: 'rgba(239,68,68,0.12)',  borderBottom: '1px solid rgba(239,68,68,0.5)' };
  return {};
}

// Presentational badge — Layout owns the data via useIntegrity() and passes it
// down so the badge and the header tint never disagree.
export default function SourceBadge({ data }: { data: IntegrityData | null }) {
  if (!data) return null;
  const state = integrityState(data);
  const cfg = CFG[state];
  const degraded = state === 'fallback' || state === 'down';

  const tip = [
    data.message,
    data.source ? `Source: ${data.source}` : null,
    data.spot != null ? `${data.probe_ticker ?? 'SPY'} ${data.spot}` : null,
    data.checked_at ? `Checked ${new Date(data.checked_at).toLocaleTimeString()}` : null,
    degraded ? FIX_HINT : null,
  ].filter(Boolean).join(' · ');

  const badge = (
    <span
      title={tip}
      style={{
        fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 600,
        whiteSpace: 'nowrap', cursor: 'help',
        color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
      }}
    >
      {cfg.glyph} {cfg.label}
    </span>
  );

  if (!degraded) return badge;

  // When degraded, show the fix as a visible inline pill (full steps on hover)
  // so the operator doesn't have to discover it by hovering the badge.
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {badge}
      <span
        title={FIX_HINT}
        style={{
          fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 600,
          whiteSpace: 'nowrap', cursor: 'help',
          color: cfg.color, background: cfg.bg, border: `1px dashed ${cfg.border}`,
        }}
      >
        ↻ Restart gateway
      </span>
    </span>
  );
}
