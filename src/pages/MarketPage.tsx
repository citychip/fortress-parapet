import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useSortable, SortTh } from '../components/Sortable';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { TabBar } from '../components/Tabs';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { getCalendar, fetchEarnings, getQuantDataReports, getUniverse, getIvRank, getGex, getVolSkew, getVolAnalytics, getEarningsVolatility, type IvRankData } from '../lib/api';
import { UniverseSection } from '../components/system/UniverseSection';

// Recharts (~688KB) is only needed for the Analytics tab — lazy-load it
// so it's split into its own chunk and not part of the main bundle.
const GexChart    = lazy(() => import('../components/AnalyticsCharts').then(m => ({ default: m.GexChart })));
const VolSkewChart = lazy(() => import('../components/AnalyticsCharts').then(m => ({ default: m.VolSkewChart })));
const VolSkewSvg  = lazy(() => import('../components/AnalyticsCharts').then(m => ({ default: m.VolSkewSvg })));

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
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={24} /></div>}>
          {gexData && <GexChart data={gexData} ticker={ticker} />}
          {skewData && <VolSkewChart data={skewData} ticker={ticker} />}
          {!loading && !err && !gexData && !skewData && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 60 }}>No GEX / skew data available.</p>
          )}
        </Suspense>
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
                  <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={24} /></div>}>
                    <VolSkewSvg puts={skewPuts} calls={skewCalls} spot={volData.spot} />
                  </Suspense>
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

type EarnVolEntry = { implied: number | null; avg: number | null };

function crushRisk(implied: number | null, avg: number | null): { label: string; color: string; bg: string } | null {
  if (implied == null || avg == null) return null;
  const diff = implied - avg;
  if (diff >= 5) return { label: 'PRIME CRUSH', color: 'var(--red)', bg: 'rgba(239,68,68,0.1)' };
  if (diff >= 2) return { label: 'ELEVATED', color: 'var(--yellow)', bg: 'rgba(245,158,11,0.1)' };
  return { label: 'NORMAL', color: 'var(--green)', bg: 'rgba(34,197,94,0.1)' };
}

function EarningsTable({ cal }: { cal: any }) {
  const rawRows = Object.entries(cal?.tickers ?? {}).map(([ticker, e]: any) => ({
    ticker,
    next_earnings: e.next_earnings ?? null,
    days_to_earnings: e.days_to_earnings ?? null,
    status: e.status ?? null,
    notes: e.notes ?? null,
  }));
  const { sorted, key, dir, toggle } = useSortable(rawRows, 'days_to_earnings', 'asc');

  // Background fetch of expected move / IV crush risk for upcoming earnings
  const [earnVol, setEarnVol] = useState<Map<string, EarnVolEntry>>(new Map());
  useEffect(() => {
    const upcoming = rawRows.filter(r => r.status !== 'no_earnings' && r.status !== 'past' && r.ticker);
    if (!upcoming.length) return;
    let cancelled = false;
    Promise.allSettled(upcoming.map(r => getEarningsVolatility(r.ticker).then(d => ({ ticker: r.ticker, d }))))
      .then(results => {
        if (cancelled) return;
        const m = new Map<string, EarnVolEntry>();
        for (const res of results) {
          if (res.status === 'fulfilled') {
            const { ticker, d } = res.value as any;
            m.set(ticker, { implied: d?.implied_move_pct ?? null, avg: d?.avg_historical_pct ?? null });
          }
        }
        setEarnVol(m);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cal]);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead><tr>
          <SortTh label="Ticker"        sortKey="ticker"           activeKey={key} dir={dir} onToggle={toggle} />
          <SortTh label="Next Earnings" sortKey="next_earnings"    activeKey={key} dir={dir} onToggle={toggle} />
          <SortTh label="DTE"           sortKey="days_to_earnings" activeKey={key} dir={dir} onToggle={toggle} align="right" />
          <SortTh label="Status"        sortKey="status"           activeKey={key} dir={dir} onToggle={toggle} />
          <th className="text-right">Expected Move</th>
          <th>IV Crush Risk</th>
          <th>Notes</th>
        </tr></thead>
        <tbody>
          {sorted.map((e, i) => {
            const statusColor = e.status === 'blackout' ? 'var(--red)' : e.status === 'warning' ? 'var(--yellow)' : 'var(--green)';
            const statusBg   = e.status === 'blackout' ? 'rgba(239,68,68,0.1)' : e.status === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)';
            const ev = earnVol.get(e.ticker);
            const risk = ev ? crushRisk(ev.implied, ev.avg) : null;
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
                <td className="text-right mono">
                  {(e.status === 'no_earnings' || e.status === 'past') ? '—' : !ev ? (
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>…</span>
                  ) : (ev.implied == null && ev.avg == null) ? (
                    <span style={{ color: 'var(--muted)' }}>—</span>
                  ) : (
                    <>
                      {ev.implied != null && <span style={{ color: 'var(--accent)' }}>±{ev.implied.toFixed(1)}%</span>}
                      {ev.avg != null && (
                        <span style={{ color: 'var(--muted)', marginLeft: ev.implied != null ? 6 : 0, fontSize: 11 }}>
                          {ev.implied != null ? 'avg ' : ''}±{ev.avg.toFixed(1)}%
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td>
                  {risk && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: risk.bg, color: risk.color, fontWeight: 600, textTransform: 'uppercase' }}>
                      {risk.label}
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