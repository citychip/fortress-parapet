import { useEffect, useState, useCallback } from 'react';
import { useSortable, SortTh } from '../components/Sortable';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { TabBar } from '../components/Tabs';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { PositionsCardList } from '../components/positions/PositionCards';
import { augmentLeg } from '../lib/positions';
import { useSettings, useThresholds } from '../lib/useSettings';
import {
  getPositions, getSectorExposure, getPortfolioBeta, getCandidates, getExDiv,
  getForwardPnl, getPnl, getPnlHistory,
  fmt$, clsN,
  type PositionData, type ForwardPnlData, type PnLData, type BetaData,
} from '../lib/api';

// Sprint 13 (#85): 6 tabs → 5. "Trade Report" removed (stop-loss → Triage,
// entry candidates → Candidates, exit candidates → Triage). "Limits" merged
// into "Risk" (was Forward P&L — same selector, same stats, one tab).
// New "Overview" tab shows the grouped strategy cards (shared with Briefing).

export default function PositionsPage() {
  const [tab, setTab]             = useState('overview');
  const [posLegs, setPosLegs]     = useState<PositionData[]>([]);
  const [sector, setSector]       = useState<any>(null);
  const [beta, setBeta]           = useState<BetaData | null>(null);
  const [ivrMap, setIvrMap]       = useState<Map<string, number | null>>(new Map());
  const [ivMap, setIvMap]         = useState<Map<string, number | null>>(new Map());
  // Sprint 15.4 — ex-div assignment risk per ticker (worst severity)
  const [exDivMap, setExDivMap]   = useState<Map<string, { severity: string; note?: string | null }>>(new Map());
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const settingsCfg = useSettings();

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const [p, s, b, c] = await Promise.allSettled([
        getPositions(), getSectorExposure(), getPortfolioBeta(), getCandidates(),
      ]);
      if (p.status === 'fulfilled') setPosLegs((p.value?.positions ?? []).map(augmentLeg));
      if (s.status === 'fulfilled') setSector(s.value);
      if (b.status === 'fulfilled') setBeta(b.value);
      if (c.status === 'fulfilled') {
        const m  = new Map<string, number | null>();
        const iv = new Map<string, number | null>();
        for (const row of (c.value?.rows ?? [])) {
          m.set(row.ticker,  row.ivr        ?? null);
          iv.set(row.ticker, row.current_iv ?? null);
        }
        setIvrMap(m); setIvMap(iv);
      }
      // Ex-div assignment risk (background; keep worst severity per ticker)
      getExDiv().then(d => {
        const em = new Map<string, { severity: string; note?: string | null }>();
        for (const r of (d?.assignment_risks ?? [])) {
          const cur = em.get(r.ticker);
          if (!cur || (cur.severity !== 'high' && r.severity === 'high')) {
            em.set(r.ticker, { severity: r.severity, note: r.note });
          }
        }
        setExDivMap(em);
      }).catch(() => {});
      setUpdatedAt(new Date().toISOString());
    } catch (e: any) {
      setError(String(e));
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(() => load(true), 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'pnl',      label: 'P&L'      },
    { key: 'exposure', label: 'Exposure' },
    { key: 'risk',     label: 'Risk'     },
    { key: 'legs',     label: 'Legs'     },
  ];

  // Tab keyboard shortcuts: 1-5 (modifier guard #91 — don't hijack Ctrl/Cmd+N)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (['INPUT','SELECT','TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= TABS.length) setTab(TABS[n - 1].key);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <Layout title="Positions" onRefresh={load} loading={loading} lastUpdated={updatedAt}>
      {loading && !posLegs.length && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={32} />
        </div>
      )}
      {error && <ErrorBanner msg={error} onRetry={load} />}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        posLegs.length
          ? <PositionsCardList positions={posLegs} ivrMap={ivrMap} ivMap={ivMap} settings={settingsCfg} exDivMap={exDivMap} />
          : !loading && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 60 }}>No open positions.</p>
      )}
      {tab === 'pnl'      && <PnlTab legs={posLegs} />}
      {tab === 'exposure' && <ExposureTab sector={sector} beta={beta} />}
      {tab === 'risk'     && <RiskTab positions={posLegs} />}
      {tab === 'legs'     && <LegsTab legs={posLegs} />}
    </Layout>
  );
}

