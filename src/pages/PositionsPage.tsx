import { useEffect, useState, useCallback } from 'react';
import { useSortable, SortTh } from '../components/Sortable';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { TabBar } from '../components/Tabs';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import {
  getPositions, getSectorExposure, getPortfolioBeta,
  getForwardPnl, getPnlHistory, getTradeReport, getPositionLimits,
  fmt$, clsN,
  type PositionData, type ForwardPnlData,
} from '../lib/api';

export default function PositionsPage() {
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

  useEffect(() => {
    const id = setInterval(() => load(true), 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  const TABS = [
    { key: 'pnl',        label: 'P&L'          },
    { key: 'exposure',   label: 'Exposure'      },
    { key: 'forwardpnl', label: 'Forward P&L'   },
    { key: 'limits',     label: 'Limits'        },
    { key: 'legs',       label: 'Legs'          },
    { key: 'report',     label: 'Trade Report'  },
  ];

  // Tab keyboard shortcuts: 1-6
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT','SELECT','TEXTAREA'].includes(target.tagName)) return;
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

      {tab === 'pnl' && <PnlTab legs={posLegs} />}
      {tab === 'legs' && <LegsTab legs={posLegs} />}

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
              <div style={{ display: 'flex', gap: 12 }}>
                {[
                  { label: 'β-Wtd Delta', value: beta.beta_weighted_delta?.toFixed(1) ?? '—' },
                  { label: 'SPY Price',   value: beta.spy_price ? `$${beta.spy_price}` : '—' },
                ].map((s, i) => (
                  <div key={i} style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>{s.label}</div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{s.value}</div>
                  </div>
                ))}
              </div>
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

      {tab === 'forwardpnl' && <ForwardPnlTab positions={posLegs} />}
      {tab === 'limits'     && <PositionLimitsTab positions={posLegs} />}
      {tab === 'report'     && <TradeReportTab />}
    </Layout>
  );
}

// ── P&L Tab ───────────────────────────────────────────────────────────────────

function computeLegPnl(leg: any): number {
  const qty      = Number(leg.qty ?? 0);
  const avgCost  = Number(leg.avg_cost ?? 0);
  const mv       = Number(leg.market_value ?? 0);
  const costBasis = avgCost * Math.abs(qty);
  return qty < 0 ? costBasis + mv : mv - costBasis;
}

function PnlTab({ legs }: { legs: any[] }) {
  const [history, setHistory] = useState<any[]>([]);
  useEffect(() => {
    getPnlHistory()
      .then(d => setHistory(d?.rows ?? []))
      .catch(() => {});
  }, []);

  const byTicker = new Map<string, { pnl: number; costBasis: number; legs: number }>();
  let totalPnl = 0, winners = 0, losers = 0;
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
  const tickerRows = [...byTicker.entries()].map(([ticker, v]) => ({ ticker, ...v })).sort((a, b) => b.pnl - a.pnl);
  const maxAbs = Math.max(...tickerRows.map(r => Math.abs(r.pnl)), 1);
  const best  = tickerRows[0];
  const worst = tickerRows[tickerRows.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Unrealised', value: fmt$(totalPnl),    color: clsN(totalPnl), big: true  },
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

      <Card title="Unrealised P&L by Ticker">
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

// ── Forward P&L Tab ───────────────────────────────────────────────────────────

function parseLocalSymbol(localSymbol: string | null | undefined): { expiry: string | null; right: string | null; strike: number | null } {
  const empty = { expiry: null, right: null, strike: null };
  if (!localSymbol) return empty;
  const m = localSymbol.match(/\[\S+\s+(\d{6})([CP])(\d{8})/);
  if (!m) return empty;
  const [, yymmdd, right, strikeStr] = m;
  return { expiry: `20${yymmdd.slice(0,2)}-${yymmdd.slice(2,4)}-${yymmdd.slice(4,6)}`, right, strike: parseInt(strikeStr, 10) / 1000 };
}

function augmentLeg(p: any): any {
  if (p.expiry && p.strike && p.right) return p;
  const parsed = parseLocalSymbol(p.local_symbol);
  return { ...p, expiry: p.expiry ?? parsed.expiry, strike: (p.strike && p.strike !== 0) ? p.strike : (parsed.strike ?? p.strike), right: p.right ?? parsed.right };
}

function interpolatePnl(curve: ForwardPnlData['curve'], price: number): number | null {
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i], b = curve[i + 1];
    if (price >= a.price && price <= b.price) {
      return a.pnl + ((price - a.price) / (b.price - a.price)) * (b.pnl - a.pnl);
    }
  }
  return null;
}

function ForwardPnlTab({ positions }: { positions: any[] }) {
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
                ...data.breakevens.map((be, i) => ({ label: `Breakeven${data.breakevens.length > 1 ? ` ${i + 1}` : ''}`, value: `$${be.toFixed(2)}`, cls: '' })),
              ];
            })().map((s, i) => (
              <div key={i} style={{ flex: 1, minWidth: 120, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
                <div className={`mono ${s.cls}`} style={{ fontSize: 16, fontWeight: 700 }}>{s.value}</div>
              </div>
            ))}
          </div>
          <Card title={`${data.ticker} forward P&L — expires ${data.target_date}${ivAdj < 1 ? ' (IV crush ×0.6)' : ''}`}>
            <ForwardPnlChart data={data} spotPnl={spotPnl} />
          </Card>
        </>
      )}

      {!data && !loading && !err && (
        <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>Select a ticker and date to load the forward P&L curve.</p>
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

// ── Position Limits Tab ───────────────────────────────────────────────────────

function PositionLimitsTab({ positions }: { positions: any[] }) {
  const tickers = [...new Set(positions.map((p: any) => p.ticker as string).filter(Boolean))].sort();
  const [ticker, setTicker] = useState(tickers[0] ?? '');
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  const load = useCallback(async (t: string) => {
    if (!t) return;
    setLoading(true); setErr(null); setData(null);
    const legs = positions.filter((p: any) => p.ticker === t);
    try {
      const d = await getPositionLimits(t, legs);
      setData(d);
    } catch (e: any) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, [positions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (ticker) load(ticker); }, [ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Ticker selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {tickers.map(t => (
          <button key={t} onClick={() => setTicker(t)} style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
            background: ticker === t ? 'var(--accent)' : 'var(--surface2)',
            color: ticker === t ? '#fff' : 'var(--muted)',
            border: ticker === t ? 'none' : '1px solid var(--border2)',
            fontWeight: ticker === t ? 600 : 400,
          }}>{t}</button>
        ))}
        {loading && <Spinner size={14} />}
      </div>

      {err && <ErrorBanner msg={err} onRetry={() => load(ticker)} />}

      {data && (
        <>
          {/* Key metrics */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Spot',        value: data.spot       != null ? `$${data.spot.toFixed(2)}` : '—', color: 'var(--muted)' },
              { label: 'Max Profit',  value: data.max_profit != null ? fmt$(data.max_profit, Math.abs(data.max_profit) < 100 ? 2 : 0) : '—', color: clsN(data.max_profit) },
              { label: 'Max Loss',    value: data.max_loss   != null ? fmt$(data.max_loss,   Math.abs(data.max_loss)   < 100 ? 2 : 0) : '—', color: clsN(data.max_loss) },
              { label: 'Net Premium', value: data.net_premium != null ? fmt$(data.net_premium, Math.abs(data.net_premium) < 100 ? 2 : 0) : '—', color: clsN(data.net_premium) },
            ].map((s, i) => (
              <div key={i} style={{ flex: 1, minWidth: 130, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>{s.label}</div>
                <div className={`mono ${s.color}`} style={{ fontSize: 20, fontWeight: 700 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Breakevens */}
          <Card title="Breakeven Prices">
            {!data.breakevens?.length ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No breakeven data — position may be a long-only holding or data unavailable.</p>
            ) : (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {data.breakevens.map((be: number, i: number) => (
                  <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '12px 20px' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Breakeven {data.breakevens.length > 1 ? i + 1 : ''}</div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>${be.toFixed(2)}</div>
                    {data.spot && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                        {((be - data.spot) / data.spot * 100).toFixed(1)}% from spot
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {!data && !loading && !err && tickers.length === 0 && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>No open positions.</p>
      )}
    </div>
  );
}

// ── Trade Report Tab ──────────────────────────────────────────────────────────

function TradeReportTab() {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await getTradeReport();
      setData(d);
    } catch (e: any) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={28} /></div>;
  if (err) return <ErrorBanner msg={err} onRetry={load} />;
  if (!data) return null;

  const stopAlerts:   any[] = data.stop_loss_alerts   ?? [];
  const entryCands:   any[] = data.entry_candidates   ?? [];
  const exitCands:    any[] = data.exit_candidates    ?? [];
  const macro               = data.macro ?? {};
  const summary             = data.summary ?? {};
  const asOf                = data.as_of ? new Date(data.as_of).toLocaleString() : null;

  const verdictColor  = (v: string) => v === 'ACT' ? 'var(--red)' : v === 'WATCH' ? 'var(--yellow)' : 'var(--green)';
  const verdictBg     = (v: string) => v === 'ACT' ? 'rgba(239,68,68,0.1)' : v === 'WATCH' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)';
  const actionColor   = (a: string) => a === 'NEW_ENTRY' ? 'var(--accent)' : 'var(--green)';
  const ivrColor      = (ivr: number | null) => ivr == null ? 'var(--muted)' : ivr >= 50 ? 'var(--green)' : ivr >= 25 ? 'var(--yellow)' : 'var(--muted)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {macro.regime && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Regime</div>
            <div style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', fontFamily: 'monospace', color: macro.regime === 'bullish' ? 'var(--green)' : macro.regime === 'bearish' ? 'var(--red)' : 'var(--yellow)' }}>{macro.regime}</div>
          </div>
        )}
        {[
          { label: 'Stop Alerts', value: summary.stop_loss_alerts_count ?? stopAlerts.length, color: stopAlerts.some((s:any) => s.verdict === 'ACT') ? 'var(--red)' : 'var(--muted)' },
          { label: 'Entry Cands', value: summary.entry_candidates_count ?? entryCands.length, color: 'var(--muted)' },
          { label: 'Exit Cands',  value: summary.exit_candidates_count  ?? exitCands.length,  color: exitCands.length ? 'var(--green)' : 'var(--muted)' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: s.color }}>{s.value}</div>
          </div>
        ))}
        <button onClick={load} style={{ marginLeft: 'auto', background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--muted)', fontSize: 11, padding: '5px 12px' }}>↻ Refresh</button>
        {asOf && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{asOf}</span>}
      </div>

      {/* Stop-loss alerts */}
      {stopAlerts.length > 0 && (
        <Card title="Stop-Loss Alerts">
          <table>
            <thead><tr>
              <th>Ticker</th>
              <th>Strategy</th>
              <th>Verdict</th>
              <th>Signals</th>
              <th>Reason</th>
            </tr></thead>
            <tbody>
              {stopAlerts.map((r: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.ticker}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.strategy ?? '—'}</td>
                  <td>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: verdictBg(r.verdict), color: verdictColor(r.verdict), fontWeight: 700 }}>
                      {r.verdict}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                    {(r.signals ?? []).join(', ') || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 300 }}>
                    {(r.reasons ?? []).join(' · ') || r.recommended_action || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Exit candidates */}
      {exitCands.length > 0 && (
        <Card title="Exit Candidates">
          <table>
            <thead><tr>
              <th>Ticker</th>
              <th>Strategy</th>
              <th>Action</th>
              <th className="text-right">Mkt Val</th>
              <th>Note</th>
            </tr></thead>
            <tbody>
              {exitCands.map((r: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.ticker}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.strategy ?? '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>{r.action?.replace(/_/g, ' ')}</td>
                  <td className="text-right mono" style={{ fontSize: 12 }}>{r.net_market_value != null ? fmt$(r.net_market_value) : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Entry candidates */}
      <Card title="Entry Candidates">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>
              <th>Ticker</th>
              <th className="text-right">IV Rank</th>
              <th className="text-right">Days to Earn.</th>
              <th>Earn. State</th>
              <th className="text-right">Conc %</th>
              <th>Position</th>
              <th>Action</th>
            </tr></thead>
            <tbody>
              {entryCands.map((r: any, i: number) => {
                const earnColor = r.earnings_state === 'approaching' ? 'var(--yellow)' : r.earnings_state === 'blackout' ? 'var(--red)' : 'var(--muted)';
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.ticker}</td>
                    <td className="text-right mono" style={{ color: ivrColor(r.iv_rank), fontWeight: 600 }}>
                      {r.iv_rank != null ? `${r.iv_rank.toFixed(0)}` : '—'}
                    </td>
                    <td className="text-right mono" style={{ color: (r.days_to_earnings ?? 99) < 20 ? 'var(--yellow)' : 'var(--muted)' }}>
                      {r.days_to_earnings != null ? `${r.days_to_earnings}d` : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: earnColor, textTransform: 'uppercase' }}>{r.earnings_state ?? '—'}</td>
                    <td className="text-right mono" style={{ color: Math.abs(r.concentration_pct ?? 0) > 10 ? 'var(--yellow)' : 'var(--muted)', fontSize: 12 }}>
                      {r.concentration_pct != null ? `${r.concentration_pct.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: r.has_existing_position ? 'var(--green)' : 'var(--muted)' }}>
                      {r.has_existing_position ? 'existing' : 'new'}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(99,102,241,0.1)', color: actionColor(r.action ?? ''), fontWeight: 600 }}>
                        {(r.action ?? '—').replace(/_/g, ' ')}
                      </span>
                    </td>
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
