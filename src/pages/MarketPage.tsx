import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSortable, SortTh } from '../components/Sortable';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { TabBar } from '../components/Tabs';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { getCalendar, fetchEarnings, getQuantDataReports, getUniverse, getIvRank, getGex, getVolSkew, getVolAnalytics, type IvRankData } from '../lib/api';
import { UniverseSection } from '../components/system/UniverseSection';

export default function MarketPage() {
  const [tab, setTab]           = useState('analytics');
  const [cal, setCal]           = useState<any>(null);
  const [qd, setQd]             = useState<any>(null);
  const [universe, setUniverse]     = useState<string[]>([]);
  const [universeRaw, setUniverseRaw] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const [c, q, u] = await Promise.allSettled([
        getCalendar(), getQuantDataReports(), getUniverse(),
      ]);
      if (c.status === 'fulfilled') setCal(c.value);
      if (q.status === 'fulfilled') setQd(q.value);
      if (u.status === 'fulfilled') {
        const val = u.value as any;
        setUniverseRaw(val);
        const raw: any[] = val?.tier1 ?? val?.tickers ?? [];
        setUniverse(raw.map((t: any) => typeof t === 'string' ? t : (t?.ticker ?? String(t))));
      }
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

  const TABS = [
    { key: 'analytics', label: 'Analytics'        },
    { key: 'calendar',  label: 'Earnings Calendar' },
    { key: 'quantdata', label: 'QuantData'         },
    { key: 'universe',  label: 'Universe'          },
  ];

  // Tab keyboard shortcuts: 1-4
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
    <Layout title="Market" onRefresh={load} loading={loading} lastUpdated={updatedAt}>
      {loading && !cal && !qd && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={32} />
        </div>
      )}
      {error && <ErrorBanner msg={error} onRetry={load} />}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* CALENDAR */}
      {tab === 'calendar' && (
        <Card title="Earnings Calendar" action={
          <button onClick={async () => { setFetching(true); try { await fetchEarnings(); const c = await getCalendar(); setCal(c); } catch(e:any){setError(String(e));} finally{setFetching(false);} }}
            disabled={fetching}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--muted)', fontSize: 11, padding: '3px 10px' }}>
            {fetching ? '…' : '↻ Fetch'}
          </button>
        }>
          {!cal ? (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>No calendar data. Hit Fetch to load.</p>
          ) : (
            <EarningsTable cal={cal} />
          )}
        </Card>
      )}

      {/* ANALYTICS (merged) */}
      {tab === 'analytics' && <AnalyticsTab universe={universe} />}

      {/* QUANTDATA */}
      {tab === 'quantdata' && <QuantDataTab qd={qd} universe={universe} />}

      {/* UNIVERSE */}
      {tab === 'universe' && (
        universeRaw
          ? <UniverseSection universe={universeRaw} onRefresh={() => load()} />
          : <p style={{ color: 'var(--muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Universe not loaded yet — click refresh.</p>
      )}
    </Layout>
  );
}

// ─── Analytics Tab (merged GEX/Skew + IV Ladder) ─────────────────────────────

type AnalyticsView = 'gex' | 'ladder';