// ── P&L Tab ───────────────────────────────────────────────────────────────────
// #82: backend /api/pnl is the source of truth; client-side leg math is kept
// only as a fallback when the endpoint fails.

function computeLegPnl(leg: any): number {
  const qty      = Number(leg.qty ?? 0);
  const avgCost  = Number(leg.avg_cost ?? 0);
  const mv       = Number(leg.market_value ?? 0);
  const costBasis = avgCost * Math.abs(qty);
  return qty < 0 ? costBasis + mv : mv - costBasis;
}

function PnlTab({ legs }: { legs: any[] }) {
  const [backend, setBackend] = useState<PnLData | null>(null);
  const [backendFailed, setBackendFailed] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    getPnl().then(setBackend).catch(() => setBackendFailed(true));
    getPnlHistory().then(d => setHistory(d?.rows ?? [])).catch(() => {});
  }, []);

  // Client fallback (cost-basis math from raw legs)
  const clientByTicker = new Map<string, { pnl: number; costBasis: number }>();
  let clientTotal = 0;
  for (const leg of legs) {
    const pnl = computeLegPnl(leg);
    const costBasis = Number(leg.avg_cost ?? 0) * Math.abs(Number(leg.qty ?? 0));
    clientTotal += pnl;
    const t = leg.ticker ?? '?';
    const e = clientByTicker.get(t) ?? { pnl: 0, costBasis: 0 };
    clientByTicker.set(t, { pnl: e.pnl + pnl, costBasis: e.costBasis + costBasis });
  }
  const totalCost = [...clientByTicker.values()].reduce((s, v) => s + v.costBasis, 0);

  // Prefer backend numbers when available
  const backendRows = (backend?.by_ticker ?? []).filter(r => r.pnl != null);
  const useBackend  = backendRows.length > 0;
  const tickerRows  = useBackend
    ? backendRows.map(r => ({ ticker: r.ticker, pnl: r.pnl as number }))
    : [...clientByTicker.entries()].map(([ticker, v]) => ({ ticker, pnl: v.pnl }));
  tickerRows.sort((a, b) => b.pnl - a.pnl);

  const totalPnl  = backend?.summary?.unrealized_pnl ?? clientTotal;
  const realized  = backend?.summary?.realized_pnl ?? null;
  const winners   = tickerRows.filter(r => r.pnl >= 0).length;
  const losers    = tickerRows.length - winners;
  const returnPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const maxAbs    = Math.max(...tickerRows.map(r => Math.abs(r.pnl)), 1);
  const best  = tickerRows[0];
  const worst = tickerRows[tickerRows.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Unrealised P&L',   value: fmt$(totalPnl),    color: clsN(totalPnl), big: true  },
          ...(realized != null ? [{ label: 'Realised', value: fmt$(realized), color: clsN(realized), big: false }] : []),
          { label: 'Return on Cost',   value: `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%`, color: clsN(returnPct), big: false },
          { label: 'Winners / Losers', value: `${winners} / ${losers}`, color: '', big: false },
          { label: 'Total Legs',       value: String(legs.length), color: '', big: false },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, minWidth: 140, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>{s.label}</div>
            <div className={`mono ${s.color}`} style={{ fontSize: s.big ? 24 : 18, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {backendFailed && (
        <p style={{ fontSize: 11, color: 'var(--yellow)' }}>⚠ /api/pnl unavailable — showing client-side estimate from legs.</p>
      )}

      {best && worst && best.ticker !== worst.ticker && (
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Best position</div>
            <span style={{ fontWeight: 700 }}>{best.ticker}</span>
            <span className="mono text-green" style={{ marginLeft: 12, fontSize: 15, fontWeight: 700 }}>{fmt$(best.pnl)}</span>
          </div>
          <div style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Worst position</div>
            <span style={{ fontWeight: 700 }}>{worst.ticker}</span>
            <span className="mono text-red" style={{ marginLeft: 12, fontSize: 15, fontWeight: 700 }}>{fmt$(worst.pnl)}</span>
          </div>
        </div>
      )}

      <Card title={`Unrealised P&L by Ticker${useBackend ? '' : ' (client estimate)'}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tickerRows.map(row => {
            const barPct = (Math.abs(row.pnl) / maxAbs) * 100;
            const isPos  = row.pnl >= 0;
            return (
              <div key={row.ticker} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 600, minWidth: 52, fontSize: 13 }}>{row.ticker}</span>
                <div style={{ flex: 1, height: 20, display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: `${barPct}%`, height: 14, borderRadius: 3, background: isPos ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)', minWidth: barPct > 0 ? 2 : 0, transition: 'width 0.3s' }} />
                </div>
                <span className={`mono ${clsN(row.pnl)}`} style={{ fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: 'right' }}>{fmt$(row.pnl)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Realised P&L History">
        {history.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>No history yet — realised P&L will appear here after closing trades.</p>
        ) : (
          <PnlHistoryChart rows={history} />
        )}
      </Card>
    </div>
  );
}

// ── P&L History Chart ─────────────────────────────────────────────────────────

function PnlHistoryChart({ rows }: { rows: any[] }) {
  const sorted = [...rows].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  if (!sorted.length) return null;
  let cum = 0;
  const pts = sorted.map(r => {
    const daily = r.realized_pnl ?? r.daily_pnl ?? 0;
    cum += daily;
    return { date: r.date ?? '', pnl: r.cumulative_pnl ?? cum, daily };
  });
  const W = 600, H = 180;
  const M = { top: 16, right: 16, bottom: 32, left: 64 };
  const iW = W - M.left - M.right, iH = H - M.top - M.bottom;
  const values = pts.map(p => p.pnl);
  const pad = Math.max(Math.abs(Math.min(...values)), Math.abs(Math.max(...values))) * 0.1 + 1;
  const yLo = Math.min(Math.min(...values) - pad, 0);
  const yHi = Math.max(Math.max(...values) + pad, 0);
  const toX = (i: number) => M.left + (i / (pts.length - 1 || 1)) * iW;
  const toY = (v: number) => M.top + (1 - (v - yLo) / (yHi - yLo)) * iH;
  const yZero = toY(0);
  const line = pts.map((p, i) => `${toX(i).toFixed(1)},${toY(p.pnl).toFixed(1)}`).join(' ');
  const area = [`${toX(0).toFixed(1)},${yZero.toFixed(1)}`, ...pts.map((p, i) => `${toX(i).toFixed(1)},${toY(p.pnl).toFixed(1)}`), `${toX(pts.length - 1).toFixed(1)},${yZero.toFixed(1)}`].join(' ');
  const fmtK = (v: number) => { const s = v >= 0 ? '+' : '-'; const a = Math.abs(v); return a < 1000 ? `${s}$${a.toFixed(0)}` : `${s}$${(a / 1000).toFixed(1)}K`; };
  const step = Math.max(1, Math.floor(pts.length / 5));
  const xTicks = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  const finalPnl = pts[pts.length - 1].pnl;
  const isPos = finalPnl >= 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200, display: 'block' }}>
      <defs>
        <clipPath id="hist-above"><rect x={M.left} y={M.top} width={iW} height={Math.max(0, yZero - M.top)} /></clipPath>
        <clipPath id="hist-below"><rect x={M.left} y={yZero} width={iW} height={Math.max(0, H - M.bottom - yZero)} /></clipPath>
      </defs>
      <rect x={M.left} y={M.top} width={iW} height={iH} fill="rgba(0,0,0,0.12)" rx={3} />
      <line x1={M.left} x2={M.left + iW} y1={yZero} y2={yZero} stroke="rgba(100,116,139,0.6)" strokeWidth={1.5} strokeDasharray="4 3" />
      <polygon points={area} fill="rgba(34,197,94,0.12)" clipPath="url(#hist-above)" />
      <polygon points={area} fill="rgba(239,68,68,0.10)" clipPath="url(#hist-below)" />
      <polyline points={line} fill="none" stroke="rgba(34,197,94,0.9)" strokeWidth={2} clipPath="url(#hist-above)" />
      <polyline points={line} fill="none" stroke="rgba(239,68,68,0.9)" strokeWidth={2} clipPath="url(#hist-below)" />
      {[0, 0.5, 1].map(t => { const v = yLo + t * (yHi - yLo); return <text key={t} x={M.left - 6} y={toY(v) + 4} textAnchor="end" fill="var(--muted)" fontSize={9}>{fmtK(v)}</text>; })}
      {xTicks.map((p, i) => <text key={i} x={toX(pts.indexOf(p))} y={H - M.bottom + 12} textAnchor="middle" fill="var(--muted)" fontSize={8}>{p.date.slice(5)}</text>)}
      <text x={M.left + iW - 4} y={toY(finalPnl) - 5} textAnchor="end" fill={isPos ? 'var(--green)' : 'var(--red)'} fontSize={10} fontWeight="700">{fmtK(finalPnl)}</text>
    </svg>
  );
}

// ── Exposure Tab ──────────────────────────────────────────────────────────────

const SECTOR_COLORS = [
  'rgba(99,102,241,0.7)',   // indigo
  'rgba(34,197,94,0.7)',    // green
  'rgba(245,158,11,0.7)',   // yellow
  'rgba(239,68,68,0.7)',    // red
  'rgba(56,189,248,0.7)',   // sky
  'rgba(167,139,250,0.7)',  // violet
  'rgba(20,184,166,0.7)',   // teal
  'rgba(251,146,60,0.7)',   // orange
];

function ExposureTab({ sector, beta }: { sector: any; beta: BetaData | null }) {
  const th = useThresholds(); // #80: β-wtd target from settings, not a constant
  const sectors: any[] = sector
    ? (Array.isArray(sector) ? sector : sector?.sectors ?? Object.entries(sector).map(([k, v]: any) => ({ sector: k, ...(typeof v === 'object' ? v : { pct: v }) })))
    : [];

  const maxPct = Math.max(...sectors.map((s: any) => Math.abs(s.pct ?? 0)), 1);

  const betas: any[] = beta?.component_betas
    ? [...beta.component_betas].sort((a: any, b: any) => Math.abs(b.delta_contribution ?? 0) - Math.abs(a.delta_contribution ?? 0))
    : [];
  const maxDelta = Math.max(...betas.map((c: any) => Math.abs(c.delta_contribution ?? 0)), 1);

  const bwd = beta?.beta_weighted_delta ?? null;
  const bwdColor = bwd == null ? 'var(--muted)' : bwd > 0 ? 'var(--green)' : 'var(--red)';
  const deltaTarget = th.betaTarget;
  const deltaOff = bwd != null ? (bwd - deltaTarget).toFixed(1) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Summary stat row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>β-Wtd Delta</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: bwdColor }}>{bwd?.toFixed(2) ?? '—'}</div>
          {deltaOff != null && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              target {deltaTarget} β-Δ · {Number(deltaOff) >= 0 ? '+' : ''}{deltaOff} off
            </div>
          )}
        </div>
        {bwd != null && (
          <div style={{ flex: 1, minWidth: 140, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Delta vs Target</div>
            <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, marginTop: 8, marginBottom: 6, position: 'relative' }}>
              <div style={{ position: 'absolute', left: `${(deltaTarget / (Math.max(Math.abs(bwd) * 1.5, 1))) * 50 + 50}%`, top: -4, bottom: -4, width: 2, background: 'var(--accent)', borderRadius: 1, opacity: 0.6 }} />
              <div style={{
                position: 'absolute',
                left: bwd >= 0 ? '50%' : `${50 + (bwd / (Math.max(Math.abs(bwd) * 1.5, 1))) * 50}%`,
                width: `${(Math.abs(bwd) / (Math.max(Math.abs(bwd) * 1.5, 1))) * 50}%`,
                height: '100%',
                background: bwdColor,
                borderRadius: 4,
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>SPY: {beta?.spy_price ? `$${beta.spy_price}` : '—'}</div>
          </div>
        )}
        {sectors.length > 0 && (
          <div style={{ flex: 2, minWidth: 240, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>Sector Mix</div>
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 1, marginBottom: 10 }}>
              {sectors.filter((s: any) => s.pct != null && s.pct > 0).map((s: any, i: number) => (
                <div key={i} style={{ flex: s.pct, background: SECTOR_COLORS[i % SECTOR_COLORS.length], minWidth: 2 }} title={`${s.sector ?? s.name}: ${s.pct?.toFixed(1)}%`} />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
              {sectors.filter((s: any) => s.pct != null && s.pct > 0).map((s: any, i: number) => (
                <span key={i} style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: SECTOR_COLORS[i % SECTOR_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
                  {s.sector ?? s.name} {s.pct?.toFixed(0)}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Sector exposure bars */}
        {sectors.length > 0 && (
          <Card title="Sector Exposure" style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sectors.map((s: any, i: number) => {
                const pct = s.pct ?? 0;
                const barWidth = Math.min(100, (Math.abs(pct) / maxPct) * 100);
                const color = SECTOR_COLORS[i % SECTOR_COLORS.length];
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{s.sector ?? s.name ?? '—'}</span>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        {s.notional != null && <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{fmt$(s.notional, 0)}</span>}
                        <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: 'var(--fg)', minWidth: 44, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${barWidth}%`, height: '100%', background: color, borderRadius: 3 }} />
                    </div>
                    {Array.isArray(s.tickers) && s.tickers.length > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{s.tickers.join(' · ')}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Beta / delta contribution */}
        {betas.length > 0 && (
          <Card title="Δ Contribution by Ticker" style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {betas.map((c: any, i: number) => {
                const delta = c.delta_contribution ?? 0;
                const barWidth = Math.min(100, (Math.abs(delta) / maxDelta) * 100);
                const isPos = delta >= 0;
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, minWidth: 44 }}>{c.ticker}</span>
                        {c.beta != null && <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>β {c.beta.toFixed(2)}</span>}
                        {c.price && <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>${c.price}</span>}
                      </div>
                      <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: isPos ? 'var(--green)' : 'var(--red)', minWidth: 48, textAlign: 'right' }}>
                        {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        width: `${barWidth}%`,
                        height: '100%',
                        background: isPos ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)',
                        borderRadius: 3,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {!sector && !beta && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 60 }}>No exposure data loaded.</p>
      )}
    </div>
  );
}

