import { useEffect, useState, useCallback, type ReactNode } from 'react';
import Layout from '../components/Layout';
import StatRow from '../components/StatRow';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { TabBar } from '../components/Tabs';
import { useSortable, SortTh } from '../components/Sortable';
import { UniverseSection } from '../components/system/UniverseSection';
import {
  getBriefing, getIbkrStatus, getAlerts, getPositions, getCandidates,
  getMarketIntel, getCalendar, fetchEarnings, getUniverse,
  fmt$,
  type BriefingData, type IbkrStatusData, type AlertData,
} from '../lib/api';

export default function OverviewPage() {
  const [tab, setTab] = useState('positions');

  // ── Core data (loaded on mount, 30s poll) ─────────────────────────────────
  const [briefing,   setBriefing]   = useState<BriefingData | null>(null);
  const [ibkr,       setIbkr]       = useState<IbkrStatusData | null>(null);
  const [alerts,     setAlerts]     = useState<AlertData[]>([]);
  const [positions,  setPositions]  = useState<any[]>([]);   // augmented legs
  const [ivrMap,     setIvrMap]     = useState<Map<string, number | null>>(new Map());
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [updatedAt,  setUpdatedAt]  = useState<string | null>(null);

  // ── Market intel (lazy) ────────────────────────────────────────────────────
  const [intel,       setIntel]        = useState<any>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelLoaded,  setIntelLoaded]  = useState(false);

  // ── Earnings calendar (lazy) ───────────────────────────────────────────────
  const [cal,       setCal]       = useState<any>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calLoaded,  setCalLoaded]  = useState(false);
  const [fetching,   setFetching]   = useState(false);

  // ── Universe (lazy) ────────────────────────────────────────────────────────
  const [universe,       setUniverse]       = useState<any>(null);
  const [universeLoading, setUniverseLoading] = useState(false);
  const [universeLoaded,  setUniverseLoaded]  = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const [b, i, a, p, c] = await Promise.allSettled([
        getBriefing(), getIbkrStatus(), getAlerts(), getPositions(), getCandidates(),
      ]);
      if (b.status === 'fulfilled') setBriefing(b.value);
      if (i.status === 'fulfilled') setIbkr(i.value);
      if (a.status === 'fulfilled') setAlerts(a.value?.alerts ?? []);
      if (p.status === 'fulfilled') setPositions((p.value?.positions ?? []).map(augmentLeg));
      if (c.status === 'fulfilled') {
        const m = new Map<string, number | null>();
        for (const row of (c.value?.rows ?? [])) m.set(row.ticker, row.ivr ?? null);
        setIvrMap(m);
      }
      if (b.status === 'rejected')  setError(String(b.reason));
      setUpdatedAt(new Date().toISOString());
    } catch (e: any) {
      setError(String(e));
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  const loadMarket = useCallback(async () => {
    setIntelLoading(true);
    try {
      const data = await getMarketIntel();
      setIntel(data); setIntelLoaded(true);
    } catch (e: any) { setError(String(e)); }
    finally { setIntelLoading(false); }
  }, []);

  const loadEarnings = useCallback(async () => {
    setCalLoading(true);
    try {
      const data = await getCalendar();
      setCal(data); setCalLoaded(true);
    } catch (e: any) { setError(String(e)); }
    finally { setCalLoading(false); }
  }, []);

  const loadUniverse = useCallback(async () => {
    setUniverseLoading(true);
    try {
      const data = await getUniverse();
      setUniverse(data); setUniverseLoaded(true);
    } catch (e: any) { setError(String(e)); }
    finally { setUniverseLoading(false); }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // 30s poll for core data only
  useEffect(() => {
    const id = setInterval(() => loadDashboard(true), 30_000);
    return () => clearInterval(id);
  }, [loadDashboard]);

  // Lazy-load on first tab activation
  useEffect(() => {
    if (tab === 'market'   && !intelLoaded   && !intelLoading)   loadMarket();
    if (tab === 'earnings' && !calLoaded     && !calLoading)     loadEarnings();
    if (tab === 'universe' && !universeLoaded && !universeLoading) loadUniverse();
  }, [tab, intelLoaded, intelLoading, calLoaded, calLoading, universeLoaded, universeLoading, loadMarket, loadEarnings, loadUniverse]);

  const handleRefresh = useCallback(() => {
    if (tab === 'positions') loadDashboard();
    else if (tab === 'market')   loadMarket();
    else if (tab === 'earnings') loadEarnings();
    else if (tab === 'universe') loadUniverse();
  }, [tab, loadDashboard, loadMarket, loadEarnings, loadUniverse]);

  // ── Derived values for always-visible header ───────────────────────────────

  const nlv        = briefing?.account?.net_liq;
  const avail      = briefing?.account?.available_funds;
  const excessLiq  = briefing?.account?.excess_liq;
  const vix        = briefing?.macro_regime?.vix;
  const regime     = briefing?.macro_regime?.regime ?? '—';
  const pacingObj  = briefing?.pacing;
  const pacing     = pacingObj ? `${pacingObj.used ?? 0}/${pacingObj.max_per_week ?? 5}` : '—';
  const totalDelta = briefing?.greeks?.portfolio_delta ?? 0;
  const theta      = briefing?.greeks?.portfolio_theta;
  const vega       = briefing?.greeks?.portfolio_vega;
  const msftWarn   = briefing?.concentration?.msft_warning;

  const staleMinutes = briefing?.staleness?.hours != null ? briefing.staleness.hours * 60 : null;
  const limitedMode  = staleMinutes != null && staleMinutes > 5 && isMarketHours();

  const activeActions = (briefing?.actions ?? []).filter((a: any) => a.ticker || a.action || a.message);

  const deltaColor = Math.abs(totalDelta) > 1000 ? 'var(--yellow)' :
                     totalDelta >= 0 ? 'var(--green)' : 'var(--red)';
  const vixColor   = !vix ? undefined : vix > 30 ? 'var(--red)' : vix > 20 ? 'var(--yellow)' : 'var(--green)';

  const TABS = [
    { key: 'positions', label: 'Positions' },
    { key: 'market',    label: 'Market' },
    { key: 'earnings',  label: 'Earnings' },
    { key: 'universe',  label: 'Universe' },
  ];

  return (
    <Layout title="Overview" onRefresh={handleRefresh} loading={loading} lastUpdated={updatedAt}>

      {error && <ErrorBanner msg={error} onRetry={handleRefresh} />}

      {/* ── Always-visible: stat bar + critical banners ─────────────────────── */}
      {briefing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>

          <StatRow stats={[
            { label: 'Net Liq',    value: fmt$(nlv),    color: 'var(--text)' },
            { label: 'Available',  value: fmt$(avail),  color: briefing?.account?.thresholds?.available_funds_ok === false ? 'var(--red)' : 'var(--muted)' },
            { label: 'Excess Liq', value: fmt$(excessLiq), color: briefing?.account?.thresholds?.excess_liq_ok === false ? 'var(--red)' : 'var(--muted)' },
            { label: 'Δ port',     value: totalDelta != null ? (totalDelta > 0 ? '+' : '') + Math.round(totalDelta) : '—', color: deltaColor, mono: true },
            { label: 'Θ/day',      value: theta != null ? `+$${Math.abs(theta).toFixed(0)}` : '—', color: 'var(--green)', mono: true },
            { label: 'Vega',       value: vega != null ? Math.round(Math.abs(vega)).toString() : '—', color: 'var(--muted)', mono: true },
            { label: 'VIX',        value: vix?.toFixed(2) ?? '—', color: vixColor },
            { label: 'Regime',     value: String(regime).toUpperCase(), color: 'var(--muted)' },
            { label: 'Pacing',     value: String(pacing) },
          ]} />

          {limitedMode && (
            <div style={{
              padding: '10px 16px', borderRadius: 8,
              background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.35)',
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
            }}>
              <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>⚠ LIMITED MODE</span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                — IBKR data is {Math.round(staleMinutes!)}m old · positions and greeks may not reflect current market
              </span>
            </div>
          )}

          {msftWarn && (
            <div style={{
              padding: '10px 16px', borderRadius: 8,
              background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.3)',
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
            }}>
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>🔒 MSFT concentration {briefing?.concentration?.all?.['MSFT']?.toFixed(0)}% of NLV</span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>— new entries locked until below 30%</span>
            </div>
          )}

          {activeActions.length > 0 && (
            <Card title={`Priority Actions (${activeActions.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeActions.map((a: any, i: number) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px', borderRadius: 6, background: 'var(--surface2)',
                    borderLeft: `3px solid ${a.urgency === 'critical' ? 'var(--red)' : 'var(--yellow)'}`,
                  }}>
                    {a.ticker && <span style={{ fontWeight: 700, fontSize: 13, minWidth: 60 }}>{a.ticker}</span>}
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>
                      {a.action ?? a.type ?? a.message ?? JSON.stringify(a)}
                    </span>
                    {a.urgency && (
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                        color: a.urgency === 'critical' ? 'var(--red)' : 'var(--yellow)' }}>
                        {a.urgency}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* ── POSITIONS ───────────────────────────────────────────────────────── */}
      {tab === 'positions' && (
        <>
          {loading && !positions.length && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <Spinner size={32} />
            </div>
          )}
          <PositionsTab positions={positions} ivrMap={ivrMap} />
        </>
      )}

      {/* ── MARKET ──────────────────────────────────────────────────────────── */}
      {tab === 'market' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {intelLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={32} /></div>}
          {!intelLoading && !intel && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Failed to load market data.</p>}
          {intel && (
            <>
              {intel.regime?.score != null && (
                <div style={{
                  padding: '12px 16px', borderRadius: 8,
                  background: intel.regime.score > 0 ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)',
                  border: `1px solid ${intel.regime.score > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: intel.regime.score > 0 ? 'var(--green)' : 'var(--red)' }}>
                    {intel.regime.score > 0 ? '✓ ENTRIES OPEN' : '✕ ENTRIES BLOCKED'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    score: {intel.regime.score > 0 ? '+' : ''}{intel.regime.score}
                    {intel.regime.overall ? ` · ${intel.regime.overall}` : ''}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {intel.current_price && <KV label="SPY"          value={`$${intel.current_price}`} />}
                {intel.dp_floor      && <KV label="DP Floor"      value={`$${intel.dp_floor}`} />}
                {intel.gex_call_wall && <KV label="GEX Call Wall" value={`$${intel.gex_call_wall}`} />}
                {intel.gex_put_wall  && <KV label="GEX Put Wall"  value={`$${intel.gex_put_wall}`} />}
                {intel.flip_level    && <KV label="Flip Level"    value={`$${intel.flip_level}`} />}
              </div>
              {Array.isArray(intel.regime?.signals) && intel.regime.signals.length > 0 && (
                <Card title="Regime Signals">
                  {intel.regime.signals.map((s: any, i: number) => (
                    <div key={i} style={{
                      padding: '10px 12px', marginBottom: 8, borderRadius: 6, background: 'var(--surface2)',
                      borderLeft: `3px solid ${(s.weight ?? 0) > 0 ? 'var(--green)' : (s.weight ?? 0) < 0 ? 'var(--red)' : 'var(--border2)'}`,
                    }}>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 4, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: 12 }}>{s.source}</span>
                        <span style={{
                          fontSize: 11, padding: '1px 6px', borderRadius: 3,
                          background: (s.weight ?? 0) > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                          color: (s.weight ?? 0) > 0 ? 'var(--green)' : 'var(--red)',
                        }}>{s.signal}</span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--muted)' }}>{s.note}</p>
                    </div>
                  ))}
                </Card>
              )}
              {(() => {
                const skip = new Set(['as_of','ticker','session_date','current_price','regime','dp_floor','gex_call_wall','gex_put_wall','flip_level','gamma_regime']);
                const rest = Object.entries(intel).filter(([k, v]) => !skip.has(k) && v != null && typeof v !== 'object');
                if (!rest.length) return null;
                return (
                  <Card title="Additional Data">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 10 }}>
                      {rest.map(([k, v]: any, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{k.replace(/_/g,' ')}</span>
                          <span className="mono" style={{ fontSize: 13 }}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ── EARNINGS ────────────────────────────────────────────────────────── */}
      {tab === 'earnings' && (
        <Card title="Earnings Calendar" action={
          <button
            onClick={async () => {
              setFetching(true);
              try { await fetchEarnings(); const c = await getCalendar(); setCal(c); }
              catch (e: any) { setError(String(e)); }
              finally { setFetching(false); }
            }}
            disabled={fetching}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--muted)', fontSize: 11, padding: '3px 10px' }}
          >{fetching ? '…' : '↻ Fetch'}</button>
        }>
          {calLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={24} /></div>}
          {!calLoading && !cal && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No calendar data. Hit Fetch to load.</p>}
          {cal && <EarningsTable cal={cal} />}
        </Card>
      )}

      {/* ── UNIVERSE ────────────────────────────────────────────────────────── */}
      {tab === 'universe' && (
        <>
          {universeLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={32} /></div>}
          {universeLoaded && (
            <UniverseSection universe={universe} onRefresh={loadUniverse} />
          )}
        </>
      )}

    </Layout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Position helpers (canonical home — also used by OverviewPage Positions tab)
// ─────────────────────────────────────────────────────────────────────────────

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

// ── Strategy grouping ─────────────────────────────────────────────────────────

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

  // 1. Iron Condor
  for (const shortCall of [...sc]) {
    if (!free(shortCall)) continue;
    for (const shortPut of sp.filter(free)) {
      const longCall = lc.filter(free).find(l => l.strike > shortCall.strike);
      const longPut  = lp.filter(free).find(l => l.strike < shortPut.strike);
      if (longCall && longPut) {
        take(shortCall, shortPut, longCall, longPut);
        result.push({ type: 'IC', sc: shortCall, lc: longCall, sp: shortPut, lp: longPut });
        break;
      }
    }
  }

  // 2. PMCC: long LEAP call (DTE > 90) + short call (higher strike)
  for (const leap of lc.filter(free).filter(l => dte(l.expiry) > 90 && (l.strike ?? 0) > 0)) {
    const shortCall = sc.filter(free).find(s => (s.strike ?? 0) > (leap.strike ?? 0));
    if (shortCall) { take(leap, shortCall); result.push({ type: 'PMCC', leap, sc: shortCall }); }
  }

  // 3. Put spreads
  for (const shortPut of sp.filter(free)) {
    const longPut = lp.filter(free).find(l => l.strike < shortPut.strike);
    if (longPut) { take(shortPut, longPut); result.push({ type: 'BPS', sp: shortPut, lp: longPut }); }
  }

  // 4. Strangles
  for (const shortCall of sc.filter(free)) {
    if (!shortCall.expiry) continue;
    const shortPut = sp.filter(free).find(l => l.expiry && l.expiry === shortCall.expiry);
    if (shortPut) { take(shortCall, shortPut); result.push({ type: 'STR', sc: shortCall, sp: shortPut }); }
  }

  // 5. Remaining unpaired legs
  for (const leg of legs.filter(free)) result.push({ type: 'LEG', leg });

  return result;
}

// ── Badge styles ──────────────────────────────────────────────────────────────

const BADGE: Record<string, { bg: string; color: string }> = {
  PMCC: { bg: 'rgba(99,102,241,0.15)',  color: 'var(--accent)' },
  IC:   { bg: 'rgba(59,130,246,0.15)',  color: 'var(--blue)' },
  BPS:  { bg: 'rgba(34,197,94,0.12)',   color: 'var(--green)' },
  STR:  { bg: 'rgba(245,158,11,0.15)',  color: 'var(--yellow)' },
  STD:  { bg: 'rgba(245,158,11,0.15)',  color: 'var(--yellow)' },
  LEG:  { bg: 'rgba(100,116,139,0.15)', color: 'var(--muted)' },
};

// ── Strategy row ──────────────────────────────────────────────────────────────

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
  const deltaWarn = Math.abs(netDelta) > 0.35;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '52px 1fr 120px 72px 64px 80px 52px',
      alignItems: 'center', gap: 8, padding: '9px 16px',
      borderTop: '1px solid var(--border)',
      background: alert ? 'rgba(239,68,68,0.03)' : undefined,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: bg, color, textAlign: 'center', letterSpacing: '0.04em' }}>{badge}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{strike}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
        {expiry ?? '—'}
        {expiry && <span style={{ color: dteColor, marginLeft: 5, fontWeight: d <= 14 ? 600 : 400 }}>{d}d</span>}
      </span>
      <span style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right', color: deltaWarn ? 'var(--yellow)' : netDelta > 0 ? 'var(--green)' : netDelta < 0 ? 'var(--red)' : 'var(--muted)' }}>
        {netDelta > 0 ? '+' : ''}{netDelta.toFixed(3)}
      </span>
      <span style={{ fontFamily: 'monospace', fontSize: 11, textAlign: 'right', color: netTheta >= 0 ? 'var(--green)' : 'var(--red)' }}>
        {netTheta >= 0 ? '+' : ''}${Math.abs(netTheta).toFixed(0)}/d
      </span>
      <span style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right', color: netMv >= 0 ? 'var(--green)' : 'var(--red)' }}>
        {fmt$(netMv, 0)}
      </span>
      <span style={{ fontFamily: 'monospace', fontSize: 11, textAlign: 'right', color: 'var(--muted)' }}>
        {netNlv > 0 ? '+' : ''}{netNlv.toFixed(1)}%
      </span>
    </div>
  );
}

// ── Ticker section ────────────────────────────────────────────────────────────

function TickerSection({ ticker, legs, ivr }: { ticker: string; legs: any[]; ivr?: number | null }) {
  const groups     = groupTickerLegs(legs);
  const netDelta   = netOf(legs, 'current_delta');
  const netNlv     = netOf(legs, 'net_liq_pct');
  const nearestDte = Math.min(...legs.map(l => dte(l.expiry)).filter(d => d > 0).concat([Infinity]));
  const hasAlert   = legs.some(l => l.delta_state === 'critical' || l.delta_state === 'watch');
  const isStock    = legs.every(l => l.sec_type === 'STK' || l.sec_type === 'STOCK');

  return (
    <div style={{
      border: `1px solid ${hasAlert ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 52 }}>{ticker}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{legs.length} leg{legs.length !== 1 ? 's' : ''}</span>
        {hasAlert && <span style={{ fontSize: 11, color: 'var(--yellow)', fontWeight: 600 }}>⚠ alert</span>}
        {nearestDte !== Infinity && (
          <span style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 10,
            background: nearestDte <= 7 ? 'rgba(239,68,68,0.15)' : nearestDte <= 14 ? 'rgba(245,158,11,0.12)' : 'rgba(100,116,139,0.08)',
            color: nearestDte <= 7 ? 'var(--red)' : nearestDte <= 14 ? 'var(--yellow)' : 'var(--muted)',
            fontWeight: nearestDte <= 14 ? 600 : 400,
          }}>{nearestDte}d</span>
        )}
        {ivr != null && (
          <span style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 10,
            background: ivr >= 50 ? 'rgba(34,197,94,0.1)' : ivr >= 25 ? 'rgba(245,158,11,0.08)' : 'rgba(100,116,139,0.08)',
            color: ivr >= 50 ? 'var(--green)' : ivr >= 25 ? 'var(--yellow)' : 'var(--muted)',
            fontWeight: 600,
          }}>IVR {ivr.toFixed(0)}</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 72, textAlign: 'right' }}>Δ net</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 64, textAlign: 'right' }}>Θ/day</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 80, textAlign: 'right' }}>Mkt Val</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 52, textAlign: 'right' }}>NLV%</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, minWidth: 72, textAlign: 'right',
          color: Math.abs(netDelta) > 0.35 ? 'var(--yellow)' : 'var(--text)' }}>
          {netDelta > 0 ? '+' : ''}{netDelta.toFixed(3)}
        </span>
        <span style={{
          fontFamily: 'monospace', fontSize: 12, minWidth: 52, textAlign: 'right',
          fontWeight: Math.abs(netNlv) > 50 ? 700 : 400,
          color: Math.abs(netNlv) > 50 ? 'var(--red)' : Math.abs(netNlv) > 20 ? 'var(--yellow)' : 'var(--muted)',
        }}>
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
          if (g.type === 'PMCC') {
            return (
              <StratRow key={i} badge="PMCC"
                strike={<><span style={{ color: 'var(--green)' }}>{fmtStrike(g.leap)} LEAP</span><span style={{ color: 'var(--muted)' }}> → </span><span style={{ color: 'var(--red)' }}>{fmtStrike(g.sc)}</span></>}
                expiry={g.sc.expiry} legs={[g.leap, g.sc]} />
            );
          }
          if (g.type === 'IC') {
            return (
              <StratRow key={i} badge="IC"
                strike={<span style={{ color: 'var(--muted)' }}>{fmtStrike(g.lp)}/{fmtStrike(g.sp)}P · {fmtStrike(g.sc)}/{fmtStrike(g.lc)}C</span>}
                expiry={g.sc.expiry} legs={[g.sc, g.lc, g.sp, g.lp]} />
            );
          }
          if (g.type === 'BPS') {
            const width = g.sp.strike - g.lp.strike;
            const isItm = g.sp.current_delta != null && Math.abs(g.sp.current_delta) > 0.5;
            return (
              <StratRow key={i} badge="BPS"
                strike={<>
                  <span style={{ color: 'var(--red)' }}>{fmtStrike(g.sp)}</span>
                  <span style={{ color: 'var(--muted)' }}> / {fmtStrike(g.lp)}</span>
                  {width > 0 && <span style={{ color: 'var(--muted)', fontSize: 11 }}> ({width}w)</span>}
                  {isItm && <span style={{ color: 'var(--red)', fontWeight: 700, marginLeft: 8, fontSize: 11 }}>⚠ ITM</span>}
                </>}
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

// ── Positions tab ─────────────────────────────────────────────────────────────

function PositionsTab({ positions, ivrMap }: { positions: any[]; ivrMap?: Map<string, number | null> }) {
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
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap',
        }}>
          <span style={{ color: 'var(--red)', fontWeight: 700 }}>⚠ Expiring soon (≤7d):</span>
          {critical.map(g => {
            const d = Math.min(...g.legs.map(l => dte(l.expiry)).filter(x => x > 0));
            return <span key={g.ticker} style={{ fontFamily: 'monospace', fontSize: 12, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: 'var(--red)', fontWeight: 600 }}>{g.ticker} {d}d</span>;
          })}
        </div>
      )}
      {warning.length > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap',
        }}>
          <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>Near expiry (≤14d):</span>
          {warning.map(g => {
            const d = Math.min(...g.legs.map(l => dte(l.expiry)).filter(x => x > 0));
            return <span key={g.ticker} style={{ fontFamily: 'monospace', fontSize: 12, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: 'var(--yellow)', fontWeight: 600 }}>{g.ticker} {d}d</span>;
          })}
        </div>
      )}
      {tickerGroups.map(g => (
        <TickerSection key={g.ticker} ticker={g.ticker} legs={g.legs} ivr={ivrMap?.get(g.ticker)} />
      ))}
    </div>
  );
}

// ── Earnings table ────────────────────────────────────────────────────────────

function EarningsTable({ cal }: { cal: any }) {
  const rawRows = Object.entries(cal?.tickers ?? {}).map(([ticker, e]: any) => ({
    ticker,
    next_earnings:    e.next_earnings    ?? null,
    days_to_earnings: e.days_to_earnings ?? null,
    status:           e.status           ?? null,
    notes:            e.notes            ?? null,
  }));
  const { sorted, key, dir, toggle } = useSortable(rawRows, 'days_to_earnings', 'asc');
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead><tr>
          <SortTh label="Ticker"        sortKey="ticker"           activeKey={key} dir={dir} onToggle={toggle} />
          <SortTh label="Next Earnings" sortKey="next_earnings"    activeKey={key} dir={dir} onToggle={toggle} />
          <SortTh label="DTE"           sortKey="days_to_earnings" activeKey={key} dir={dir} onToggle={toggle} align="right" />
          <SortTh label="Status"        sortKey="status"           activeKey={key} dir={dir} onToggle={toggle} />
          <th>Notes</th>
        </tr></thead>
        <tbody>
          {sorted.map((e, i) => {
            const sc = e.status === 'blackout' ? 'var(--red)' : e.status === 'warning' ? 'var(--yellow)' : 'var(--green)';
            const bg = e.status === 'blackout' ? 'rgba(239,68,68,0.1)' : e.status === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)';
            return (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{e.ticker}</td>
                <td className="mono">{e.next_earnings ?? '—'}</td>
                <td className="text-right mono" style={{ color: (e.days_to_earnings ?? 99) < 14 ? 'var(--yellow)' : 'var(--muted)' }}>
                  {e.days_to_earnings != null ? `${e.days_to_earnings}d` : '—'}
                </td>
                <td>{e.status && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: bg, color: sc, fontWeight: 600, textTransform: 'uppercase' }}>{e.status}</span>}</td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{e.notes ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── KV chip ───────────────────────────────────────────────────────────────────

function KV({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 20px', minWidth: 120 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--text)', fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}

// ── Market hours check ────────────────────────────────────────────────────────

function isMarketHours(): boolean {
  const et   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = et.getDay();
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}
