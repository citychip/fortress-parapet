import { useEffect, useState, useCallback, type ReactNode } from 'react';
import Layout from '../components/Layout';
import StatRow from '../components/StatRow';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { useSortable, SortTh } from '../components/Sortable';
import {
  getBriefing, getIbkrStatus, getAlerts, getPositions, getCandidates,
  getMarketIntel, getSettings, getSpyHedge, getDpFloorsGex, getPcsExposure,
  triggerIbkrSync, getPnl,
  fmt$, fmtPct,
  type BriefingData, type IbkrStatusData, type AlertData, type PnLData,
} from '../lib/api';

// ── NLV history (for day-over-day Δ) ─────────────────────────────────────────

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
  // ── Collapsible state (persisted in localStorage) ──────────────────────────
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed);

  const toggleSection = (id: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ── Core state ─────────────────────────────────────────────────────────────
  const [briefing,    setBriefing]    = useState<BriefingData | null>(null);
  const [ibkr,        setIbkr]        = useState<IbkrStatusData | null>(null);
  const [alerts,      setAlerts]      = useState<AlertData[]>([]);
  const [positions,   setPositions]   = useState<any[]>([]);
  const [ivrMap,      setIvrMap]      = useState<Map<string, number | null>>(new Map());
  const [ivMap,       setIvMap]       = useState<Map<string, number | null>>(new Map());
  const [settings,    setSettings]    = useState<any>(null);
  const [pcsExposure, setPcsExposure] = useState<any>(null);
  // ── Market intel state ──────────────────────────────────────────────────────
  const [intel,   setIntel]   = useState<any>(null);
  const [hedge,   setHedge]   = useState<any>(null);
  const [dpData,  setDpData]  = useState<any>(null);
  const [pnl,     setPnl]     = useState<PnLData | null>(null);
  // ── Loading ─────────────────────────────────────────────────────────────────
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [syncing,   setSyncing]   = useState(false);
  const [nlvDelta,  setNlvDelta]  = useState<{ abs: number; pct: number } | null>(null);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const [b, i, a, p, c, s, pcs, mi, h, dp, pl] = await Promise.allSettled([
        getBriefing(), getIbkrStatus(), getAlerts(), getPositions(), getCandidates(),
        getSettings(), getPcsExposure(), getMarketIntel(), getSpyHedge(), getDpFloorsGex('SPY'),
        getPnl(),
      ]);
      if (b.status   === 'fulfilled') {
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
      if (i.status   === 'fulfilled') setIbkr(i.value);
      if (a.status   === 'fulfilled') setAlerts(a.value?.alerts ?? []);
      if (p.status   === 'fulfilled') setPositions((p.value?.positions ?? []).map(augmentLeg));
      if (c.status   === 'fulfilled') {
        const m  = new Map<string, number | null>();
        const iv = new Map<string, number | null>();
        for (const row of (c.value?.rows ?? [])) {
          m.set(row.ticker,  row.ivr        ?? null);
          iv.set(row.ticker, row.current_iv ?? null);
        }
        setIvrMap(m); setIvMap(iv);
      }
      if (s.status   === 'fulfilled') setSettings(s.value);
      if (pcs.status === 'fulfilled') setPcsExposure(pcs.value);
      if (mi.status  === 'fulfilled') setIntel(mi.value);
      if (h.status   === 'fulfilled') setHedge(h.value);
      if (dp.status  === 'fulfilled') setDpData(dp.value);
      if (pl.status  === 'fulfilled') setPnl(pl.value);
      if (b.status   === 'rejected')  setError(String(b.reason));
      setUpdatedAt(new Date().toISOString());
    } catch (e: any) {
      setError(String(e));
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load]);

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

  return (
    <Layout title="Briefing" onRefresh={load} loading={loading} lastUpdated={updatedAt}
      action={
        <button
          onClick={async () => { setSyncing(true); try { await triggerIbkrSync(); } catch {} finally { setSyncing(false); load(true); } }}
          disabled={syncing}
          title="Force IBKR sync"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: syncing ? 'var(--green)' : 'var(--muted)', fontSize: 12, padding: '5px 12px' }}
        >
          {syncing ? '⟳ Syncing…' : '⟳ Sync IBKR'}
        </button>
      }
    >
      {error && <ErrorBanner msg={error} onRetry={load} />}

      {loading && !briefing && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={32} />
        </div>
      )}

      {/* ── Stat bar ─────────────────────────────────────────────────────────── */}
      {briefing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <StatRow stats={[
            { label: 'Net Liq',    value: fmt$(nlv),    color: 'var(--text)' },
            ...(nlvDelta ? [{
              label: 'NLV Δ (1d)',
              value: `${fmt$(nlvDelta.abs)} (${fmtPct(nlvDelta.pct)})`,
              color: nlvDelta.abs >= 0 ? 'var(--green)' : 'var(--red)',
              mono: true,
            }] : []),
            { label: 'Available',  value: fmt$(avail),  color: briefing?.account?.thresholds?.available_funds_ok === false ? 'var(--red)' : 'var(--muted)' },
            { label: 'Excess Liq', value: fmt$(excessLiq), color: briefing?.account?.thresholds?.excess_liq_ok === false ? 'var(--red)' : 'var(--muted)' },
            { label: 'Δ port',     value: totalDelta != null ? (totalDelta > 0 ? '+' : '') + Math.round(totalDelta) : '—', color: deltaColor, mono: true },
            { label: 'Θ/day',      value: theta != null ? `+$${Math.abs(theta).toFixed(0)}` : '—', color: 'var(--green)', mono: true },
            { label: 'Vega',       value: vega != null ? Math.round(Math.abs(vega)).toString() : '—', color: 'var(--muted)', mono: true },
            { label: 'VIX',        value: vix?.toFixed(2) ?? '—', color: vixColor },
            { label: 'Regime',     value: String(regime).toUpperCase(), color: 'var(--muted)' },
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
              <StatRow stats={[
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
          {/* Regime banner */}
          {intel.regime?.score != null && (
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

      {/* ── Positions section ─────────────────────────────────────────────────── */}
      {positions.length > 0 && (
        <div>
          <SectionHeader id="positions" label="Positions" collapsed={!!collapsed['positions']} onToggle={toggleSection}
            extra={`${[...new Set(positions.map((p: any) => p.ticker))].length} tickers · ${positions.length} legs`}
          />
          {!collapsed['positions'] && (
            <PositionsTab positions={positions} ivrMap={ivrMap} ivMap={ivMap} settings={settings} />
          )}
        </div>
      )}
    </Layout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isMarketHours(): boolean {
  const et   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = et.getDay();
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

function KV({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 20px', minWidth: 120 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--text)', fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}

// ── Position helpers ──────────────────────────────────────────────────────────

const dte = (expiry: string | null | undefined): number =>
  expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : 0;

const netOf = (legs: any[], field: string) =>
  legs.reduce((s: number, l: any) => s + (l[field] ?? 0), 0);

const fmtStrike = (l: any) =>
  l?.strike && l.strike !== 0 ? `$${l.strike}${l.right ?? ''}` : null;

function parseLocalSymbol(localSymbol: string | null | undefined): { expiry: string | null; right: string | null; strike: number | null } {
  const empty = { expiry: null, right: null, strike: null };
  if (!localSymbol) return empty;
  const m = localSymbol.match(/\[\S+\s+(\d{6})([CP])(\d{8})/);
  if (!m) return empty;
  const [, yymmdd, right, strikeStr] = m;
  const expiry = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
  const strike = parseInt(strikeStr, 10) / 1000;
  return { expiry, right, strike };
}

function augmentLeg(p: any): any {
  if (p.expiry && p.strike && p.right) return p;
  const parsed = parseLocalSymbol(p.local_symbol);
  return {
    ...p,
    expiry: p.expiry ?? parsed.expiry,
    strike: (p.strike && p.strike !== 0) ? p.strike : (parsed.strike ?? p.strike),
    right:  p.right ?? parsed.right,
  };
}

type StratGroup =
  | { type: 'PMCC'; leap: any; sc: any }
  | { type: 'IC';   sc: any; lc: any; sp: any; lp: any }
  | { type: 'BPS';  sp: any; lp: any }
  | { type: 'STR';  sc: any; sp: any }
  | { type: 'LEG';  leg: any };

function groupTickerLegs(legs: any[]): StratGroup[] {
  const taken = new Set<any>();
  const free  = (l: any) => !taken.has(l);
  const take  = (...ls: any[]) => ls.forEach(l => taken.add(l));
  const result: StratGroup[] = [];
  const sc = legs.filter(l => free(l) && l.leg_direction === 'short' && l.right === 'C');
  const lc = legs.filter(l => free(l) && l.leg_direction === 'long'  && l.right === 'C');
  const sp = legs.filter(l => free(l) && l.leg_direction === 'short' && l.right === 'P');
  const lp = legs.filter(l => free(l) && l.leg_direction === 'long'  && l.right === 'P');
  // Iron Condor
  for (const shortCall of [...sc]) {
    if (!free(shortCall)) continue;
    for (const shortPut of sp.filter(free)) {
      const longCall = lc.filter(free).find(l => l.strike > shortCall.strike);
      const longPut  = lp.filter(free).find(l => l.strike < shortPut.strike);
      if (longCall && longPut) { take(shortCall, shortPut, longCall, longPut); result.push({ type: 'IC', sc: shortCall, lc: longCall, sp: shortPut, lp: longPut }); break; }
    }
  }
  // PMCC
  for (const leap of lc.filter(free).filter(l => dte(l.expiry) > 90 && (l.strike ?? 0) > 0)) {
    const shortCall = sc.filter(free).find(s => (s.strike ?? 0) > (leap.strike ?? 0));
    if (shortCall) { take(leap, shortCall); result.push({ type: 'PMCC', leap, sc: shortCall }); }
  }
  // Put spreads
  for (const shortPut of sp.filter(free)) {
    const longPut = lp.filter(free).find(l => l.strike < shortPut.strike);
    if (longPut) { take(shortPut, longPut); result.push({ type: 'BPS', sp: shortPut, lp: longPut }); }
  }
  // Strangles
  for (const shortCall of sc.filter(free)) {
    if (!shortCall.expiry) continue;
    const shortPut = sp.filter(free).find(l => l.expiry && l.expiry === shortCall.expiry);
    if (shortPut) { take(shortCall, shortPut); result.push({ type: 'STR', sc: shortCall, sp: shortPut }); }
  }
  for (const leg of legs.filter(free)) result.push({ type: 'LEG', leg });
  return result;
}

const BADGE: Record<string, { bg: string; color: string }> = {
  PMCC: { bg: 'rgba(99,102,241,0.15)',  color: 'var(--accent)' },
  IC:   { bg: 'rgba(59,130,246,0.15)',  color: 'var(--blue)' },
  BPS:  { bg: 'rgba(34,197,94,0.12)',   color: 'var(--green)' },
  STR:  { bg: 'rgba(245,158,11,0.15)',  color: 'var(--yellow)' },
  STD:  { bg: 'rgba(245,158,11,0.15)',  color: 'var(--yellow)' },
  LEG:  { bg: 'rgba(100,116,139,0.15)', color: 'var(--muted)' },
};

function StratRow({ badge, strike, expiry, legs, alert }: {
  badge: string; strike: ReactNode;
  expiry: string | null | undefined; legs: any[]; alert?: boolean;
}) {
  const d        = dte(expiry);
  const dteColor = d <= 7 ? 'var(--red)' : d <= 14 ? 'var(--yellow)' : 'var(--muted)';
  const netDelta = netOf(legs, 'current_delta');
  const netTheta = netOf(legs, 'current_theta') * 100;
  const netMv    = netOf(legs, 'market_value');
  const netNlv   = netOf(legs, 'net_liq_pct');
  const { bg, color } = BADGE[badge] ?? BADGE.LEG;
  const deltaAct   = 0.42;
  const deltaWatch = 0.35;
  const rollDte    = 21;
  const shortLegs  = legs.filter(l => (l.qty ?? 0) < 0 && l.sec_type !== 'STK');
  const maxShortDelta = shortLegs.length > 0 ? Math.max(...shortLegs.map(l => Math.abs(l.current_delta ?? 0))) : null;
  const alerts: { msg: string; color: string }[] = [];
  if (maxShortDelta != null) {
    if (maxShortDelta >= deltaAct)   alerts.push({ msg: `Δ ${maxShortDelta.toFixed(3)} ≥ ${deltaAct} — act`,   color: 'var(--red)'    });
    else if (maxShortDelta >= deltaWatch) alerts.push({ msg: `Δ ${maxShortDelta.toFixed(3)} ≥ ${deltaWatch} — watch`, color: 'var(--yellow)' });
    if (d > 0 && d <= rollDte)      alerts.push({ msg: `${d}d to expiry — roll window`, color: d <= 7 ? 'var(--red)' : 'var(--yellow)' });
  }
  const absDelta = Math.abs(netDelta);
  return (
    <div style={{ borderTop: '1px solid var(--border)', background: alert ? 'rgba(239,68,68,0.03)' : undefined }}>
      <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 120px 72px 64px 80px 52px', alignItems: 'center', gap: 8, padding: '9px 16px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: bg, color, textAlign: 'center', letterSpacing: '0.04em' }}>{badge}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{strike}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {expiry ?? '—'}
          {expiry && <span style={{ color: dteColor, marginLeft: 5, fontWeight: d <= 14 ? 600 : 400 }}>{d}d</span>}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right', color: (maxShortDelta ?? absDelta) >= deltaAct ? 'var(--red)' : (maxShortDelta ?? absDelta) >= deltaWatch ? 'var(--yellow)' : netDelta > 0 ? 'var(--green)' : netDelta < 0 ? 'var(--red)' : 'var(--muted)' }}>
          {netDelta > 0 ? '+' : ''}{netDelta.toFixed(3)}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, textAlign: 'right', color: netTheta >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {netTheta >= 0 ? '+' : ''}${Math.abs(netTheta).toFixed(0)}/d
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right', color: netMv >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt$(netMv, 0)}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, textAlign: 'right', color: 'var(--muted)' }}>{netNlv > 0 ? '+' : ''}{netNlv.toFixed(1)}%</span>
      </div>
      {alerts.length > 0 && (
        <div style={{ padding: '0 16px 8px 80px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {alerts.map((a, i) => <span key={i} style={{ fontSize: 11, color: a.color, fontFamily: 'monospace' }}>⚑ {a.msg}</span>)}
        </div>
      )}
    </div>
  );
}

function TickerSection({ ticker, legs, ivr, iv }: { ticker: string; legs: any[]; ivr?: number | null; iv?: number | null }) {
  const groups     = groupTickerLegs(legs);
  const netDelta   = netOf(legs, 'current_delta');
  const netNlv     = netOf(legs, 'net_liq_pct');
  const nearestDte = Math.min(...legs.map(l => dte(l.expiry)).filter(d => d > 0).concat([Infinity]));
  const hasAlert   = legs.some(l => l.delta_state === 'critical' || l.delta_state === 'watch');
  const isStock    = legs.every(l => l.sec_type === 'STK' || l.sec_type === 'STOCK');
  return (
    <div style={{ border: `1px solid ${hasAlert ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 52 }}>{ticker}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{legs.length} leg{legs.length !== 1 ? 's' : ''}</span>
        {hasAlert && <span style={{ fontSize: 11, color: 'var(--yellow)', fontWeight: 600 }}>⚠ alert</span>}
        {nearestDte !== Infinity && (
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: nearestDte <= 7 ? 'rgba(239,68,68,0.15)' : nearestDte <= 14 ? 'rgba(245,158,11,0.12)' : 'rgba(100,116,139,0.08)', color: nearestDte <= 7 ? 'var(--red)' : nearestDte <= 14 ? 'var(--yellow)' : 'var(--muted)', fontWeight: nearestDte <= 14 ? 600 : 400 }}>{nearestDte}d</span>
        )}
        {iv != null && <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>IV {iv.toFixed(1)}%</span>}
        {ivr != null && (
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: ivr >= 50 ? 'rgba(34,197,94,0.1)' : ivr >= 25 ? 'rgba(245,158,11,0.08)' : 'rgba(100,116,139,0.08)', color: ivr >= 50 ? 'var(--green)' : ivr >= 25 ? 'var(--yellow)' : 'var(--muted)', fontWeight: 600 }}>IVR {ivr.toFixed(0)}</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 72, textAlign: 'right' }}>Δ net</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 64, textAlign: 'right' }}>Θ/day</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 80, textAlign: 'right' }}>Mkt Val</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 52, textAlign: 'right' }}>NLV%</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, minWidth: 72, textAlign: 'right', color: Math.abs(netDelta) > 0.35 ? 'var(--yellow)' : 'var(--text)' }}>
          {netDelta > 0 ? '+' : ''}{netDelta.toFixed(3)}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, minWidth: 52, textAlign: 'right', fontWeight: Math.abs(netNlv) > 50 ? 700 : 400, color: Math.abs(netNlv) > 50 ? 'var(--red)' : Math.abs(netNlv) > 20 ? 'var(--yellow)' : 'var(--muted)' }}>
          {netNlv > 0 ? '+' : ''}{netNlv.toFixed(1)}%
          {Math.abs(netNlv) > 50 && <span style={{ marginLeft: 4, fontSize: 10 }}>🔒</span>}
        </span>
      </div>
      {isStock ? (
        <div style={{ padding: '9px 16px', fontSize: 13, color: 'var(--muted)' }}>
          Stock position · {legs[0]?.qty ?? '?'} shares · {fmt$(legs[0]?.market_value, 0)}
        </div>
      ) : (
        groups.map((g, i) => {
          if (g.type === 'PMCC') return (
            <StratRow key={i} badge="PMCC"
              strike={<><span style={{ color: 'var(--green)' }}>{fmtStrike(g.leap)} LEAP</span><span style={{ color: 'var(--muted)' }}> → </span><span style={{ color: 'var(--red)' }}>{fmtStrike(g.sc)}</span></>}
              expiry={g.sc.expiry} legs={[g.leap, g.sc]} />
          );
          if (g.type === 'IC') return (
            <StratRow key={i} badge="IC"
              strike={<span style={{ color: 'var(--muted)' }}>{fmtStrike(g.lp)}/{fmtStrike(g.sp)}P · {fmtStrike(g.sc)}/{fmtStrike(g.lc)}C</span>}
              expiry={g.sc.expiry} legs={[g.sc, g.lc, g.sp, g.lp]} />
          );
          if (g.type === 'BPS') {
            const width = g.sp.strike - g.lp.strike;
            const isItm = g.sp.current_delta != null && Math.abs(g.sp.current_delta) > 0.5;
            return (
              <StratRow key={i} badge="BPS"
                strike={<><span style={{ color: 'var(--red)' }}>{fmtStrike(g.sp)}</span><span style={{ color: 'var(--muted)' }}> / {fmtStrike(g.lp)}</span>{width > 0 && <span style={{ color: 'var(--muted)', fontSize: 11 }}> ({width}w)</span>}{isItm && <span style={{ color: 'var(--red)', fontWeight: 700, marginLeft: 8, fontSize: 11 }}>⚠ ITM</span>}</>}
                expiry={g.sp.expiry} legs={[g.sp, g.lp]} alert={isItm} />
            );
          }
          if (g.type === 'STR') {
            const isStraddle = g.sc.strike === g.sp.strike;
            return (
              <StratRow key={i} badge={isStraddle ? 'STD' : 'STR'}
                strike={<><span style={{ color: 'var(--red)' }}>{fmtStrike(g.sp)}</span><span style={{ color: 'var(--muted)' }}> / </span><span style={{ color: 'var(--red)' }}>{fmtStrike(g.sc)}</span></>}
                expiry={g.sc.expiry} legs={[g.sc, g.sp]} />
            );
          }
          const leg = g.leg;
          return (
            <StratRow key={i} badge="LEG"
              strike={<><span style={{ color: leg.leg_direction === 'short' ? 'var(--red)' : 'var(--green)', fontSize: 10 }}>{leg.leg_direction === 'short' ? 'SHORT' : 'LONG'} </span><span>{fmtStrike(leg)}</span></>}
              expiry={leg.expiry} legs={[leg]} />
          );
        })
      )}
    </div>
  );
}

function PositionsTab({ positions, ivrMap, ivMap, settings }: { positions: any[]; ivrMap?: Map<string, number | null>; ivMap?: Map<string, number | null>; settings?: any }) {
  const byTicker = new Map<string, any[]>();
  for (const leg of positions) {
    const t = leg.ticker ?? '?';
    byTicker.set(t, [...(byTicker.get(t) ?? []), leg]);
  }
  const tickerGroups = [...byTicker.entries()]
    .map(([t, ls]) => ({ ticker: t, legs: ls, nlv: netOf(ls, 'net_liq_pct') }))
    .sort((a, b) => Math.abs(b.nlv) - Math.abs(a.nlv));

  const critical = tickerGroups.filter(g => g.legs.some(l => dte(l.expiry) > 0 && dte(l.expiry) <= 7));
  const warning  = tickerGroups.filter(g => !critical.includes(g) && g.legs.some(l => dte(l.expiry) > 0 && dte(l.expiry) <= 14));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {critical.length > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--red)', fontWeight: 700 }}>⚠ Expiring soon (≤7d):</span>
          {critical.map(g => {
            const d = Math.min(...g.legs.map(l => dte(l.expiry)).filter(x => x > 0));
            return <span key={g.ticker} style={{ fontFamily: 'monospace', fontSize: 12, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: 'var(--red)', fontWeight: 600 }}>{g.ticker} {d}d</span>;
          })}
        </div>
      )}
      {warning.length > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>Near expiry (≤14d):</span>
          {warning.map(g => {
            const d = Math.min(...g.legs.map(l => dte(l.expiry)).filter(x => x > 0));
            return <span key={g.ticker} style={{ fontFamily: 'monospace', fontSize: 12, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: 'var(--yellow)', fontWeight: 600 }}>{g.ticker} {d}d</span>;
          })}
        </div>
      )}
      {tickerGroups.map(g => (
        <TickerSection key={g.ticker} ticker={g.ticker} legs={g.legs} ivr={ivrMap?.get(g.ticker)} iv={ivMap?.get(g.ticker)} />
      ))}
      {settings?.config && (() => {
        const a = settings.config.alerts ?? {};
        const s = settings.config.strategy ?? {};
        const items = [
          a.delta_watch_threshold != null && `Δ watch ≥ ${a.delta_watch_threshold}`,
          a.delta_act_threshold   != null && `Δ act ≥ ${a.delta_act_threshold}`,
          s.max_concentration_pct != null && `Max name ${s.max_concentration_pct}% NL`,
          s.sector_concentration_max_pct != null && `Max sector ${s.sector_concentration_max_pct}%`,
          s.ivr_min_entry         != null && `IVR min ${s.ivr_min_entry}`,
          s.dte_roll_threshold    != null && `Roll ≤ ${s.dte_roll_threshold}d`,
        ].filter(Boolean);
        if (!items.length) return null;
        return (
          <div style={{ marginTop: 12, padding: '8px 14px', borderRadius: 6, background: 'var(--surface2)', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {items.map((item, i) => <span key={i} style={{ fontFamily: 'monospace' }}>{item as string}</span>)}
          </div>
        );
      })()}
    </div>
  );
}