// ── Legs Tab ──────────────────────────────────────────────────────────────────

function LegsTab({ legs }: { legs: any[] }) {
  const [filter, setFilter] = useState('');
  const filtered = filter ? legs.filter(p => (p.ticker ?? '').toLowerCase().includes(filter.toLowerCase())) : legs;
  const rows = filtered.map(p => ({ ...p, _type: p.right === 'C' ? 'Call' : p.right === 'P' ? 'Put' : (p.strategy ?? ''), _dir: p.leg_direction === 'short' ? 0 : 1 }));
  const { sorted, key, dir, toggle } = useSortable(rows, 'ticker', 'asc');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          placeholder="Filter by ticker…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ fontSize: 13, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--fg)', width: 180, outline: 'none' }}
        />
        {filter && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sorted.length} of {legs.length}</span>}
        {filter && <button onClick={() => setFilter('')} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>✕ Clear</button>}
      </div>
    <Card>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr>
            <SortTh label="Ticker"  sortKey="ticker"        activeKey={key} dir={dir} onToggle={toggle} />
            <SortTh label="Dir"     sortKey="leg_direction" activeKey={key} dir={dir} onToggle={toggle} />
            <SortTh label="Type"    sortKey="_type"         activeKey={key} dir={dir} onToggle={toggle} />
            <SortTh label="Strike"  sortKey="strike"        activeKey={key} dir={dir} onToggle={toggle} align="right" />
            <SortTh label="Expiry"  sortKey="expiry"        activeKey={key} dir={dir} onToggle={toggle} />
            <SortTh label="Qty"     sortKey="qty"           activeKey={key} dir={dir} onToggle={toggle} align="right" />
            <SortTh label="Delta"   sortKey="current_delta" activeKey={key} dir={dir} onToggle={toggle} align="right" />
            <SortTh label="Mkt Val" sortKey="market_value"  activeKey={key} dir={dir} onToggle={toggle} align="right" />
            <SortTh label="NLV%"    sortKey="net_liq_pct"   activeKey={key} dir={dir} onToggle={toggle} align="right" />
            <th>Alert</th>
          </tr></thead>
          <tbody>
            {sorted.map((p: any, i: number) => {
              const isShort = p.leg_direction === 'short';
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{p.ticker}</td>
                  <td style={{ color: isShort ? 'var(--red)' : 'var(--green)', fontWeight: 600, fontSize: 12 }}>{isShort ? 'SHORT' : 'LONG'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{p._type || '—'}</td>
                  <td className="text-right mono">{p.strike != null && p.strike !== 0 ? p.strike : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.expiry ?? '—'}</td>
                  <td className="text-right mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{p.qty != null ? (p.qty > 0 ? `+${p.qty}` : p.qty) : '—'}</td>
                  <td className="text-right mono">{p.current_delta?.toFixed(3) ?? '—'}</td>
                  <td className={`text-right mono ${p.market_value != null ? clsN(p.market_value) : ''}`} style={{ fontSize: 12 }}>{p.market_value != null ? fmt$(p.market_value, 0) : '—'}</td>
                  <td className="text-right">{p.net_liq_pct != null ? `${p.net_liq_pct.toFixed(1)}%` : '—'}</td>
                  <td><AlertBadge state={p.alert_state} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
    </div>
  );
}

// ── Risk Tab (#85: Forward P&L + Limits merged) ───────────────────────────────

function interpolatePnl(curve: ForwardPnlData['curve'], price: number): number | null {
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i], b = curve[i + 1];
    if (price >= a.price && price <= b.price) {
      return a.pnl + ((price - a.price) / (b.price - a.price)) * (b.pnl - a.pnl);
    }
  }
  return null;
}

