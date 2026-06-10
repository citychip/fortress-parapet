import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import Layout from '../components/Layout';
import StatRow from '../components/StatRow';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { KV } from '../components/KV';
import { PositionsCardList } from '../components/positions/PositionCards';
import { augmentLeg } from '../lib/positions';
import { useSettings } from '../lib/useSettings';
import {
  getBriefing, getPositions, getCandidates, getPendingOrders, getCalendar,
  getMarketIntel, getSpyHedge, getDpFloorsGex, getPcsExposure, getPnl,
  triggerIbkrSync,
  fmt$, fmtPct,
  type BriefingData, type PnLData,
} from '../lib/api';

// ── NLV history (for day-over-day Δ) ─────────────────────────────────────────
// NOTE (#90): localStorage is a stopgap — durable NLV history needs a backend
// snapshot endpoint (see Sprint 13 notes). UI reads will switch over when it exists.

const NLV_HISTORY_KEY = 'nlv_history';

function loadNlvHistory(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(NLV_HISTORY_KEY) ?? '{}'); } catch { return {}; }
}

function saveNlvSnapshot(nlv: number) {
  try {
    const hist = loadNlvHistory();
    const today = new Date().toISOString().slice(0, 10);
    hist[today] = nlv;
    const keys = Object.keys(hist).sort();
    while (keys.length > 30) { delete hist[keys.shift()!]; }
    localStorage.setItem(NLV_HISTORY_KEY, JSON.stringify(hist));
  } catch {}
}

function getPriorNlv(): number | null {
  const hist = loadNlvHistory();
  const today = new Date().toISOString().slice(0, 10);
  const keys = Object.keys(hist).filter(k => k < today).sort();
  if (!keys.length) return null;
  return hist[keys[keys.length - 1]];
}

// ── Collapsible section helper ────────────────────────────────────────────────

const LS_KEY = 'briefing_collapsed';

function readCollapsed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); } catch { return {}; }
}

