import { useEffect, useState, useCallback } from 'react';
import { useSortable, SortTh } from '../components/Sortable';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { TabBar } from '../components/Tabs';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import {
  getPositions, getSectorExposure, getPortfolioBeta,
  getForwardPnl, getPnlHistory, getRollAll, getStopLossAll,
  fmt$, clsN,
  type PositionData, type ForwardPnlData,
} from '../lib/api';

export default function PortfolioPage() {
  const [tab, setTab]             = useState('pnl');
  const [posLegs, setPosLegs]     = useState<PositionData[]>([]);
  const [sector, setSector]       = useState<any>(null);
  const [beta, setBeta]           = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        getPositions(), getSectorExposure(), getPortfolioBeta(),
      ]);
      if (results[0].status === 'fulfilled') {
        setPosLegs((results[0].value?.positions ?? []).map(augmentLeg));
      }
      if (results[1].status === 'fulfilled') setSector(results[1].value);
      if (results[2].status === 'fulfilled') setBeta(results[2].value);
      setUpdatedAt(new Date().toISOString());
    } catch (e: any) {
      setError(String(e));
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(() => load(true), 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  const TABS = [
    { key: 'pnl',        label: 'P&L' },
    { key: 'triage',     label: 'Triage' },
    { key: 'exposure',   label: 'Exposure' },
    { key: 'forwardpnl', label: 'Forward P&L' },
    { key: 'legs',       label: 'Legs' },
  ];

  return (
    <Layout title="Portfolio" onRefresh={load} loading={loading} lastUpdated={updatedAt}>
      {loading && !posLegs.length && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={32} />
        </div>
      )}
      {error && <ErrorBanner msg={error} onRetry={load} />}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* P&L TAB */}
      {tab === 'pnl' && <PnlTab legs={posLegs} />}

      {/* TRIAGE TAB */}
      {tab === 'triage' && <TriageTab />}

      {/* LEGS TAB */}
      {tab === 'legs' && <LegsTab legs={posLegs} />}

      {/* EXPOSURE TAB */}
      {tab === 'exposure' && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {sector && (
            <Card title="Sector Exposure" style={{ flex: 1, minWidth: 280 }}>
              <table>
                <thead><tr>
                  <th>Sector</th>
                  <th className="text-right">Notional</th>
                  <th className="text-right">Pct</th>
                  <th>Tickers</th>
                </tr></thead>
                <tbody>
                  {(Array.isArray(sector) ? sector : sector?.sectors ?? Object.entries(sector).map(([k,v]:any)=>({sector:k,...(typeof v==='object'?v:{pct:v})}))).map((s: any, i: number) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{s.sector ?? s.name ?? '—'}</td>
                      <td className="text-right mono">{s.notional != null ? fmt$(s.notional, 0) : '—'}</td>
                      <td className="text-right mono">{s.pct != null ? `${s.pct.toFixed(1)}%` : '—'}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{Array.isArray(s.tickers) ? s.tickers.join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {beta && (
            <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Summary */}
              <div style={{ display: 'flex', gap: 12 }}>
                {[
                  { label: 'β-Wtd Delta', value: beta.beta_weighted_delta?.toFixed(1) ?? '—' },
                  { label: 'SPY Price',   value: beta.spy_price ? `$${beta.spy_price}` : '—' },
                ].map((s, i) => (
                  <div key={i} style={{
                    flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '12px 16px',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>{s.label}</div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {/* Component betas */}
              {beta.component_betas?.length > 0 && (
                <Card title="Beta by Ticker">
                  <table>
                    <thead><tr>
                      <th>Ticker</th>
                      <th className="text-right">Beta</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">Δ Contribution</th>
                    </tr></thead>
                    <tbody>
                      {beta.component_betas
                        .sort((a: any, b: any) => Math.abs(b.delta_contribution ?? 0) - Math.abs(a.delta_contribution ?? 0))
                        .map((c: any, i: number) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{c.ticker}</td>
                            <td className="text-right mono">{c.beta?.toFixed(3) ?? '—'}</td>
                            <td className="text-right mono">{c.price ? `$${c.price}` : '—'}</td>
                            <td className={`text-right mono ${(c.delta_contribution ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                              {c.delta_contribution?.toFixed(2) ?? '—'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* FORWARD P&L TAB */}
      {tab === 'forwardpnl' && <ForwardPnlTab positions={posLegs} />}

    </Layout>
  );
}

// ── P&L Tab — client-side computation ────────────────────────────────────────

function computeLegPnl(leg: any): number {
  const qty = Number(leg.qty ?? 0);
  const avgCost = Number(leg.avg_cost ?? 0);
  const mv = Number(leg.market_value ?? 0);
  const costBasis = avgCost * Math.abs(qty);
  return qty < 0 ? costBasis + mv : mv - costBasis;
}

function LegsTab({ legs }: { legs: any[] }) {
  const rows = legs.map(p => ({
    ...p,
    _type: p.right === 'C' ? 'Call' : p.right === 'P' ? 'Put' : (p.strategy ?? ''),
    _dir: p.leg_direction === 'short' ? 0 : 1, // for sort: 0=short first
  }));
  const { sorted, key, dir, toggle } = useSortable(rows, 'ticker', 'asc');

  return (
    <Card>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr>
            <SortTh label="Ticker"   sortKey="ticker"         activeKey={key} dir={dir} onToggle={toggle} />
            <SortTh label="Dir"      sortKey="leg_direction"  activeKey={key} dir={dir} onToggle={toggle} />
            <SortTh label="Type"     sortKey="_type"          activeKey={key} dir={dir} onToggle={toggle} />
            <SortTh label="Strike"   sortKey="strike"         activeKey={key} dir={dir} onToggle={toggle} align="right" />
            <SortTh label="Expiry"   sortKey="expiry"         activeKey={key} dir={dir} onToggle={toggle} />
            <SortTh label="Qty"      sortKey="qty"            activeKey={key} dir={dir} onToggle={toggle} align="right" />
            <SortTh label="Delta"    sortKey="current_delta"  activeKey={key} dir={dir} onToggle={toggle} align="right" />
            <SortTh label="Mkt Val"  sortKey="market_value"   activeKey={key} dir={dir} onToggle={toggle} align="right" />
            <SortTh label="NLV%"     sortKey="net_liq_pct"    activeKey={key} dir={dir} onToggle={toggle} align="right" />
            <th>Alert</th>
          </tr></thead>
          <tbody>
            {sorted.map((p: any, i: number) => {
              const isShort = p.leg_direction === 'short';
              const dirColor = isShort ? 'var(--red)' : 'var(--green)';
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{p.ticker}</td>
                  <td style={{ color: dirColor, fontWeight: 600, fontSize: 12 }}>{isShort ? 'SHORT' : 'LONG'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{p._type || '—'}</td>
                  <td className="text-right mono">{p.strike != null && p.strike !== 0 ? p.strike : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.expiry ?? '—'}</td>
                  <td className="text-right mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {p.qty != null ? (p.qty > 0 ? `+${p.qty}` : p.qty) : '—'}
                  </td>
                  <td className="text-right mono">{p.current_delta?.toFixed(3) ?? '—'}</td>
                  <td className={`text-right mono ${p.market_value != null ? clsN(p.market_value) : ''}`} style={{ fontSize: 12 }}>
                    {p.market_value != null ? fmt$(p.market_value, 0) : '—'}
                  </td>
                  <td className="text-right">{p.net_liq_pct != null ? `${p.net_liq_pct.toFixed(1)}%` : '—'}</td>
                  <td><AlertBadge state={p.alert_state} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PnlTab({ legs }: { legs: any[] }) {
  const [history, setHistory] = useState<any[]>([]);
  useEffect(() => {
    getPnlHistory()
      .then(d => setHistory(d?.rows ?? []))
      .catch(() => {});
  }, []);

  // Compute per-leg and aggregate by ticker
  const byTicker = new Map<string, { pnl: number; costBasis: number; legs: number }>();
  let totalPnl = 0;
  let winners = 0; let losers = 0;

  for (const leg of legs) {
    const pnl = computeLegPnl(leg);
    const qty = Number(leg.qty ?? 0);
    const avgCost = Number(leg.avg_cost ?? 0);
    const costBasis = avgCost * Math.abs(qty);
    totalPnl += pnl;
    if (pnl >= 0) winners++; else losers++;
    const t = leg.ticker ?? '?';
    const existing = byTicker.get(t) ?? { pnl: 0, costBasis: 0, legs: 0 };
    byTicker.set(t, { pnl: existing.pnl + pnl, costBasis: existing.costBasis + costBasis, legs: existing.legs + 1 });
  }

  const totalCost = [...byTicker.values()].reduce((s, v) => s + v.costBasis, 0);
  const returnPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const tickerRows = [...byTicker.entries()]
    .map(([ticker, v]) => ({ ticker, ...v }))
    .sort((a, b) => b.pnl - a.pnl);

  const maxAbs = Math.max(...tickerRows.map(r => Math.abs(r.pnl)), 1);
  const best = tickerRows[0];
  const worst = tickerRows[tickerRows.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary tiles */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Unrealised', value: fmt$(totalPnl), color: clsN(totalPnl), big: true },
          { label: 'Return on Cost',   value: `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%`, color: clsN(returnPct), big: false },
          { label: 'Winners / Losers', value: `${winners} / ${losers}`, color: '', big: false },
          { label: 'Total Legs',       value: String(legs.length), color: '', big: false },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1, minWidth: 140, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '16px 20px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>{s.label}</div>
            <div className={`mono ${s.color}`} style={{ fontSize: s.big ? 24 : 18, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Best / worst */}
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

      {/* Bar chart by ticker */}
      <Card title="Unrealised P&L by Ticker">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tickerRows.map(row => {
            const barPct = (Math.abs(row.pnl) / maxAbs) * 100;
            const isPos = row.pnl >= 0;
            return (
              <div key={row.ticker} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 600, minWidth: 52, fontSize: 13 }}>{row.ticker}</span>
                <div style={{ flex: 1, height: 20, display: 'flex', alignItems: 'center' }}>
                  <div style={{
                    width: `${barPct}%`, height: 14, borderRadius: 3,
                    background: isPos ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)',
                    minWidth: barPct > 0 ? 2 : 0,
                    transition: 'width 0.3s',
                  }} />
                </div>
                <span className={`mono ${clsN(row.pnl)}`} style={{ fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: 'right' }}>
                  {fmt$(row.pnl)}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* P&L History */}
      <Card title="Realised P&L History">
        {history.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>
            No history yet — realised P&L will appear here after closing trades.
          </p>
        ) : (
          <PnlHistoryChart rows={history} />
        )}
      </Card>
    </div>
  );
}

// ── P&L History Chart ─────────────────────────────────────────────────────────

function PnlHistoryChart({ rows }: { rows: any[] }) {
  // Expect rows: [{date, realized_pnl, cumulative_pnl, ...}]
  const sorted = [...rows].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  if (!sorted.length) return null;

  // Build cumulative if not present
  let cum = 0;
  const pts = sorted.map(r => {
    const daily = r.realized_pnl ?? r.daily_pnl ?? 0;
    cum += daily;
    return { date: r.date ?? '', pnl: r.cumulative_pnl ?? cum, daily };
  });

  const W = 600, H = 180;
  const M = { top: 16, right: 16, bottom: 32, left: 64 };
  const iW = W - M.left - M.right;
  const iH = H - M.top - M.bottom;

  const values = pts.map(p => p.pnl);
  const pad = Math.max(Math.abs(Math.min(...values)), Math.abs(Math.max(...values))) * 0.1 + 1;
  const yLo = Math.min(Math.min(...values) - pad, 0);
  const yHi = Math.max(Math.max(...values) + pad, 0);

  const toX = (i: number) => M.left + (i / (pts.length - 1 || 1)) * iW;
  const toY = (v: number) => M.top + (1 - (v - yLo) / (yHi - yLo)) * iH;
  const yZero = toY(0);

  const line = pts.map((p, i) => `${toX(i).toFixed(1)},${toY(p.pnl).toFixed(1)}`).join(' ');
  const area = [
    `${toX(0).toFixed(1)},${yZero.toFixed(1)}`,
    ...pts.map((p, i) => `${toX(i).toFixed(1)},${toY(p.pnl).toFixed(1)}`),
    `${toX(pts.length - 1).toFixed(1)},${yZero.toFixed(1)}`,
  ].join(' ');

  const fmtK = (v: number) => {
    if (v === 0) return '$0';
    const sign = v >= 0 ? '+' : '-';
    const abs = Math.abs(v);
    return abs < 1000 ? `${sign}$${abs.toFixed(0)}` : `${sign}$${(abs / 1000).toFixed(1)}K`;
  };

  // X-axis: show ~5 evenly spaced dates
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
      {/* Y labels */}
      {[0, 0.5, 1].map(t => {
        const v = yLo + t * (yHi - yLo);
        return (
          <text key={t} x={M.left - 6} y={toY(v) + 4} textAnchor="end" fill="var(--muted)" fontSize={9}>{fmtK(v)}</text>
        );
      })}
      {/* X labels */}
      {xTicks.map((p, i) => (
        <text key={i} x={toX(pts.indexOf(p))} y={H - M.bottom + 12} textAnchor="middle" fill="var(--muted)" fontSize={8}>
          {p.date.slice(5)} {/* MM-DD */}
        </text>
      ))}
      {/* Final value label */}
      <text x={M.left + iW - 4} y={toY(finalPnl) - 5} textAnchor="end"
        fill={isPos ? 'var(--green)' : 'var(--red)'} fontSize={10} fontWeight="700">
        {fmtK(finalPnl)}
      </text>
    </svg>
  );
}

// ── Triage Tab ────────────────────────────────────────────────────────────────

function TriageTab() {
  const [rollData, setRollData]         = useState<any>(null);
  const [stopData, setStopData]         = useState<any>(null);
  const [loading, setLoading]           = useState(false);
  const [err, setErr]                   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [r, s] = await Promise.allSettled([getRollAll(), getStopLossAll()]);
    if (r.status === 'fulfilled') setRollData(r.value);
    if (s.status === 'fulfilled') setStopData(s.value);
    if (r.status === 'rejected' && s.status === 'rejected') setErr(String(r.reason));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const URGENCY_COLOR: Record<string, string> = {
    urgent: 'var(--red)', warning: 'var(--yellow)', approaching: 'var(--accent)', none: 'var(--muted)',
  };
  const VERDICT_COLOR: Record<string, string> = {
    ACT: 'var(--red)', WATCH: 'var(--yellow)', SAFE: 'var(--green)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={28} /></div>
      )}
      {err && <ErrorBanner msg={err} onRetry={load} />}

      {/* Roll summary chips */}
      {rollData && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Urgent',     count: rollData.summary?.urgent     ?? 0, color: 'var(--red)'    },
            { label: 'Warning',    count: rollData.summary?.warning    ?? 0, color: 'var(--yellow)' },
            { label: 'Approaching',count: rollData.summary?.approaching ?? 0, color: 'var(--accent)' },
            { label: 'None',       count: rollData.summary?.none       ?? 0, color: 'var(--muted)'  },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 18px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.count > 0 && s.label !== 'None' ? s.color : 'var(--fg)' }}>{s.count}</div>
            </div>
          ))}
        </div>
      )}

      {/* Roll table */}
      {rollData?.positions?.length > 0 && (
        <Card title="Roll Check">
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr>
                <th>Ticker</th>
                <th>Strategy</th>
                <th>Expiry</th>
                <th className="text-right">Strike</th>
                <th className="text-right">Delta</th>
                <th className="text-right">DTE</th>
                <th>Urgency</th>
                <th>Reasons</th>
              </tr></thead>
              <tbody>
                {rollData.positions.map((p: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700 }}>{p.ticker}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.strategy ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.expiry ?? '—'}</td>
                    <td className="text-right mono" style={{ fontSize: 12 }}>{p.short_strike ?? '—'}</td>
                    <td className="text-right mono" style={{ fontSize: 12, color: Math.abs(p.current_delta ?? 0) > 0.5 ? 'var(--red)' : 'var(--muted)' }}>
                      {p.current_delta?.toFixed(3) ?? '—'}
                    </td>
                    <td className="text-right mono" style={{ fontSize: 12, color: (p.current_dte ?? 99) <= 14 ? 'var(--red)' : (p.current_dte ?? 99) <= 21 ? 'var(--yellow)' : 'var(--muted)' }}>
                      {p.current_dte != null ? `${p.current_dte}d` : '—'}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
                        color: URGENCY_COLOR[p.urgency] ?? 'var(--muted)',
                        background: p.urgency === 'urgent' ? 'rgba(239,68,68,0.1)' : p.urgency === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(100,116,139,0.1)',
                      }}>{p.urgency ?? '—'}</span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{(p.reasons ?? []).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Stop-loss summary chips */}
      {stopData && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          {[
            { label: 'ACT',   count: (stopData.summary?.act_immediately ?? 0) + (stopData.summary?.act ?? 0), color: 'var(--red)'    },
            { label: 'WATCH', count: stopData.summary?.watch ?? 0, color: 'var(--yellow)' },
            { label: 'SAFE',  count: stopData.summary?.safe  ?? 0, color: 'var(--green)'  },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 18px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Stop {s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.count > 0 && s.label !== 'SAFE' ? s.color : 'var(--fg)' }}>{s.count}</div>
            </div>
          ))}
        </div>
      )}

      {/* Stop-loss table */}
      {stopData?.positions?.length > 0 && (
        <Card title="Stop-Loss Check">
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr>
                <th>Ticker</th>
                <th className="text-right">Price</th>
                <th className="text-right">SMA 200</th>
                <th>Verdict</th>
                <th>Action</th>
                <th>Signals</th>
              </tr></thead>
              <tbody>
                {stopData.positions
                  .sort((a: any, b: any) => {
                    const order: Record<string, number> = { ACT: 0, WATCH: 1, SAFE: 2 };
                    return (order[a.verdict] ?? 9) - (order[b.verdict] ?? 9);
                  })
                  .map((p: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700 }}>{p.ticker}</td>
                    <td className="text-right mono" style={{ fontSize: 12 }}>
                      {p.latest_price != null ? `$${p.latest_price.toFixed(2)}` : '—'}
                    </td>
                    <td className="text-right mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {p.sma_200 != null ? `$${p.sma_200.toFixed(2)}` : '—'}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase',
                        color: VERDICT_COLOR[p.verdict] ?? 'var(--muted)',
                        background: p.verdict === 'ACT' ? 'rgba(239,68,68,0.12)' : p.verdict === 'WATCH' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                      }}>{p.verdict ?? '—'}</span>
                    </td>
                    <td style={{ fontSize: 12, color: p.verdict === 'ACT' ? 'var(--red)' : 'var(--muted)' }}>
                      {p.recommended_action ?? '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{(p.signals ?? []).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && !err && !rollData && !stopData && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 60 }}>No triage data.</p>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const dte = (expiry: string | null | undefined): number =>
  expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : 0;

const netOf = (legs: any[], field: string) =>
  legs.reduce((s, l) => s + (l[field] ?? 0), 0);

const fmtStrike = (l: any) =>
  l?.strike && l.strike !== 0 ? `$${l.strike}${l.right ?? ''}` : null;

// ── Forward P&L Tab ───────────────────────────────────────────────────────────

// Parse expiry/strike/right from IBKR local_symbol when the backend leaves them null.
// Format: "TICKER  YYMMDD[C|P]STRIKE8DIGITS ..."
// e.g. "AMD   260626P00380000 100" → expiry=2026-06-26, right=P, strike=380
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
    right:  p.right  ?? parsed.right,
  };
}

function interpolatePnl(curve: ForwardPnlData['curve'], price: number): number | null {
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i], b = curve[i + 1];
    if (price >= a.price && price <= b.price) {
      const t = (price - a.price) / (b.price - a.price);
      return a.pnl + t * (b.pnl - a.pnl);
    }
  }
  return null;
}

function ForwardPnlTab({ positions }: { positions: any[] }) {
  const augmented = positions; // already augmented at load time
  const tickers   = [...new Set(augmented.map((p: any) => p.ticker as string).filter(Boolean))].sort();

  const [ticker, setTicker]         = useState(tickers[0] ?? '');
  const [targetDate, setTargetDate] = useState('');
  const [ivAdj, setIvAdj]           = useState(1.0);
  const [data, setData]             = useState<ForwardPnlData | null>(null);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState<string | null>(null);

  // Expiry dates available for selected ticker — parsed from local_symbol if needed
  const tickerExpiries = [...new Set(
    augmented
      .filter((p: any) => p.ticker === ticker && p.expiry)
      .map((p: any) => p.expiry as string)
  )].sort();

  // Set nearest expiry whenever ticker changes OR expiry list populates
  useEffect(() => {
    if (!tickerExpiries.length) return;
    setTargetDate(prev => tickerExpiries.includes(prev) ? prev : tickerExpiries[0]);
  }, [ticker, tickerExpiries.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load when any control changes
  useEffect(() => {
    if (!ticker || !targetDate) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);

    const tickerLegs = augmented.filter((p: any) => p.ticker === ticker);
    // Derive a rough target_price from strike data (used only for target_pnl annotation;
    // the curve itself is centered on spot by the backend)
    const strikes = tickerLegs.map((l: any) => l.strike).filter((s: any) => s > 0);
    const targetPrice = data?.spot
      ?? (strikes.length ? Math.round(strikes.reduce((a: number, b: number) => a + b, 0) / strikes.length) : 100);

    getForwardPnl(ticker, tickerLegs, targetPrice, targetDate, ivAdj)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e: any) => { if (!cancelled) { setErr(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ticker, targetDate, ivAdj]); // eslint-disable-line react-hooks/exhaustive-deps

  const spotPnl = data ? interpolatePnl(data.curve, data.spot) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controls */}
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
              <button key={m} onClick={() => setIvAdj(m)} style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                background: ivAdj === m ? 'var(--accent)' : 'transparent',
                color: ivAdj === m ? '#fff' : 'var(--muted)',
                border: `1px solid ${ivAdj === m ? 'var(--accent)' : 'var(--border)'}`,
              }}>
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
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(() => {
              const fmtStat = (v: number) => fmt$(v, Math.abs(v) < 100 ? 2 : 0);
              return [
              { label: 'Max Profit',  value: fmtStat(data.max_profit),  cls: 'text-green' },
              { label: 'Max Loss',    value: fmtStat(data.max_loss),    cls: 'text-red'   },
              { label: 'Net Premium', value: fmtStat(data.net_premium), cls: clsN(data.net_premium) },
              { label: `P&L @ Spot (${fmt$(data.spot, 0)})`,
                value: spotPnl != null ? fmtStat(spotPnl) : '—', cls: clsN(spotPnl) },
              ...data.breakevens.map((be, i) => ({
                label: `Breakeven${data.breakevens.length > 1 ? ` ${i + 1}` : ''}`,
                value: `$${be.toFixed(2)}`,
                cls: '',
              })),
            ];})().map((s, i) => (
              <div key={i} style={{
                flex: 1, minWidth: 120, background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px',
              }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                  {s.label}
                </div>
                <div className={`mono ${s.cls}`} style={{ fontSize: 16, fontWeight: 700 }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <Card title={`${data.ticker} forward P&L — expires ${data.target_date}${ivAdj < 1 ? ' (IV crush ×0.6)' : ''}`}>
            <ForwardPnlChart data={data} spotPnl={spotPnl} />
          </Card>
        </>
      )}

      {!data && !loading && !err && (
        <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>
          Select a ticker and date to load the forward P&L curve.
        </p>
      )}
    </div>
  );
}

function ForwardPnlChart({ data, spotPnl }: { data: ForwardPnlData; spotPnl: number | null }) {
  const { curve, spot, breakevens } = data;
  if (!curve.length) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No curve data.</p>;

  const W = 600, H = 240;
  const M = { top: 20, right: 16, bottom: 38, left: 70 };
  const iW = W - M.left - M.right;
  const iH = H - M.top - M.bottom;

  const xMin = curve[0].price;
  const xMax = curve[curve.length - 1].price;
  const pnls = curve.map(p => p.pnl);
  const pad  = Math.max(Math.abs(Math.min(...pnls)), Math.abs(Math.max(...pnls))) * 0.12;
  const yLo  = Math.min(Math.min(...pnls) - pad, 0);
  const yHi  = Math.max(Math.max(...pnls) + pad, 0);

  const toX  = (p: number) => M.left + ((p - xMin) / (xMax - xMin)) * iW;
  const toY  = (v: number) => M.top  + (1 - (v - yLo) / (yHi - yLo)) * iH;

  const yZero = toY(0);
  const pts   = (c: typeof curve) => c.map(p => `${toX(p.price).toFixed(1)},${toY(p.pnl).toFixed(1)}`).join(' ');
  const line  = pts(curve);
  const area  = [
    `${toX(xMin).toFixed(1)},${yZero.toFixed(1)}`,
    ...curve.map(p => `${toX(p.price).toFixed(1)},${toY(p.pnl).toFixed(1)}`),
    `${toX(xMax).toFixed(1)},${yZero.toFixed(1)}`,
  ].join(' ');

  // Clip rects split at zero line
  const aboveH = Math.max(0, Math.min(yZero, H - M.bottom) - M.top);
  const belowY = Math.min(Math.max(yZero, M.top), H - M.bottom);
  const belowH = Math.max(0, H - M.bottom - belowY);

  // Axis ticks
  const xTicks = [0, 0.2, 0.4, 0.6, 0.8, 1].map(t => xMin + t * (xMax - xMin));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => yLo + t * (yHi - yLo));
  const fmtK = (v: number) => {
    if (v === 0) return '$0';
    const sign = v >= 0 ? '+' : '-';
    const abs  = Math.abs(v);
    if (abs < 1000) return `${sign}$${abs.toFixed(0)}`;
    return `${sign}$${(abs / 1000).toFixed(1)}K`;
  };

  const xSpot    = toX(spot);
  const ySpotPnl = spotPnl != null ? toY(spotPnl) : null;
  const inChart  = (x: number) => x >= M.left && x <= M.left + iW;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 280, display: 'block' }}>
      <defs>
        <clipPath id="fpnl-above"><rect x={M.left} y={M.top} width={iW} height={aboveH} /></clipPath>
        <clipPath id="fpnl-below"><rect x={M.left} y={belowY} width={iW} height={belowH} /></clipPath>
      </defs>

      {/* Background */}
      <rect x={M.left} y={M.top} width={iW} height={iH} fill="rgba(0,0,0,0.15)" rx={3} />

      {/* Y gridlines */}
      {yTicks.map((v, i) => (
        <line key={i} x1={M.left} x2={M.left + iW} y1={toY(v)} y2={toY(v)}
          stroke="var(--border)" strokeWidth={0.5} opacity={0.7} />
      ))}

      {/* Filled areas */}
      <polygon points={area} fill="rgba(34,197,94,0.13)"  clipPath="url(#fpnl-above)" />
      <polygon points={area} fill="rgba(239,68,68,0.11)"  clipPath="url(#fpnl-below)" />

      {/* Zero line */}
      <line x1={M.left} x2={M.left + iW} y1={yZero} y2={yZero}
        stroke="rgba(100,116,139,0.8)" strokeWidth={1.5} strokeDasharray="5 4" />

      {/* Breakeven markers */}
      {breakevens.map((be, i) => {
        const xBe = toX(be);
        if (!inChart(xBe)) return null;
        return (
          <g key={i}>
            <line x1={xBe} x2={xBe} y1={M.top} y2={H - M.bottom}
              stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
            <text x={xBe} y={M.top - 5} textAnchor="middle" fill="var(--muted)" fontSize={9}>
              BE ${be.toFixed(0)}
            </text>
          </g>
        );
      })}

      {/* Spot line */}
      {inChart(xSpot) && (
        <g>
          <line x1={xSpot} x2={xSpot} y1={M.top} y2={H - M.bottom}
            stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.75} />
          <text x={xSpot + 5} y={M.top + 11} fill="var(--accent)" fontSize={9} fontWeight="600">
            ${spot.toFixed(0)}
          </text>
        </g>
      )}

      {/* Curve — green above zero, red below */}
      <polyline points={line} fill="none" stroke="rgba(34,197,94,0.9)"  strokeWidth={2.5} clipPath="url(#fpnl-above)" />
      <polyline points={line} fill="none" stroke="rgba(239,68,68,0.9)"  strokeWidth={2.5} clipPath="url(#fpnl-below)" />

      {/* Spot dot */}
      {inChart(xSpot) && ySpotPnl != null && (
        <circle cx={xSpot} cy={ySpotPnl} r={4} fill="var(--accent)" />
      )}

      {/* X axis */}
      <line x1={M.left} x2={M.left + iW} y1={H - M.bottom} y2={H - M.bottom} stroke="var(--border)" />
      {xTicks.map((v, i) => (
        <g key={i}>
          <line x1={toX(v)} x2={toX(v)} y1={H - M.bottom} y2={H - M.bottom + 3} stroke="var(--border)" />
          <text x={toX(v)} y={H - M.bottom + 13} textAnchor="middle" fill="var(--muted)" fontSize={9}>
            ${v.toFixed(0)}
          </text>
        </g>
      ))}

      {/* Y axis */}
      <line x1={M.left} x2={M.left} y1={M.top} y2={H - M.bottom} stroke="var(--border)" />
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={M.left - 3} x2={M.left} y1={toY(v)} y2={toY(v)} stroke="var(--border)" />
          <text x={M.left - 7} y={toY(v) + 4} textAnchor="end" fill="var(--muted)" fontSize={9}>
            {fmtK(v)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Alert badge ───────────────────────────────────────────────────────────────

function AlertBadge({ state }: { state?: string }) {
  const color = state === 'safe' ? 'var(--green)' : state === 'act' ? 'var(--red)' : 'var(--yellow)';
  const bg    = state === 'safe' ? 'rgba(34,197,94,0.1)' : state === 'act' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)';
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: bg, color, fontWeight: 600, textTransform: 'uppercase' }}>
      {state ?? '—'}
    </span>
  );
}