function AnalyticsTab({ universe }: { universe: string[] }) {
  const tickers = universe.length ? universe : ['SPY'];
  const [ticker, setTicker]     = useState(tickers[0]);
  const [view, setView]         = useState<AnalyticsView>('gex');
  const [gexData, setGexData]   = useState<any>(null);
  const [skewData, setSkewData] = useState<any>(null);
  const [volData, setVolData]   = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  const load = useCallback(async (t: string) => {
    setLoading(true); setErr(null);
    setGexData(null); setSkewData(null); setVolData(null);
    const [g, s, v] = await Promise.allSettled([getGex(t), getVolSkew(t), getVolAnalytics(t)]);
    if (g.status === 'fulfilled') setGexData(g.value);
    if (s.status === 'fulfilled') setSkewData(s.value);
    if (v.status === 'fulfilled') setVolData(v.value);
    if (g.status === 'rejected' && s.status === 'rejected' && v.status === 'rejected') setErr(String(g.reason));
    setLoading(false);
  }, []);

  useEffect(() => { load(ticker); }, [ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  const ladder: any[] = volData?.atm_ladder?.filter((r: any) => r.avg_iv != null) ?? [];
  const skewPuts:  any[] = (volData?.skew ?? []).filter((r: any) => r.type === 'p');
  const skewCalls: any[] = (volData?.skew ?? []).filter((r: any) => r.type === 'c');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Ticker selector + view toggle */}
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 0, border: '1px solid var(--border2)', borderRadius: 6, overflow: 'hidden' }}>
          {([
            { key: 'gex',    label: 'GEX & Skew' },
            { key: 'ladder', label: 'IV Ladder'  },
          ] as const).map(v => (
            <button key={v.key} onClick={() => setView(v.key)} style={{
              fontSize: 11, padding: '4px 12px', cursor: 'pointer',
              background: view === v.key ? 'var(--accent)' : 'var(--surface2)',
              color: view === v.key ? '#fff' : 'var(--muted)',
              border: 'none', fontWeight: view === v.key ? 600 : 400,
            }}>{v.label}</button>
          ))}
        </div>
      </div>

      {err && <ErrorBanner msg={err} onRetry={() => load(ticker)} />}

      {/* GEX & Skew view */}
      {view === 'gex' && (
        <>
          {gexData && <GexChart data={gexData} ticker={ticker} />}
          {skewData && <VolSkewChart data={skewData} ticker={ticker} />}
          {!loading && !err && !gexData && !skewData && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 60 }}>No GEX / skew data available.</p>
          )}
        </>
      )}

      {/* IV Ladder view */}
      {view === 'ladder' && (
        <>
          {volData && (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {volData.spot != null && <KVChip label="Spot" value={`$${volData.spot.toFixed(0)}`} color="var(--muted)" />}
                {ladder[0]?.avg_iv != null && <KVChip label="ATM IV (0DTE)" value={`${ladder[0].avg_iv.toFixed(1)}%`} color="var(--accent)" />}
                {ladder.length > 1 && (() => {
                  const near = ladder[0], far = ladder[ladder.length - 1];
                  if (!near?.avg_iv || !far?.avg_iv) return null;
                  const slope = far.avg_iv - near.avg_iv;
                  return <KVChip label="Term Slope" value={`${slope >= 0 ? '+' : ''}${slope.toFixed(1)}pp`} color={slope > 2 ? 'var(--green)' : slope < -1 ? 'var(--red)' : 'var(--muted)'} />;
                })()}
              </div>
              {ladder.length > 0 && (
                <Card title={`${ticker} ATM IV Ladder`}>
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead><tr>
                        <th>Expiry</th>
                        <th className="text-right">DTE</th>
                        <th className="text-right">ATM Strike</th>
                        <th className="text-right">Call IV</th>
                        <th className="text-right">Put IV</th>
                        <th className="text-right">Avg IV</th>
                        <th className="text-right">Spread</th>
                      </tr></thead>
                      <tbody>
                        {ladder.map((r: any, i: number) => {
                          const ivColor = (r.avg_iv ?? 0) >= 25 ? 'var(--green)' : (r.avg_iv ?? 0) >= 15 ? 'var(--yellow)' : 'var(--muted)';
                          return (
                            <tr key={i}>
                              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.expiry}</td>
                              <td className="text-right mono" style={{ color: 'var(--muted)' }}>{r.dte}</td>
                              <td className="text-right mono" style={{ color: 'var(--muted)' }}>${r.atm_strike}</td>
                              <td className="text-right mono">{r.call_iv != null ? `${r.call_iv.toFixed(1)}%` : '—'}</td>
                              <td className="text-right mono">{r.put_iv  != null ? `${r.put_iv.toFixed(1)}%`  : '—'}</td>
                              <td className="text-right mono" style={{ color: ivColor, fontWeight: 600 }}>{r.avg_iv != null ? `${r.avg_iv.toFixed(1)}%` : '—'}</td>
                              <td className="text-right mono" style={{ color: 'var(--muted)', fontSize: 11 }}>{r.iv_spread != null ? `${r.iv_spread.toFixed(2)}pp` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
              {(skewPuts.length > 0 || skewCalls.length > 0) && (
                <Card title={`${ticker} Vol Skew — ${volData.skew_expiry ?? ''}`}>
                  <VolSkewSvg puts={skewPuts} calls={skewCalls} spot={volData.spot} />
                </Card>
              )}
            </>
          )}
          {!loading && !err && !volData && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 60 }}>No vol analytics data available.</p>
          )}
        </>
      )}
    </div>
  );
}

function GexChart({ data, ticker }: { data: any; ticker: string }) {
  // data: {spot, total_gex, strikes: [{strike, net_gex, call_gex, put_gex}]}
  const strikes: any[] = data.strikes ?? [];
  if (!strikes.length) return (
    <Card title={`${ticker} GEX`}>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>No GEX data.</p>
    </Card>
  );

  const spot = data.spot ?? 0;
  const maxAbs = Math.max(...strikes.map(s => Math.abs(s.net_gex ?? 0)), 1);

  // Key levels
  const callWall = data.call_wall ?? strikes.reduce((a: any, s: any) => (s.call_gex ?? 0) > (a?.call_gex ?? 0) ? s : a, strikes[0]);
  const putWall  = data.put_wall  ?? strikes.reduce((a: any, s: any) => (s.put_gex ?? 0) < (a?.put_gex ?? 0) ? s : a, strikes[0]);

  return (
    <Card title={`${ticker} Gamma Exposure — Spot $${spot.toFixed(0)}`}>
      {(data.call_wall || data.put_wall || data.total_gex != null) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          {data.total_gex != null && (
            <KVChip label="Net GEX" value={fmtGex(data.total_gex)} color={data.total_gex >= 0 ? 'var(--green)' : 'var(--red)'} />
          )}
          {callWall?.strike && <KVChip label="Call Wall" value={`$${callWall.strike}`} color="var(--green)" />}
          {putWall?.strike  && <KVChip label="Put Wall"  value={`$${putWall.strike}`}  color="var(--red)"   />}
          {data.flip_level  && <KVChip label="Flip"      value={`$${data.flip_level}`} color="var(--muted)" />}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {strikes.slice(-30).map((s: any, i: number) => {
          const net = s.net_gex ?? 0;
          const pct = (Math.abs(net) / maxAbs) * 100;
          const isPos = net >= 0;
          const isSpot = Math.abs((s.strike ?? 0) - spot) < (spot * 0.005);
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: isSpot ? 'rgba(99,102,241,0.06)' : undefined,
              borderRadius: 3, padding: '1px 4px',
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, minWidth: 48, color: isSpot ? 'var(--accent)' : 'var(--muted)', fontWeight: isSpot ? 700 : 400 }}>
                {s.strike}
              </span>
              <div style={{ flex: 1, height: 12, display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: `${pct}%`, height: 8, borderRadius: 2,
                  background: isPos ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)',
                  minWidth: pct > 0 ? 1 : 0,
                }} />
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: isPos ? 'var(--green)' : 'var(--red)', minWidth: 60, textAlign: 'right' }}>
                {fmtGex(net)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function VolSkewChart({ data, ticker }: { data: any; ticker: string }) {
  // data: {spot_price, atm_iv (already %), skew_25d, expiry, strikes: [{strike, call_iv (%), put_iv (%)}]}
  const strikes: any[] = data.strikes ?? [];
  if (!strikes.length) return (
    <Card title={`${ticker} Vol Skew`}>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>No skew data.</p>
    </Card>
  );

  const spot = data.spot_price ?? data.spot ?? 0;
  const atmIv = data.atm_iv ?? null;          // already in % (e.g. 51.7 means 51.7%)
  const skewSlope = data.skew_25d ?? null;

  const W = 560, H = 180;
  const M = { top: 16, right: 16, bottom: 32, left: 52 };
  const iW = W - M.left - M.right;
  const iH = H - M.top - M.bottom;

  // Use mid_iv or call_iv/put_iv
  const validPts = strikes.filter(s => (s.mid_iv ?? s.call_iv ?? s.put_iv) != null);
  if (!validPts.length) return (
    <Card title={`${ticker} Vol Skew`}>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>No IV data in strikes.</p>
    </Card>
  );

  const xs = validPts.map(s => s.strike);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const midIvs = validPts.map(s => s.mid_iv ?? ((s.call_iv ?? 0) + (s.put_iv ?? 0)) / 2);
  const callIvs = validPts.map(s => s.call_iv);
  const putIvs  = validPts.map(s => s.put_iv);
  const allIvs  = [...midIvs, ...callIvs.filter(Boolean), ...putIvs.filter(Boolean)] as number[];
  const yLo = Math.max(0, Math.min(...allIvs) * 0.9);
  const yHi = Math.max(...allIvs) * 1.1;

  const toX = (v: number) => M.left + ((v - xMin) / (xMax - xMin || 1)) * iW;
  const toY = (v: number) => M.top + (1 - (v - yLo) / (yHi - yLo)) * iH;

  const mkLine = (ivArr: (number | null)[]) =>
    validPts
      .map((s, i) => ivArr[i] != null ? `${toX(s.strike).toFixed(1)},${toY(ivArr[i] as number).toFixed(1)}` : null)
      .filter(Boolean).join(' ');

  const midLine  = mkLine(midIvs);
  const callLine = mkLine(callIvs);
  const putLine  = mkLine(putIvs);
  const xSpot    = toX(spot);

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(t => xMin + t * (xMax - xMin));
  const yTicks = [0, 0.33, 0.67, 1].map(t => yLo + t * (yHi - yLo));

  return (
    <Card title={`${ticker} Vol Skew${data.expiry ? ` — ${data.expiry}` : ''}`}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {atmIv != null && <KVChip label="ATM IV" value={`${atmIv.toFixed(1)}%`} color="var(--accent)" />}
        {skewSlope != null && <KVChip label="25d Skew" value={`${skewSlope > 0 ? '+' : ''}${skewSlope.toFixed(1)}pp`} color={skewSlope > 0 ? 'var(--red)' : 'var(--muted)'} />}
        {spot > 0 && <KVChip label="Spot" value={`$${spot.toFixed(0)}`} color="var(--muted)" />}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        {callLine && <span style={{ fontSize: 11, color: 'rgba(34,197,94,0.9)' }}>■ Call IV</span>}
        {putLine  && <span style={{ fontSize: 11, color: 'rgba(239,68,68,0.9)'  }}>■ Put IV</span>}
        {midLine  && <span style={{ fontSize: 11, color: '#38bdf8' }}>■ Mid IV</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200, display: 'block' }}>
        <rect x={M.left} y={M.top} width={iW} height={iH} fill="rgba(0,0,0,0.12)" rx={3} />
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={M.left} x2={M.left + iW} y1={toY(v)} y2={toY(v)} stroke="var(--border)" strokeWidth={0.5} opacity={0.6} />
            <text x={M.left - 4} y={toY(v) + 4} textAnchor="end" fill="var(--muted)" fontSize={9}>{v.toFixed(0)}%</text>
          </g>
        ))}
        {/* Spot line */}
        {xSpot >= M.left && xSpot <= M.left + iW && (
          <line x1={xSpot} x2={xSpot} y1={M.top} y2={H - M.bottom} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
        )}
        {/* Call IV */}
        {callLine && <polyline points={callLine} fill="none" stroke="rgba(34,197,94,0.75)" strokeWidth={1.5} />}
        {/* Put IV */}
        {putLine  && <polyline points={putLine}  fill="none" stroke="rgba(239,68,68,0.75)"  strokeWidth={1.5} />}
        {/* Mid IV */}
        {midLine  && <polyline points={midLine}  fill="none" stroke="#38bdf8" strokeWidth={2} />}
        {/* X ticks */}
        {xTicks.map((v, i) => (
          <text key={i} x={toX(v)} y={H - M.bottom + 12} textAnchor="middle" fill="var(--muted)" fontSize={9}>${v.toFixed(0)}</text>
        ))}
      </svg>
    </Card>
  );
}


