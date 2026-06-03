import { useEffect, useState, useCallback, type ReactNode } from 'react';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { TabBar } from '../components/Tabs';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import {
  getPositions, getPnl, getSectorExposure, getPortfolioBeta,
  getJournal, addJournalEntry, fmt$, clsN,
  type PositionData, type PnLData,
} from '../lib/api';

export default function PortfolioPage() {
  const [tab, setTab] = useState('positions');
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [posLegs, setPosLegs]     = useState<PositionData[]>([]);
  const [pnl, setPnl]             = useState<PnLData | null>(null);
  const [sector, setSector]       = useState<any>(null);
  const [beta, setBeta]           = useState<any>(null);
  const [journal, setJournal]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [journalNote, setJournalNote] = useState('');
  const [journalSaving, setJournalSaving] = useState(false);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        getPositions(), getPnl(),
        getSectorExposure(), getPortfolioBeta(), getJournal(),
      ]);
      if (results[0].status === 'fulfilled') {
        const legs = results[0].value?.positions ?? [];
        setPositions(legs);
        setPosLegs(legs); // same data — Positions tab groups, Legs tab shows raw
      }
      if (results[1].status === 'fulfilled') setPnl(results[1].value);
      if (results[2].status === 'fulfilled') setSector(results[2].value);
      if (results[3].status === 'fulfilled') setBeta(results[3].value);
      if (results[4].status === 'fulfilled') setJournal(results[4].value?.entries ?? results[4].value?.journal ?? []);
      setUpdatedAt(new Date().toISOString());
    } catch (e: any) {
      setError(String(e));
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5 minutes (silent background poll)
  useEffect(() => {
    const id = setInterval(() => load(true), 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  const saveJournal = async () => {
    if (!journalNote.trim()) return;
    setJournalSaving(true);
    try {
      await addJournalEntry({ note: journalNote, timestamp: new Date().toISOString() });
      setJournalNote('');
      const j = await getJournal();
      setJournal(j?.entries ?? j?.journal ?? []);
    } finally {
      setJournalSaving(false);
    }
  };

  const TABS = [
    { key: 'positions', label: 'Positions' },
    { key: 'legs',      label: 'Legs' },
    { key: 'pnl',       label: 'P&L' },
    { key: 'exposure',  label: 'Exposure' },
    { key: 'journal',   label: 'Journal' },
  ];

  return (
    <Layout title="Portfolio" onRefresh={load} loading={loading} lastUpdated={updatedAt}>
      {loading && !positions.length && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={32} />
        </div>
      )}
      {error && <ErrorBanner msg={error} onRetry={load} />}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* POSITIONS TAB */}
      {tab === 'positions' && (
        <PositionsTab positions={positions} />
      )}

      {/* LEGS TAB */}
      {tab === 'legs' && (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr>
                <th>Ticker</th>
                <th>Dir</th>
                <th>Type</th>
                <th className="text-right">Strike</th>
                <th>Expiry</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Delta</th>
                <th className="text-right">Mkt Val</th>
                <th className="text-right">NLV%</th>
                <th>Alert</th>
              </tr></thead>
              <tbody>
                {posLegs.map((p, i) => {
                  const isShort = p.leg_direction === 'short';
                  const dirColor = isShort ? 'var(--red)' : 'var(--green)';
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{p.ticker}</td>
                      <td style={{ color: dirColor, fontWeight: 600, fontSize: 12 }}>
                        {isShort ? 'SHORT' : 'LONG'}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {p.right ? `${p.right === 'C' ? 'Call' : p.right === 'P' ? 'Put' : p.right}` : (p.strategy ?? '—')}
                      </td>
                      <td className="text-right mono">
                        {p.strike != null && p.strike !== 0 ? p.strike : '—'}
                      </td>
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
      )}

      {/* P&L TAB — client-side computation from legs */}
      {tab === 'pnl' && <PnlTab legs={posLegs} />}

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

      {/* JOURNAL TAB */}
      {tab === 'journal' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Add Entry">
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={journalNote}
                onChange={e => setJournalNote(e.target.value)}
                placeholder="Trade note, observation, decision rationale..."
                style={{ flex: 1 }}
                onKeyDown={e => e.key === 'Enter' && saveJournal()}
              />
              <button onClick={saveJournal} disabled={journalSaving || !journalNote.trim()} style={{
                background: 'var(--accent)', color: '#fff',
              }}>
                {journalSaving ? '…' : 'Save'}
              </button>
            </div>
          </Card>
          <Card title="Entries">
            {journal.length === 0
              ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No journal entries.</p>
              : journal.slice().reverse().map((e: any, i: number) => (
                <div key={i} style={{
                  padding: '10px 0', borderBottom: '1px solid var(--border)',
                  display: 'flex', gap: 12,
                }}>
                  <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0, marginTop: 2 }}>
                    {e.timestamp ? new Date(e.timestamp).toLocaleDateString() : '—'}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {(e.ticker || e.action) && (
                      <div style={{ fontSize: 12 }}>
                        {e.ticker && <span style={{ fontWeight: 600, marginRight: 8 }}>{e.ticker}</span>}
                        {e.action && <span style={{ color: 'var(--accent)', marginRight: 8 }}>{e.action}</span>}
                        {e.strategy && <span style={{ color: 'var(--muted)' }}>{e.strategy}</span>}
                      </div>
                    )}
                    <span style={{ fontSize: 13 }}>
                      {e.description ?? e.notes ?? e.note ?? e.text ?? e.content ?? JSON.stringify(e)}
                    </span>
                    {e.realized_pnl != null && (
                      <span style={{ fontSize: 12, color: e.realized_pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        P&L: {e.realized_pnl >= 0 ? '+' : ''}{e.realized_pnl}
                      </span>
                    )}
                  </div>
                </div>
              ))
            }
          </Card>
        </div>
      )}
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

function PnlTab({ legs }: { legs: any[] }) {
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

// ── Strategy grouping ─────────────────────────────────────────────────────────

type StratGroup =
  | { type: 'PMCC';    leap: any; sc: any }
  | { type: 'IC';      sc: any; lc: any; sp: any; lp: any }
  | { type: 'BPS';     sp: any; lp: any }   // put spread (short higher / long lower)
  | { type: 'STR';     sc: any; sp: any }   // strangle / straddle
  | { type: 'LEG';     leg: any };

function groupTickerLegs(legs: any[]): StratGroup[] {
  const taken = new Set<any>();
  const free  = (l: any) => !taken.has(l);
  const take  = (...ls: any[]) => ls.forEach(l => taken.add(l));
  const result: StratGroup[] = [];

  const sc = legs.filter(l => free(l) && l.leg_direction === 'short' && l.right === 'C');
  const lc = legs.filter(l => free(l) && l.leg_direction === 'long'  && l.right === 'C');
  const sp = legs.filter(l => free(l) && l.leg_direction === 'short' && l.right === 'P');
  const lp = legs.filter(l => free(l) && l.leg_direction === 'long'  && l.right === 'P');

  // 1. Iron Condor: SC + LC(above) + SP + LP(below)
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

  // 2. PMCC: long LEAP call (DTE > 90) → short call (higher strike, shorter DTE)
  for (const leap of lc.filter(free).filter(l => dte(l.expiry) > 90 && (l.strike ?? 0) > 0)) {
    const shortCall = sc.filter(free).find(s => (s.strike ?? 0) > (leap.strike ?? 0));
    if (shortCall) { take(leap, shortCall); result.push({ type: 'PMCC', leap, sc: shortCall }); }
  }

  // 3. Put spreads: short put + long put (lower strike)
  for (const shortPut of sp.filter(free)) {
    const longPut = lp.filter(free).find(l => l.strike < shortPut.strike);
    if (longPut) { take(shortPut, longPut); result.push({ type: 'BPS', sp: shortPut, lp: longPut }); }
  }

  // 4. Strangles: short call + short put (same non-null expiry)
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
  LEG:  { bg: 'rgba(100,116,139,0.15)', color: 'var(--muted)' },
};

// ── Strategy row ──────────────────────────────────────────────────────────────

function StratRow({ badge, strike, expiry, legs, alert }: {
  badge: string;
  strike: ReactNode;
  expiry: string | null | undefined;
  legs: any[];
  alert?: boolean;
}) {
  const d        = dte(expiry);
  const dteColor = d <= 7 ? 'var(--red)' : d <= 14 ? 'var(--yellow)' : 'var(--muted)';
  const netDelta = netOf(legs, 'current_delta');
  const netTheta = netOf(legs, 'current_theta') * 100; // × 100 shares
  const netMv    = netOf(legs, 'market_value');
  const netNlv   = netOf(legs, 'net_liq_pct');
  const { bg, color } = BADGE[badge] ?? BADGE.LEG;
  const deltaWarn = Math.abs(netDelta) > 0.35;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '52px 1fr 120px 72px 64px 80px 52px',
      alignItems: 'center',
      gap: 8,
      padding: '9px 16px',
      borderTop: '1px solid var(--border)',
      background: alert ? 'rgba(239,68,68,0.03)' : undefined,
    }}>
      {/* Badge */}
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
        background: bg, color, textAlign: 'center', letterSpacing: '0.04em',
      }}>{badge}</span>

      {/* Strike description */}
      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{strike}</span>

      {/* Expiry + DTE */}
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
        {expiry ?? '—'}
        {expiry && <span style={{ color: dteColor, marginLeft: 5, fontWeight: d <= 14 ? 600 : 400 }}>{d}d</span>}
      </span>

      {/* Delta */}
      <span style={{
        fontFamily: 'monospace', fontSize: 12, textAlign: 'right',
        color: deltaWarn ? 'var(--yellow)' : netDelta > 0 ? 'var(--green)' : netDelta < 0 ? 'var(--red)' : 'var(--muted)',
      }}>
        {netDelta > 0 ? '+' : ''}{netDelta.toFixed(3)}
      </span>

      {/* Theta */}
      <span style={{ fontFamily: 'monospace', fontSize: 11, textAlign: 'right', color: netTheta >= 0 ? 'var(--green)' : 'var(--red)' }}>
        {netTheta >= 0 ? '+' : ''}${Math.abs(netTheta).toFixed(0)}/d
      </span>

      {/* Market value */}
      <span style={{
        fontFamily: 'monospace', fontSize: 12, textAlign: 'right',
        color: netMv >= 0 ? 'var(--green)' : 'var(--red)',
      }}>
        {fmt$(netMv, 0)}
      </span>

      {/* NLV% */}
      <span style={{ fontFamily: 'monospace', fontSize: 11, textAlign: 'right', color: 'var(--muted)' }}>
        {netNlv > 0 ? '+' : ''}{netNlv.toFixed(1)}%
      </span>
    </div>
  );
}

// ── Ticker section ────────────────────────────────────────────────────────────

function TickerSection({ ticker, legs }: { ticker: string; legs: any[] }) {
  const groups   = groupTickerLegs(legs);
  const netDelta = netOf(legs, 'current_delta');
  const netNlv   = netOf(legs, 'net_liq_pct');
  const nearestDte = Math.min(...legs.map(l => dte(l.expiry)).filter(d => d > 0).concat([Infinity]));
  const hasAlert = legs.some(l => l.delta_state === 'critical' || l.delta_state === 'watch');
  const dteWarn  = nearestDte <= 14;
  const isStock  = legs.every(l => l.sec_type === 'STK' || l.sec_type === 'STOCK');

  return (
    <div style={{
      border: `1px solid ${hasAlert ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Ticker header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px',
        background: 'var(--surface2)',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 52 }}>{ticker}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{legs.length} leg{legs.length !== 1 ? 's' : ''}</span>
        {hasAlert && <span style={{ fontSize: 11, color: 'var(--yellow)', fontWeight: 600 }}>⚠ alert</span>}
        {dteWarn && nearestDte !== Infinity && (
          <span style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 10,
            background: nearestDte <= 7 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)',
            color: nearestDte <= 7 ? 'var(--red)' : 'var(--yellow)', fontWeight: 600,
          }}>{nearestDte}d</span>
        )}
        <span style={{ flex: 1 }} />
        {/* Column labels — align with StratRow grid */}
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 72, textAlign: 'right' }}>Δ net</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 64, textAlign: 'right' }}>Θ/day</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 80, textAlign: 'right' }}>Mkt Val</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 52, textAlign: 'right' }}>NLV%</span>
        {/* Totals */}
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, minWidth: 72, textAlign: 'right',
          color: Math.abs(netDelta) > 0.35 ? 'var(--yellow)' : 'var(--text)' }}>
          {netDelta > 0 ? '+' : ''}{netDelta.toFixed(3)}
        </span>
        <span style={{
          fontFamily: 'monospace', fontSize: 12, minWidth: 52, textAlign: 'right', fontWeight: Math.abs(netNlv) > 50 ? 700 : 400,
          color: Math.abs(netNlv) > 50 ? 'var(--red)' : Math.abs(netNlv) > 20 ? 'var(--yellow)' : 'var(--muted)',
        }}>
          {netNlv > 0 ? '+' : ''}{netNlv.toFixed(1)}%
          {Math.abs(netNlv) > 50 && <span style={{ marginLeft: 4, fontSize: 10 }}>🔒</span>}
        </span>
      </div>

      {/* Strategy rows */}
      {isStock ? (
        <div style={{ padding: '9px 16px', fontSize: 13, color: 'var(--muted)' }}>
          Stock position · {legs[0]?.qty ?? '?'} shares · {fmt$(legs[0]?.market_value, 0)}
        </div>
      ) : (
        groups.map((g, i) => {
          if (g.type === 'PMCC') {
            const leapLabel = `${fmtStrike(g.leap)} LEAP`;
            const shortLabel = fmtStrike(g.sc);
            return (
              <StratRow key={i} badge="PMCC"
                strike={<><span style={{ color: 'var(--green)' }}>{leapLabel}</span><span style={{ color: 'var(--muted)' }}> → </span><span style={{ color: 'var(--red)' }}>{shortLabel}</span></>}
                expiry={g.sc.expiry} legs={[g.leap, g.sc]}
              />
            );
          }
          if (g.type === 'IC') {
            const w = `${fmtStrike(g.lp)}/${fmtStrike(g.sp)}P · ${fmtStrike(g.sc)}/${fmtStrike(g.lc)}C`;
            return (
              <StratRow key={i} badge="IC"
                strike={<span style={{ color: 'var(--muted)' }}>{w}</span>}
                expiry={g.sc.expiry} legs={[g.sc, g.lc, g.sp, g.lp]}
              />
            );
          }
          if (g.type === 'BPS') {
            const width = g.sp.strike - g.lp.strike;
            const isItm = g.sp.current_delta != null && Math.abs(g.sp.current_delta) > 0.5;
            return (
              <StratRow key={i} badge="BPS"
                strike={<>
                  <span style={{ color: 'var(--red)' }}>{fmtStrike(g.sp)}</span>
                  <span style={{ color: 'var(--muted)' }}> / </span>
                  <span style={{ color: 'var(--muted)' }}>{fmtStrike(g.lp)}</span>
                  {width > 0 && <span style={{ color: 'var(--muted)', fontSize: 11 }}> ({width}w)</span>}
                  {isItm && <span style={{ color: 'var(--red)', fontWeight: 700, marginLeft: 8, fontSize: 11 }}>⚠ ITM</span>}
                </>}
                expiry={g.sp.expiry} legs={[g.sp, g.lp]} alert={isItm}
              />
            );
          }
          if (g.type === 'STR') {
            const isStraddle = g.sc.strike === g.sp.strike;
            return (
              <StratRow key={i} badge={isStraddle ? 'STD' : 'STR'}
                strike={<><span style={{ color: 'var(--red)' }}>{fmtStrike(g.sp)}</span><span style={{ color: 'var(--muted)' }}> / </span><span style={{ color: 'var(--red)' }}>{fmtStrike(g.sc)}</span></>}
                expiry={g.sc.expiry} legs={[g.sc, g.sp]}
              />
            );
          }
          // Single leg
          const leg = g.leg;
          const dir = leg.leg_direction === 'short' ? 'SHORT' : 'LONG';
          return (
            <StratRow key={i} badge="LEG"
              strike={<><span style={{ color: leg.leg_direction === 'short' ? 'var(--red)' : 'var(--green)', fontSize: 10 }}>{dir} </span><span>{fmtStrike(leg)}</span></>}
              expiry={leg.expiry} legs={[leg]}
            />
          );
        })
      )}
    </div>
  );
}

// ── Positions tab ─────────────────────────────────────────────────────────────

function PositionsTab({ positions }: { positions: any[] }) {
  // Group all legs by ticker
  const byTicker = new Map<string, any[]>();
  for (const leg of positions) {
    const t = leg.ticker ?? '?';
    byTicker.set(t, [...(byTicker.get(t) ?? []), leg]);
  }

  // Sort by absolute NLV% descending
  const tickerGroups = [...byTicker.entries()]
    .map(([t, ls]) => ({ ticker: t, legs: ls, nlv: netOf(ls, 'net_liq_pct') }))
    .sort((a, b) => Math.abs(b.nlv) - Math.abs(a.nlv));

  // Near-expiry banners
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
        <TickerSection key={g.ticker} ticker={g.ticker} legs={g.legs} />
      ))}
    </div>
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