function RiskTab({ positions }: { positions: any[] }) {
  const tickers = [...new Set(positions.map((p: any) => p.ticker as string).filter(Boolean))].sort();
  const [ticker, setTicker]         = useState(tickers[0] ?? '');
  const [targetDate, setTargetDate] = useState('');
  const [ivAdj, setIvAdj]           = useState(1.0);
  const [data, setData]             = useState<ForwardPnlData | null>(null);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState<string | null>(null);

  const tickerExpiries = [...new Set(positions.filter((p: any) => p.ticker === ticker && p.expiry).map((p: any) => p.expiry as string))].sort();

  useEffect(() => {
    if (!tickerExpiries.length) return;
    setTargetDate(prev => tickerExpiries.includes(prev) ? prev : tickerExpiries[0]);
  }, [ticker, tickerExpiries.join(',')]); // eslint-disable-line

  useEffect(() => {
    if (!ticker || !targetDate) return;
    let cancelled = false;
    setLoading(true); setErr(null);
    const tickerLegs = positions.filter((p: any) => p.ticker === ticker);
    const strikes = tickerLegs.map((l: any) => l.strike).filter((s: any) => s > 0);
    const targetPrice = data?.spot ?? (strikes.length ? Math.round(strikes.reduce((a: number, b: number) => a + b, 0) / strikes.length) : 100);
    getForwardPnl(ticker, tickerLegs, targetPrice, targetDate, ivAdj)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e: any) => { if (!cancelled) { setErr(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ticker, targetDate, ivAdj]); // eslint-disable-line

  const spotPnl = data ? interpolatePnl(data.curve, data.spot) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Ticker</span>
            <select value={ticker} onChange={e => { setTicker(e.target.value); setData(null); setErr(null); }}>
              {tickers.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Expiry</span>
            <select value={targetDate} onChange={e => setTargetDate(e.target.value)}>
              {tickerExpiries.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1.0, 0.6].map(m => (
              <button key={m} onClick={() => setIvAdj(m)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', background: ivAdj === m ? 'var(--accent)' : 'transparent', color: ivAdj === m ? '#fff' : 'var(--muted)', border: `1px solid ${ivAdj === m ? 'var(--accent)' : 'var(--border)'}` }}>
                {m === 1.0 ? '1.0× Normal' : '0.6× IV Crush'}
              </button>
            ))}
          </div>
          {loading && <Spinner size={16} />}
        </div>
      </Card>

      {err && <ErrorBanner msg={err} onRetry={() => setErr(null)} />}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(() => {
              const fmtStat = (v: number) => fmt$(v, Math.abs(v) < 100 ? 2 : 0);
              return [
                { label: 'Max Profit',  value: fmtStat(data.max_profit),  cls: 'text-green' },
                { label: 'Max Loss',    value: fmtStat(data.max_loss),    cls: 'text-red'   },
                { label: 'Net Premium', value: fmtStat(data.net_premium), cls: clsN(data.net_premium) },
                { label: `P&L @ Spot (${fmt$(data.spot, 0)})`, value: spotPnl != null ? fmtStat(spotPnl) : '—', cls: clsN(spotPnl) },
              ];
            })().map((s, i) => (
              <div key={i} style={{ flex: 1, minWidth: 120, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
                <div className={`mono ${s.cls}`} style={{ fontSize: 16, fontWeight: 700 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Breakevens with % from spot (from former Limits tab) */}
          {data.breakevens.length > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {data.breakevens.map((be: number, i: number) => (
                <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 18px' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Breakeven {data.breakevens.length > 1 ? i + 1 : ''}</div>
                  <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>${be.toFixed(2)}</div>
                  {data.spot > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                      {((be - data.spot) / data.spot * 100).toFixed(1)}% from spot
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <Card title={`${data.ticker} forward P&L — expires ${data.target_date}${ivAdj < 1 ? ' (IV crush ×0.6)' : ''}`}>
            <ForwardPnlChart data={data} spotPnl={spotPnl} />
          </Card>
        </>
      )}

      {!data && !loading && !err && (
        <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>Select a ticker and date to load the risk profile.</p>
      )}
    </div>
  );
}

function ForwardPnlChart({ data, spotPnl }: { data: ForwardPnlData; spotPnl: number | null }) {
  const { curve, spot, breakevens } = data;
  if (!curve.length) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No curve data.</p>;
  const W = 600, H = 240;
  const M = { top: 20, right: 16, bottom: 38, left: 70 };
  const iW = W - M.left - M.right, iH = H - M.top - M.bottom;
  const xMin = curve[0].price, xMax = curve[curve.length - 1].price;
  const pnls = curve.map(p => p.pnl);
  const pad = Math.max(Math.abs(Math.min(...pnls)), Math.abs(Math.max(...pnls))) * 0.12;
  const yLo = Math.min(Math.min(...pnls) - pad, 0), yHi = Math.max(Math.max(...pnls) + pad, 0);
  const toX = (p: number) => M.left + ((p - xMin) / (xMax - xMin)) * iW;
  const toY = (v: number) => M.top + (1 - (v - yLo) / (yHi - yLo)) * iH;
  const yZero = toY(0);
  const line = curve.map(p => `${toX(p.price).toFixed(1)},${toY(p.pnl).toFixed(1)}`).join(' ');
  const area = [`${toX(xMin).toFixed(1)},${yZero.toFixed(1)}`, ...curve.map(p => `${toX(p.price).toFixed(1)},${toY(p.pnl).toFixed(1)}`), `${toX(xMax).toFixed(1)},${yZero.toFixed(1)}`].join(' ');
  const aboveH = Math.max(0, Math.min(yZero, H - M.bottom) - M.top);
  const belowY = Math.min(Math.max(yZero, M.top), H - M.bottom);
  const belowH = Math.max(0, H - M.bottom - belowY);
  const xTicks = [0, 0.2, 0.4, 0.6, 0.8, 1].map(t => xMin + t * (xMax - xMin));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => yLo + t * (yHi - yLo));
  const fmtK = (v: number) => { const s = v >= 0 ? '+' : '-'; const a = Math.abs(v); return a < 1000 ? `${s}$${a.toFixed(0)}` : `${s}$${(a / 1000).toFixed(1)}K`; };
  const xSpot = toX(spot);
  const ySpotPnl = spotPnl != null ? toY(spotPnl) : null;
  const inChart = (x: number) => x >= M.left && x <= M.left + iW;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 280, display: 'block' }}>
      <defs>
        <clipPath id="fpnl-above"><rect x={M.left} y={M.top} width={iW} height={aboveH} /></clipPath>
        <clipPath id="fpnl-below"><rect x={M.left} y={belowY} width={iW} height={belowH} /></clipPath>
      </defs>
      <rect x={M.left} y={M.top} width={iW} height={iH} fill="rgba(0,0,0,0.15)" rx={3} />
      {yTicks.map((v, i) => <line key={i} x1={M.left} x2={M.left + iW} y1={toY(v)} y2={toY(v)} stroke="var(--border)" strokeWidth={0.5} opacity={0.7} />)}
      <polygon points={area} fill="rgba(34,197,94,0.13)" clipPath="url(#fpnl-above)" />
      <polygon points={area} fill="rgba(239,68,68,0.11)" clipPath="url(#fpnl-below)" />
      <line x1={M.left} x2={M.left + iW} y1={yZero} y2={yZero} stroke="rgba(100,116,139,0.8)" strokeWidth={1.5} strokeDasharray="5 4" />
      {breakevens.map((be, i) => {
        const xBe = toX(be);
        if (!inChart(xBe)) return null;
        return <g key={i}><line x1={xBe} x2={xBe} y1={M.top} y2={H - M.bottom} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} /><text x={xBe} y={M.top - 5} textAnchor="middle" fill="var(--muted)" fontSize={9}>BE ${be.toFixed(0)}</text></g>;
      })}
      {inChart(xSpot) && <g><line x1={xSpot} x2={xSpot} y1={M.top} y2={H - M.bottom} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.75} /><text x={xSpot + 5} y={M.top + 11} fill="var(--accent)" fontSize={9} fontWeight="600">${spot.toFixed(0)}</text></g>}
      <polyline points={line} fill="none" stroke="rgba(34,197,94,0.9)" strokeWidth={2.5} clipPath="url(#fpnl-above)" />
      <polyline points={line} fill="none" stroke="rgba(239,68,68,0.9)" strokeWidth={2.5} clipPath="url(#fpnl-below)" />
      {inChart(xSpot) && ySpotPnl != null && <circle cx={xSpot} cy={ySpotPnl} r={4} fill="var(--accent)" />}
      <line x1={M.left} x2={M.left + iW} y1={H - M.bottom} y2={H - M.bottom} stroke="var(--border)" />
      {xTicks.map((v, i) => <g key={i}><line x1={toX(v)} x2={toX(v)} y1={H - M.bottom} y2={H - M.bottom + 3} stroke="var(--border)" /><text x={toX(v)} y={H - M.bottom + 13} textAnchor="middle" fill="var(--muted)" fontSize={9}>${v.toFixed(0)}</text></g>)}
      <line x1={M.left} x2={M.left} y1={M.top} y2={H - M.bottom} stroke="var(--border)" />
      {yTicks.map((v, i) => <g key={i}><line x1={M.left - 3} x2={M.left} y1={toY(v)} y2={toY(v)} stroke="var(--border)" /><text x={M.left - 7} y={toY(v) + 4} textAnchor="end" fill="var(--muted)" fontSize={9}>{fmtK(v)}</text></g>)}
    </svg>
  );
}

function AlertBadge({ state }: { state?: string }) {
  const color = state === 'safe' ? 'var(--green)' : state === 'act' ? 'var(--red)' : 'var(--yellow)';
  const bg    = state === 'safe' ? 'rgba(34,197,94,0.1)' : state === 'act' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)';
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: bg, color, fontWeight: 600, textTransform: 'uppercase' }}>
      {state ?? '—'}
    </span>
  );
}