function VolSkewSvg({ puts, calls, spot }: { puts: any[]; calls: any[]; spot: number }) {
  const all  = [...puts, ...calls];
  if (!all.length) return null;

  const W = 600, H = 220;
  const M = { top: 16, right: 16, bottom: 32, left: 52 };
  const iW = W - M.left - M.right;
  const iH = H - M.top - M.bottom;

  const xs   = all.map(r => r.strike);
  const ivs  = all.map(r => r.iv);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yLo  = Math.max(0, Math.min(...ivs) * 0.9);
  const yHi  = Math.max(...ivs) * 1.1;

  const toX = (v: number) => M.left + ((v - xMin) / (xMax - xMin || 1)) * iW;
  const toY = (v: number) => M.top  + (1 - (v - yLo) / (yHi - yLo)) * iH;

  const mkLine = (pts: any[]) =>
    pts.sort((a, b) => a.strike - b.strike)
       .map(r => `${toX(r.strike).toFixed(1)},${toY(r.iv).toFixed(1)}`)
       .join(' ');

  const putLine  = mkLine(puts);
  const callLine = mkLine(calls);
  const xSpot    = toX(spot);
  const yTicks   = [0, 0.33, 0.67, 1].map(t => yLo + t * (yHi - yLo));
  const xTicks   = [0, 0.25, 0.5, 0.75, 1].map(t => xMin + t * (xMax - xMin));

  // ATM IV at spot
  const atmPut  = [...puts].sort((a,b) => Math.abs(a.strike-spot) - Math.abs(b.strike-spot))[0];
  const atmCall = [...calls].sort((a,b) => Math.abs(a.strike-spot) - Math.abs(b.strike-spot))[0];

  return (
    <>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'rgba(239,68,68,0.9)' }}>■ Put IV</span>
        <span style={{ fontSize: 11, color: 'rgba(34,197,94,0.9)' }}>■ Call IV</span>
        {atmPut  && <span style={{ fontSize: 11, color: 'var(--muted)' }}>ATM Put {atmPut.iv.toFixed(1)}%</span>}
        {atmCall && <span style={{ fontSize: 11, color: 'var(--muted)' }}>ATM Call {atmCall.iv.toFixed(1)}%</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220, display: 'block' }}>
        <rect x={M.left} y={M.top} width={iW} height={iH} fill="rgba(0,0,0,0.12)" rx={3} />
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={M.left} x2={M.left+iW} y1={toY(v)} y2={toY(v)} stroke="var(--border)" strokeWidth={0.5} opacity={0.6} />
            <text x={M.left-4} y={toY(v)+4} textAnchor="end" fill="var(--muted)" fontSize={9}>{v.toFixed(0)}%</text>
          </g>
        ))}
        {xSpot >= M.left && xSpot <= M.left+iW && (
          <g>
            <line x1={xSpot} x2={xSpot} y1={M.top} y2={H-M.bottom} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.75} />
            <text x={xSpot+4} y={M.top+11} fill="var(--accent)" fontSize={9} fontWeight="600">${spot.toFixed(0)}</text>
          </g>
        )}
        {putLine  && <polyline points={putLine}  fill="none" stroke="rgba(239,68,68,0.8)"  strokeWidth={2} />}
        {callLine && <polyline points={callLine} fill="none" stroke="rgba(34,197,94,0.8)"  strokeWidth={2} />}
        {xTicks.map((v, i) => (
          <text key={i} x={toX(v)} y={H-M.bottom+12} textAnchor="middle" fill="var(--muted)" fontSize={9}>${v.toFixed(0)}</text>
        ))}
      </svg>
    </>
  );
}