function SectionHeader({ id, label, collapsed, onToggle, extra }: {
  id: string; label: string; collapsed: boolean; onToggle: (id: string) => void; extra?: string;
}) {
  return (
    <button
      onClick={() => onToggle(id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 10px',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--muted)', transition: 'transform 0.15s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      {extra && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>{extra}</span>}
    </button>
  );
}

export default function BriefingPage() {
  const [, navigate] = useLocation();
  const settingsCfg = useSettings();

  // ── Collapsible state (persisted in localStorage) ──────────────────────────
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed);

  const toggleSection = (id: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ── Core state (30s tier) ──────────────────────────────────────────────────
  const [briefing,    setBriefing]    = useState<BriefingData | null>(null);
  const [positions,   setPositions]   = useState<any[]>([]);
  const [pnl,         setPnl]         = useState<PnLData | null>(null);
  const [orderCount,  setOrderCount]  = useState(0);
  // ── Intel state (5-min tier, #89) ───────────────────────────────────────────
  const [ivrMap,      setIvrMap]      = useState<Map<string, number | null>>(new Map());
  const [ivMap,       setIvMap]       = useState<Map<string, number | null>>(new Map());
  const [pcsExposure, setPcsExposure] = useState<any>(null);
  const [intel,       setIntel]       = useState<any>(null);
  const [hedge,       setHedge]       = useState<any>(null);
  const [dpData,      setDpData]      = useState<any>(null);
  const [calendar,    setCalendar]    = useState<any>(null);
  // ── Loading ─────────────────────────────────────────────────────────────────
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [syncing,   setSyncing]   = useState(false);
  const [nlvDelta,  setNlvDelta]  = useState<{ abs: number; pct: number } | null>(null);

  const loadCore = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const [b, p, pl, o] = await Promise.allSettled([
        getBriefing(), getPositions(), getPnl(), getPendingOrders(),
      ]);
      if (b.status === 'fulfilled') {
        setBriefing(b.value);
        const nlvVal = b.value?.account?.net_liq;
        if (nlvVal != null) {
          const prior = getPriorNlv();
          if (prior != null && prior !== 0) {
            setNlvDelta({ abs: nlvVal - prior, pct: ((nlvVal - prior) / prior) * 100 });
          }
          saveNlvSnapshot(nlvVal);
        }
      }
      if (p.status  === 'fulfilled') setPositions((p.value?.positions ?? []).map(augmentLeg));
      if (pl.status === 'fulfilled') setPnl(pl.value);
      if (o.status  === 'fulfilled') setOrderCount((o.value?.orders?.length ?? 0) + (o.value?.pending?.length ?? 0));
      if (b.status  === 'rejected')  setError(String(b.reason));
      setUpdatedAt(new Date().toISOString());
    } catch (e: any) {
      setError(String(e));
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  const loadIntel = useCallback(async () => {
    const [c, pcs, mi, h, dp, cal] = await Promise.allSettled([
      getCandidates(), getPcsExposure(), getMarketIntel(), getSpyHedge(), getDpFloorsGex('SPY'), getCalendar(),
    ]);
    if (c.status === 'fulfilled') {
      const m  = new Map<string, number | null>();
      const iv = new Map<string, number | null>();
      for (const row of (c.value?.rows ?? [])) {
        m.set(row.ticker,  row.ivr        ?? null);
        iv.set(row.ticker, row.current_iv ?? null);
      }
      setIvrMap(m); setIvMap(iv);
    }
    if (pcs.status === 'fulfilled') setPcsExposure(pcs.value);
    if (mi.status  === 'fulfilled') setIntel(mi.value);
    if (h.status   === 'fulfilled') setHedge(h.value);
    if (dp.status  === 'fulfilled') setDpData(dp.value);
    if (cal.status === 'fulfilled') setCalendar(cal.value);
  }, []);

  const loadAll = useCallback((background = false) => {
    loadCore(background);
    loadIntel();
  }, [loadCore, loadIntel]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Tiered polling (#89): account/positions/pnl/orders every 30s;
  // intel (candidates, hedge, DP, calendar…) every 5 min — it moves slowly.
  useEffect(() => {
    const core  = setInterval(() => loadCore(true), 30_000);
    const intel = setInterval(() => loadIntel(),    5 * 60_000);
    return () => { clearInterval(core); clearInterval(intel); };
  }, [loadCore, loadIntel]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const nlv         = briefing?.account?.net_liq;
  const avail       = briefing?.account?.available_funds;
  const excessLiq   = briefing?.account?.excess_liq;
  const vix         = briefing?.macro_regime?.vix;
  const regime      = briefing?.macro_regime?.regime ?? '—';
  const pacingObj   = briefing?.pacing;
  const pacing      = pacingObj ? `${pacingObj.used ?? 0}/${pacingObj.max_per_week ?? 5}` : '—';
  const totalDelta  = briefing?.greeks?.portfolio_delta ?? 0;
  const theta       = briefing?.greeks?.portfolio_theta;
  const vega        = briefing?.greeks?.portfolio_vega;
  const msftWarn    = briefing?.concentration?.msft_warning;
  const staleMinutes = briefing?.staleness?.hours != null ? briefing.staleness.hours * 60 : null;
  const limitedMode  = staleMinutes != null && staleMinutes > 5 && isMarketHours();
  const activeActions = (briefing?.actions ?? []).filter((a: any) => a.ticker || a.action || a.message);
  const deltaColor  = Math.abs(totalDelta) > 1000 ? 'var(--yellow)' :
                      totalDelta >= 0 ? 'var(--green)' : 'var(--red)';
  const vixColor    = !vix ? undefined : vix > 30 ? 'var(--red)' : vix > 20 ? 'var(--yellow)' : 'var(--green)';
  const regimeColor = String(regime).toLowerCase() === 'bullish' ? 'var(--green)'
                    : String(regime).toLowerCase() === 'bearish' ? 'var(--red)' : 'var(--muted)';

  // Event horizon (#87): earnings within 14d + any macro events the backend provides
  const horizon: Array<{ label: string; days: number | null; tone: string }> = (() => {
    const out: Array<{ label: string; days: number | null; tone: string }> = [];
    for (const [ticker, e] of Object.entries<any>(calendar?.tickers ?? {})) {
      const d = e?.days_to_earnings;
      if (d == null || d < 0 || d > 14) continue;
      if (e?.status === 'past' || e?.status === 'no_earnings') continue;
      out.push({ label: `${ticker} earnings`, days: d, tone: d <= 5 ? 'var(--red)' : 'var(--yellow)' });
    }
    for (const ev of (intel?.events ?? [])) {
      if (ev?.label) out.push({ label: ev.label, days: ev.days ?? null, tone: 'var(--accent)' });
    }
    return out.sort((a, b) => (a.days ?? 99) - (b.days ?? 99)).slice(0, 8);
  })();

  return (
    <Layout title="Briefing" onRefresh={() => loadAll()} loading={loading} lastUpdated={updatedAt}
      action={
        <button
          onClick={async () => { setSyncing(true); try { await triggerIbkrSync(); } catch {} finally { setSyncing(false); loadCore(true); } }}
          disabled={syncing}
          title="Force IBKR sync"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: syncing ? 'var(--green)' : 'var(--muted)', fontSize: 12, padding: '5px 12px' }}
        >
          {syncing ? '⟳ Syncing…' : '⟳ Sync IBKR'}
        </button>
      }
    >
      {error && <ErrorBanner msg={error} onRetry={() => loadAll()} />}

      {loading && !briefing && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={32} />
        </div>
      )}

      {briefing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>

          {/* ── Regime banner — promoted to top (#81): the #1 morning question ── */}
          {intel?.regime?.score != null && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: intel.regime.score > 0 ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)', border: `1px solid ${intel.regime.score > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: intel.regime.score > 0 ? 'var(--green)' : 'var(--red)' }}>
                {intel.regime.score > 0 ? '✓ ENTRIES OPEN' : '✕ ENTRIES BLOCKED'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                score: {intel.regime.score > 0 ? '+' : ''}{intel.regime.score}
                {intel.regime.overall ? ` · ${intel.regime.overall}` : ''}
              </span>
            </div>
          )}

          {/* ── Pending orders strip (#81) ─────────────────────────────────────── */}
          {orderCount > 0 && (
            <button
              onClick={() => navigate('/triage')}
              style={{
                padding: '10px 16px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.35)',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              }}
            >
              <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>◷ {orderCount} order{orderCount !== 1 ? 's' : ''} awaiting approval</span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>— approve via Claude · status on Triage →</span>
            </button>
          )}

          {/* ── Event horizon (#87) ────────────────────────────────────────────── */}
          {horizon.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Event horizon</span>
              {horizon.map((h, i) => (
                <span key={i} style={{ fontSize: 12, fontFamily: 'monospace', padding: '3px 10px', borderRadius: 12, background: 'var(--surface)', border: `1px solid var(--border)`, color: h.tone }}>
                  {h.label}{h.days != null ? ` ${h.days}d` : ''}
                </span>
              ))}
            </div>
          )}

          {/* ── Stat bar — two tiers (#92) ─────────────────────────────────────── */}
          <StatRow stats={[
            { label: 'Net Liq',    value: fmt$(nlv),    color: 'var(--text)' },
            ...(nlvDelta ? [{
              label: 'NLV Δ (1d)',
              value: `${fmt$(nlvDelta.abs)} (${fmtPct(nlvDelta.pct)})`,
              color: nlvDelta.abs >= 0 ? 'var(--green)' : 'var(--red)',
              mono: true,
            }] : []),
            { label: 'Δ port',  value: totalDelta != null ? (totalDelta > 0 ? '+' : '') + Math.round(totalDelta) : '—', color: deltaColor, mono: true },
            { label: 'Θ/day',   value: theta != null ? `+$${Math.abs(theta).toFixed(0)}` : '—', color: 'var(--green)', mono: true },
            { label: 'Regime',  value: String(regime).toUpperCase(), color: regimeColor },
          ]} />
          <StatRow compact stats={[
            { label: 'Available',  value: fmt$(avail),  color: briefing?.account?.thresholds?.available_funds_ok === false ? 'var(--red)' : 'var(--muted)' },
            { label: 'Excess Liq', value: fmt$(excessLiq), color: briefing?.account?.thresholds?.excess_liq_ok === false ? 'var(--red)' : 'var(--muted)' },
            { label: 'Vega',       value: vega != null ? Math.round(Math.abs(vega)).toString() : '—', color: 'var(--muted)', mono: true },
            { label: 'VIX',        value: vix?.toFixed(2) ?? '—', color: vixColor },
            { label: 'Pacing',     value: String(pacing) },
          ]} />

          {/* P&L summary strip */}
          {pnl && (() => {
            const total    = pnl.summary?.total_pnl;
            const unreal   = pnl.summary?.unrealized_pnl;
            const real     = pnl.summary?.realized_pnl;
            const byTicker = pnl.by_ticker ?? [];
            const sorted   = [...byTicker].filter(r => r.pnl != null).sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0));
            const winner   = sorted[0];
            const loser    = sorted[sorted.length - 1];
            const totalColor = total == null ? 'var(--muted)' : total >= 0 ? 'var(--green)' : 'var(--red)';
            return (
              <StatRow compact stats={[
                { label: 'Total P&L',    value: fmt$(total),  color: totalColor, mono: true },
                { label: 'Unrealized',   value: fmt$(unreal), color: unreal == null ? 'var(--muted)' : unreal >= 0 ? 'var(--green)' : 'var(--red)', mono: true },
                { label: 'Realized',     value: fmt$(real),   color: real == null ? 'var(--muted)' : real >= 0 ? 'var(--green)' : 'var(--red)', mono: true },
                ...(winner && winner.pnl != null && winner.pnl > 0 ? [{ label: '▲ Winner', value: `${winner.ticker} ${fmt$(winner.pnl)}`, color: 'var(--green)', mono: true }] : []),
                ...(loser && loser.pnl != null && loser.pnl < 0 ? [{ label: '▼ Loser', value: `${loser.ticker} ${fmt$(loser.pnl)}`, color: 'var(--red)', mono: true }] : []),
              ]} />
            );
          })()}

          {/* Banners */}
          {limitedMode && (
            <div style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.35)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>⚠ LIMITED MODE</span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>— IBKR data is {Math.round(staleMinutes!)}m old · positions and greeks may not reflect current market</span>
            </div>
          )}

          {msftWarn && (
            <div style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>🔒 MSFT concentration {briefing?.concentration?.all?.['MSFT']?.toFixed(0)}% of NLV</span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>— new entries locked until below 30%</span>
            </div>
          )}

          {pcsExposure && (pcsExposure.spread_count > 0 || pcsExposure.at_cap) && (() => {
            const atCap  = pcsExposure.at_cap;
            const color  = atCap ? 'var(--red)' : 'var(--yellow)';
            const bg     = atCap ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)';
            const border = atCap ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.25)';
            return (
              <div style={{ padding: '10px 16px', borderRadius: 8, background: bg, border: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 14, fontSize: 13 }}>
                <span style={{ color, fontWeight: 700 }}>PCS Exposure</span>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--fg)' }}>{pcsExposure.spread_count ?? 0}/{pcsExposure.max_spreads ?? '?'} spreads</span>
                {pcsExposure.total_notional_usd != null && (
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>${(pcsExposure.total_notional_usd / 1000).toFixed(0)}K notional</span>
                )}
                {pcsExposure.tickers?.length > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pcsExposure.tickers.join(' · ')}</span>
                )}
                {atCap && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: 'var(--red)' }}>AT CAP</span>}
              </div>
            );
          })()}

          {activeActions.length > 0 && (
            <Card title={`Priority Actions (${activeActions.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeActions.map((a: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 6, background: 'var(--surface2)', borderLeft: `3px solid ${a.urgency === 'critical' ? 'var(--red)' : 'var(--yellow)'}` }}>
                    {a.ticker && <span style={{ fontWeight: 700, fontSize: 13, minWidth: 60 }}>{a.ticker}</span>}
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>{a.action ?? a.type ?? a.message ?? JSON.stringify(a)}</span>
                    {a.urgency && (
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: a.urgency === 'critical' ? 'var(--red)' : 'var(--yellow)' }}>{a.urgency}</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Market Intel section ─────────────────────────────────────────────── */}
      {intel && (
        <div style={{ marginBottom: 20 }}>
          <SectionHeader id="intel" label="Market Intel" collapsed={!!collapsed['intel']} onToggle={toggleSection}
            extra={intel.regime?.score != null ? (intel.regime.score > 0 ? '✓ open' : '✕ blocked') : undefined}
          />
        {!collapsed['intel'] && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* KV chips row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {intel.current_price && <KV label="SPY"          value={`$${intel.current_price}`} />}
            {intel.dp_floor      && <KV label="DP Floor"      value={`$${intel.dp_floor}`} />}
            {intel.dp_ceiling    && <KV label="DP Ceiling"    value={`$${intel.dp_ceiling}`} />}
            {intel.gex_call_wall && <KV label="GEX Call Wall" value={`$${intel.gex_call_wall}`} />}
            {intel.gex_put_wall  && <KV label="GEX Put Wall"  value={`$${intel.gex_put_wall}`} />}
            {intel.flip_level    && <KV label="Flip Level"    value={`$${intel.flip_level}`} />}
          </div>

          {/* DP Floors */}
          {dpData?.dp_floors?.length > 0 && (
            <Card title="DP Floors — SPY">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[...dpData.dp_floors].sort((a: number, b: number) => b - a).map((lvl: number, i: number) => (
                  <span key={i} style={{ fontFamily: 'monospace', fontSize: 12, padding: '3px 10px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--fg)', border: '1px solid var(--border)' }}>${lvl.toFixed(2)}</span>
                ))}
              </div>
            </Card>
          )}

          {/* SPY Hedge */}
          {hedge && (
            <Card title="SPY Hedge Coverage">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 4, background: hedge.coverage_ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: hedge.coverage_ok ? 'var(--green)' : 'var(--red)' }}>{hedge.coverage_ok ? '✓ HEDGED' : '✕ UNDER-HEDGED'}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Current: <span style={{ color: 'var(--fg)', fontFamily: 'monospace' }}>${(hedge.hedge_market_value ?? 0).toLocaleString()}</span></span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Target: <span style={{ color: 'var(--fg)', fontFamily: 'monospace' }}>${(hedge.target_min ?? 0).toLocaleString()}–${(hedge.target_max ?? 0).toLocaleString()}</span></span>
                {hedge.legs_count != null && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Legs: <span style={{ fontFamily: 'monospace', color: 'var(--fg)' }}>{hedge.legs_count}</span></span>}
              </div>
            </Card>
          )}

          {/* Regime Signals */}
          {Array.isArray(intel.regime?.signals) && intel.regime.signals.length > 0 && (
            <Card title="Regime Signals">
              {intel.regime.signals.map((s: any, i: number) => (
                <div key={i} style={{ padding: '10px 12px', marginBottom: 8, borderRadius: 6, background: 'var(--surface2)', borderLeft: `3px solid ${(s.weight ?? 0) > 0 ? 'var(--green)' : (s.weight ?? 0) < 0 ? 'var(--red)' : 'var(--border2)'}` }}>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 4, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{s.source}</span>
                    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: (s.weight ?? 0) > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: (s.weight ?? 0) > 0 ? 'var(--green)' : 'var(--red)' }}>{s.signal}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>{s.note}</p>
                </div>
              ))}
            </Card>
          )}
        </div>}
        </div>
      )}

      {/* ── Positions section (default collapsed — full view lives on Positions > Overview) ── */}
      {positions.length > 0 && (
        <div>
          <SectionHeader id="positions" label="Positions" collapsed={collapsed['positions'] ?? true} onToggle={toggleSection}
            extra={`${[...new Set(positions.map((p: any) => p.ticker))].length} tickers · ${positions.length} legs`}
          />
          {!(collapsed['positions'] ?? true) && (
            <PositionsCardList positions={positions} ivrMap={ivrMap} ivMap={ivMap} settings={settingsCfg} />
          )}
        </div>
      )}
    </Layout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function isMarketHours(): boolean {
  const et   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = et.getDay();
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}
