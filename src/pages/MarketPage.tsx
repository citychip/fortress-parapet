import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { TabBar } from '../components/Tabs';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { getMarketIntel, getCalendar, fetchEarnings, getQuantDataReports } from '../lib/api';

export default function MarketPage() {
  const [tab, setTab]           = useState('intel');
  const [intel, setIntel]       = useState<any>(null);
  const [cal, setCal]           = useState<any>(null);
  const [qd, setQd]             = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const [i, c, q] = await Promise.allSettled([
        getMarketIntel(), getCalendar(), getQuantDataReports(),
      ]);
      if (i.status === 'fulfilled') setIntel(i.value);
      if (c.status === 'fulfilled') setCal(c.value);
      if (q.status === 'fulfilled') setQd(q.value);
      if (i.status === 'rejected') setError(String(i.reason));
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
    { key: 'intel',    label: 'Market Intel' },
    { key: 'calendar', label: 'Earnings Calendar' },
    { key: 'quantdata', label: 'QuantData' },
  ];

  return (
    <Layout title="Market" onRefresh={load} loading={loading} lastUpdated={updatedAt}>
      {loading && !intel && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={32} />
        </div>
      )}
      {error && <ErrorBanner msg={error} onRetry={load} />}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* MARKET INTEL */}
      {tab === 'intel' && intel && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Key stats bar */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {intel.current_price && <KV label="SPY" value={`$${intel.current_price}`} />}
            {intel.regime?.overall && (
              <KV label="Regime" value={intel.regime.overall}
                color={(intel.regime.score ?? 0) > 0 ? 'var(--green)' : (intel.regime.score ?? 0) < 0 ? 'var(--red)' : 'var(--muted)'}
              />
            )}
            {intel.dp_floor && <KV label="DP Floor" value={`$${intel.dp_floor}`} />}
            {intel.gex_call_wall && <KV label="GEX Call Wall" value={`$${intel.gex_call_wall}`} />}
            {intel.gex_put_wall && <KV label="GEX Put Wall" value={`$${intel.gex_put_wall}`} />}
            {intel.flip_level && <KV label="Flip Level" value={`$${intel.flip_level}`} />}
          </div>

          {/* Regime signals */}
          {Array.isArray(intel.regime?.signals) && intel.regime.signals.length > 0 && (
            <Card title="Regime Signals">
              {intel.regime.signals.map((s: any, i: number) => (
                <div key={i} style={{
                  padding: '10px 12px', marginBottom: 8, borderRadius: 6,
                  background: 'var(--surface2)',
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

          {/* Other scalar fields */}
          {(() => {
            const skip = new Set(['as_of','ticker','session_date','current_price','regime','dp_floor','gex_call_wall','gex_put_wall','flip_level','gamma_regime']);
            const rest = Object.entries(intel).filter(([k, v]) =>
              !skip.has(k) && v != null && typeof v !== 'object'
            );
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
        </div>
      )}

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
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr>
                  <th>Ticker</th><th>Next Earnings</th><th className="text-right">DTE</th><th>Status</th><th>Notes</th>
                </tr></thead>
                <tbody>
                  {Object.entries(cal?.tickers ?? {})
                    .sort(([,a]: any, [,b]: any) => (a.days_to_earnings ?? 999) - (b.days_to_earnings ?? 999))
                    .map(([ticker, e]: any, i: number) => {
                      const statusColor = e.status === 'blackout' ? 'var(--red)' : e.status === 'warning' ? 'var(--yellow)' : 'var(--green)';
                      const statusBg   = e.status === 'blackout' ? 'rgba(239,68,68,0.1)' : e.status === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)';
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{ticker}</td>
                          <td className="mono">{e.next_earnings ?? '—'}</td>
                          <td className="text-right mono" style={{ color: (e.days_to_earnings ?? 99) < 14 ? 'var(--yellow)' : 'var(--muted)' }}>
                            {e.days_to_earnings ?? '—'}d
                          </td>
                          <td>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: statusBg, color: statusColor, fontWeight: 600, textTransform: 'uppercase' }}>
                              {e.status ?? '—'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--muted)', fontSize: 12 }}>{e.notes ?? '—'}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* QUANTDATA */}
      {tab === 'quantdata' && <QuantDataTab qd={qd} />}
    </Layout>
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

function QuantDataTab({ qd }: { qd: any }) {
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

      {/* Tool capabilities grid */}
      {connected && (
        <Card title="Tool Capabilities">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {QD_CATEGORIES.map(cat => {
              const present = cat.tools.filter(t => toolNames.size === 0 || toolNames.has(t));
              if (present.length === 0) return null;
              return (
                <div key={cat.label}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    {cat.label}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {present.map(tool => {
                      const broken = BROKEN_TOOLS.has(tool);
                      return (
                        <span key={tool} style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 20,
                          fontFamily: 'monospace',
                          background: broken ? 'rgba(239,68,68,0.08)' : 'rgba(99,102,241,0.1)',
                          color: broken ? 'var(--red)' : 'var(--accent)',
                          border: `1px solid ${broken ? 'rgba(239,68,68,0.25)' : 'rgba(99,102,241,0.25)'}`,
                          opacity: broken ? 0.7 : 1,
                        }}>
                          {broken ? '⚠ ' : ''}{tool.replace(/_/g, '_')}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Uncategorised tools */}
            {toolNames.size > 0 && (() => {
              const all = QD_CATEGORIES.flatMap(c => c.tools);
              const extra = [...toolNames].filter(t => !all.includes(t));
              if (!extra.length) return null;
              return (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Other</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {extra.map(tool => (
                      <span key={tool} style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 20, fontFamily: 'monospace',
                        background: 'rgba(99,102,241,0.1)', color: 'var(--accent)',
                        border: '1px solid rgba(99,102,241,0.25)',
                      }}>{tool}</span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </Card>
      )}

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