function fmtGex(v: number): string {
  if (v == null) return '—';
  const abs = Math.abs(v);
  const sign = v >= 0 ? '+' : '-';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function KVChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 14px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}

// ─── QuantData Tab ────────────────────────────────────────────────────────────

const QD_CATEGORIES: { label: string; tools: string[] }[] = [
  { label: 'Volatility',  tools: ['iv_rank','volatility_skew','volatility_drift','term_structure','net_drift'] },
  { label: 'Flow',        tools: ['order_flow','net_flow','dark_pool_levels','unconsolidated_flow','trade_side_stats'] },
  { label: 'Exposure',    tools: ['exposure_by_strike','exposure_by_expiration','oi_by_strike','oi_by_expiration','oi_change','oi_over_time'] },
  { label: 'Max Pain',    tools: ['max_pain','max_pain_over_time'] },
  { label: 'Market',      tools: ['market_snapshot','gainers_losers','heat_map','interval_map','get_news_articles'] },
  { label: 'Price',       tools: ['contract_price','contract_statistics','stock_price_time','get_equity_prints'] },
];

const BROKEN_TOOLS = new Set(['exposure_by_strike','volatility_skew']);

function QuantDataTab({ qd, universe }: { qd: any; universe: string[] }) {
  const toolNames: Set<string> = new Set(
    (qd?.all_tools_in_config ?? []).map((t: any) => t.name as string)
  );
  const toolCount = qd?.config_tool_count ?? toolNames.size ?? 0;
  const connected = toolCount > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Status bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? 'var(--green)' : 'var(--red)',
            display: 'inline-block', flexShrink: 0,
            boxShadow: connected ? '0 0 6px var(--green)' : undefined,
          }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {connected ? 'QuantData Connected' : 'QuantData Offline'}
          </span>
        </div>
        {connected && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '14px 20px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Tools</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace' }}>{toolCount}</div>
          </div>
        )}
        {qd?.config_paths_checked?.[0] && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '14px 20px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Config</div>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)' }}>
              {qd.config_paths_checked[0].replace('/home/ubuntu','~').replace('/root','/root')}
            </div>
          </div>
        )}
      </div>

      {/* IV Rank signal board — primary content */}
      {connected && <IvRankSection universe={universe} />}

      {/* Known issues callout */}
      <div style={{
        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: 10, padding: '14px 16px',
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <span style={{ color: 'var(--red)', fontSize: 16, flexShrink: 0 }}>⚠</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Known issues</div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            <code style={{ fontFamily: 'monospace' }}>exposure_by_strike</code> and{' '}
            <code style={{ fontFamily: 'monospace' }}>volatility_skew</code> return no options data during
            market hours (price resolves, options layer empty). GitHub issue pending on quantdata-mcp.
          </p>
        </div>
      </div>

      {/* Live data hint */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '14px 16px',
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>💬</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Query via Claude</div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            Live QuantData signals (IV rank, order flow, dark pool, max pain) are available through Claude.
            Try: <em>"What's the IV rank for MSFT?"</em> or <em>"Show me SPX order flow."</em>
          </p>
        </div>
      </div>

    </div>
  );
}

// ─── Earnings Table ───────────────────────────────────────────────────────────

function EarningsTable({ cal }: { cal: any }) {
  const rawRows = Object.entries(cal?.tickers ?? {}).map(([ticker, e]: any) => ({
    ticker,
    next_earnings: e.next_earnings ?? null,
    days_to_earnings: e.days_to_earnings ?? null,
    status: e.status ?? null,
    notes: e.notes ?? null,
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
            const statusColor = e.status === 'blackout' ? 'var(--red)' : e.status === 'warning' ? 'var(--yellow)' : 'var(--green)';
            const statusBg   = e.status === 'blackout' ? 'rgba(239,68,68,0.1)' : e.status === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)';
            return (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{e.ticker}</td>
                <td className="mono">{e.next_earnings ?? '—'}</td>
                <td className="text-right mono" style={{ color: (e.days_to_earnings ?? 99) < 14 ? 'var(--yellow)' : 'var(--muted)' }}>
                  {e.days_to_earnings != null ? `${e.days_to_earnings}d` : '—'}
                </td>
                <td>
                  {e.status && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: statusBg, color: statusColor, fontWeight: 600, textTransform: 'uppercase' }}>
                      {e.status}
                    </span>
                  )}
                </td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{e.notes ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── IV Rank Section ──────────────────────────────────────────────────────────

type IvState = { status: 'idle' | 'loading' | 'ok' | 'error'; data?: IvRankData; error?: string };
type IvrCache = IvRankData & { cached_at: string };

const IVR_CACHE_KEY = (t: string) => `ivr_cache:${t}`;

function saveIvrCache(ticker: string, data: IvRankData) {
  // Only cache when we have live IV rank
  if (data.iv_rank == null && data.current_iv == null) return;
  try {
    localStorage.setItem(IVR_CACHE_KEY(ticker), JSON.stringify({ ...data, cached_at: new Date().toISOString() }));
  } catch {}
}

function loadIvrCache(ticker: string): IvrCache | null {
  try {
    const raw = localStorage.getItem(IVR_CACHE_KEY(ticker));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function fmtCacheAge(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function IvRankSection({ universe }: { universe: string[] }) {
  const [rows, setRows] = useState<Record<string, IvState>>({});
  const [fetching, setFetching] = useState(false);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadAll = useCallback(async () => {
    if (!universe.length) return;
    setFetching(true);
    const init: Record<string, IvState> = {};
    universe.forEach(t => { init[t] = { status: 'loading' }; });
    setRows(init);

    await Promise.allSettled(
      universe.map(async ticker => {
        try {
          const data = await getIvRank(ticker);
          saveIvrCache(ticker, data);
          setRows(prev => ({ ...prev, [ticker]: { status: 'ok', data } }));
        } catch (e: any) {
          setRows(prev => ({ ...prev, [ticker]: { status: 'error', error: String(e) } }));
        }
      })
    );
    setFetching(false);
  }, [universe]);

  // Auto-load on mount when universe is available
  useEffect(() => { if (universe.length) loadAll(); }, [universe.length]);

  const hasData = Object.values(rows).some(r => r.status === 'ok' || r.status === 'error');

  // Merge live data with cache fallback per ticker
  const merged = useMemo(() => {
    const result: Record<string, { data: IvRankData; fromCache: boolean; cacheLabel?: string }> = {};
    for (const ticker of universe) {
      const row = rows[ticker];
      if (!row || row.status === 'loading' || row.status === 'error') {
        const cached = loadIvrCache(ticker);
        if (cached) result[ticker] = { data: cached, fromCache: true, cacheLabel: fmtCacheAge(cached.cached_at) };
        continue;
      }
      const live = row.data!;
      // If live has iv_rank, use fully live; otherwise merge with cache for null fields
      if (live.iv_rank != null) {
        result[ticker] = { data: live, fromCache: false };
      } else {
        const cached = loadIvrCache(ticker);
        if (cached) {
          // Overlay cached values where live is null
          const merged: IvRankData = {
            ticker: live.ticker,
            session_date: live.session_date,
            iv_rank:    live.iv_rank    ?? cached.iv_rank,
            current_iv: live.current_iv ?? cached.current_iv,
            iv_52w_high: live.iv_52w_high ?? cached.iv_52w_high,
            iv_52w_low:  live.iv_52w_low  ?? cached.iv_52w_low,
            call_iv:    live.call_iv    ?? cached.call_iv,
            put_iv:     live.put_iv     ?? cached.put_iv,
          };
          result[ticker] = { data: merged, fromCache: true, cacheLabel: fmtCacheAge(cached.cached_at) };
        } else {
          result[ticker] = { data: live, fromCache: false };
        }
      }
    }
    return result;
  }, [universe, rows]);

  const anyCache = Object.values(merged).some(r => r.fromCache);

  // Sort by effective IVR (live or cached)
  const sortedUniverse = useMemo(() => {
    return [...universe].sort((a, b) => {
      const ar = merged[a]?.data?.iv_rank ?? -1;
      const br = merged[b]?.data?.iv_rank ?? -1;
      return sortDir === 'desc' ? br - ar : ar - br;
    });
  }, [universe, merged, sortDir]);

  const showTable = hasData || Object.keys(merged).length > 0;

  return (
    <Card title="IV Rank — Universe" action={
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {anyCache && (
          <span style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>
            ⏱ cached
          </span>
        )}
        <button
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--muted)', fontSize: 11, padding: '3px 10px' }}
        >
          IVR {sortDir === 'desc' ? '▼' : '▲'}
        </button>
        <button
          onClick={loadAll}
          disabled={fetching || !universe.length}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--muted)', fontSize: 11, padding: '3px 10px' }}
        >
          {fetching ? '…' : '↻ Refresh'}
        </button>
      </div>
    }>
      {!showTable && fetching && (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading {universe.length} tickers…</p>
      )}
      {!showTable && !fetching && (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          {universe.length ? `${universe.length} tickers in universe — loading…` : 'Universe not loaded.'}
        </p>
      )}
      {showTable && (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>
              <th>Ticker</th>
              <th className="text-right" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}>
                IV Rank {sortDir === 'desc' ? '▼' : '▲'}
              </th>
              <th className="text-right">Current IV</th>
              <th className="text-right">52w High</th>
              <th className="text-right">52w Low</th>
              <th className="text-right">Call IV</th>
              <th className="text-right">Put IV</th>
            </tr></thead>
            <tbody>
              {sortedUniverse.map(ticker => {
                const row = rows[ticker];
                if (row?.status === 'loading') {
                  const c = loadIvrCache(ticker);
                  if (!c) return (
                    <tr key={ticker}>
                      <td style={{ fontWeight: 600 }}>{ticker}</td>
                      <td colSpan={6} style={{ color: 'var(--muted)', fontSize: 12 }}>loading…</td>
                    </tr>
                  );
                }
                if (row?.status === 'error' && !merged[ticker]) {
                  return (
                    <tr key={ticker}>
                      <td style={{ fontWeight: 600 }}>{ticker}</td>
                      <td colSpan={6} style={{ color: 'var(--red)', fontSize: 12 }}>{row.error}</td>
                    </tr>
                  );
                }
                const m = merged[ticker];
                if (!m) return null;
                const d = m.data;
                const ivr = d.iv_rank;
                const ivrColor = ivr == null ? 'var(--muted)'
                  : ivr >= 50 ? 'var(--green)' : ivr >= 25 ? 'var(--yellow)' : 'var(--muted)';
                const bias = d.call_iv != null && d.put_iv != null
                  ? d.call_iv > d.put_iv ? '↑ call' : d.put_iv > d.call_iv ? '↓ put' : '='
                  : null;
                const biasColor = bias === '↑ call' ? 'var(--green)' : bias === '↓ put' ? 'var(--red)' : 'var(--muted)';
                return (
                  <tr key={ticker} style={{ opacity: m.fromCache ? 0.75 : 1 }}>
                    <td style={{ fontWeight: 600 }}>
                      {ticker}
                      {m.fromCache && m.cacheLabel && (
                        <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--muted)', fontWeight: 400 }}>
                          {m.cacheLabel}
                        </span>
                      )}
                    </td>
                    <td className="text-right mono" style={{ color: ivrColor, fontWeight: 600 }}>
                      {ivr != null ? ivr.toFixed(1) : '—'}
                      {ivr != null && ivr >= 25 && <span style={{ marginLeft: 4, fontSize: 10 }}>✓</span>}
                    </td>
                    <td className="text-right mono">{d.current_iv != null ? d.current_iv.toFixed(1) + '%' : '—'}</td>
                    <td className="text-right mono" style={{ color: 'var(--muted)' }}>{d.iv_52w_high != null ? d.iv_52w_high.toFixed(1) + '%' : '—'}</td>
                    <td className="text-right mono" style={{ color: 'var(--muted)' }}>{d.iv_52w_low != null ? d.iv_52w_low.toFixed(1) + '%' : '—'}</td>
                    <td className="text-right mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{d.call_iv != null ? d.call_iv.toFixed(1) + '%' : '—'}</td>
                    <td className="text-right mono" style={{ fontSize: 12, color: biasColor }}>{d.put_iv != null ? d.put_iv.toFixed(1) + '%' : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
            IV Rank ≥ 25 required for new entries (✓). ≥ 50 = prime entry zone.
            {anyCache && ' · Faded rows show last cached close values.'}
          </p>
        </div>
      )}
    </Card>
  );
}

// ─── KV chip ──────────────────────────────────────────────────────────────────

function KV({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 20px', minWidth: 120,
    }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--text)', fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}
