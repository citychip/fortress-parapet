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

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [i, c, q] = await Promise.allSettled([
        getMarketIntel(), getCalendar(), getQuantDataReports(),
      ]);
      if (i.status === 'fulfilled') setIntel(i.value);
      if (c.status === 'fulfilled') setCal(c.value);
      if (q.status === 'fulfilled') setQd(q.value);
      if (i.status === 'rejected') setError(String(i.reason));
      setUpdatedAt(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      {tab === 'quantdata' && (
        <Card title="QuantData Reports">
          {!qd ? (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>No QuantData reports available.</p>
          ) : (
            <pre style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-wrap', maxHeight: 600, overflow: 'auto' }}>
              {JSON.stringify(qd, null, 2)}
            </pre>
          )}
        </Card>
      )}
    </Layout>
  );
}

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
