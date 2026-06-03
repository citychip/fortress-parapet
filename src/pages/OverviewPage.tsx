import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import StatRow from '../components/StatRow';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { getBriefing, getIbkrStatus, getAlerts, getPositions, fmt$, fmtDelta, type BriefingData, type IbkrStatusData, type AlertData, type PositionData } from '../lib/api';

export default function OverviewPage() {
  const [briefing, setBriefing]   = useState<BriefingData | null>(null);
  const [ibkr, setIbkr]           = useState<IbkrStatusData | null>(null);
  const [alerts, setAlerts]       = useState<AlertData[]>([]);
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const [b, i, a, p] = await Promise.allSettled([
        getBriefing(), getIbkrStatus(), getAlerts(), getPositions(),
      ]);
      if (b.status === 'fulfilled') setBriefing(b.value);
      if (i.status === 'fulfilled') setIbkr(i.value);
      if (a.status === 'fulfilled') setAlerts(a.value?.alerts ?? []);
      if (p.status === 'fulfilled') setPositions(p.value?.positions ?? []);
      if (b.status === 'rejected') setError(String(b.reason));
      setUpdatedAt(new Date().toISOString());
    } catch (e: any) {
      setError(String(e));
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 seconds (silent background poll)
  useEffect(() => {
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const nlv     = briefing?.account?.net_liq;
  const avail   = briefing?.account?.available_funds;
  const vix     = briefing?.macro_regime?.vix;
  const regime  = briefing?.macro_regime?.regime ?? '—';
  const pacingObj = briefing?.pacing;
  const pacing  = pacingObj ? `${pacingObj.used ?? 0}/${pacingObj.max_per_week ?? 5}` : '—';

  const totalDelta = briefing?.greeks?.portfolio_delta ?? positions.reduce((sum, p) => sum + (p.current_delta ?? 0), 0);
  const ibkrOk  = ibkr?.web_api?.session_status?.authenticated;

  const activeAlerts = alerts.filter(a => a.state !== 'ok' && a.state !== 'safe');

  const nearExpiry = positions
    .map(p => ({ ...p, _dte: p.expiry ? Math.ceil((new Date(p.expiry).getTime() - Date.now()) / 86400000) : null }))
    .filter(p => p._dte != null && p._dte <= 14)
    .sort((a, b) => (a._dte ?? 99) - (b._dte ?? 99));

  const deltaColor = Math.abs(totalDelta) > 1000 ? 'var(--yellow)' :
                     totalDelta >= 0 ? 'var(--green)' : 'var(--red)';
  const vixColor   = !vix ? undefined : vix > 30 ? 'var(--red)' : vix > 20 ? 'var(--yellow)' : 'var(--green)';

  return (
    <Layout title="Overview" onRefresh={load} loading={loading} lastUpdated={updatedAt}>
      {loading && !briefing && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={32} />
        </div>
      )}
      {error && <ErrorBanner msg={error} onRetry={load} />}

      {briefing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Top stat bar */}
          <StatRow stats={[
            { label: 'Net Liq',   value: fmt$(nlv),   color: 'var(--text)' },
            { label: 'Available', value: fmt$(avail),  color: 'var(--muted)' },
            { label: 'Δ portfolio', value: totalDelta != null ? String(Math.round(totalDelta)) : '—', color: deltaColor, mono: true },
            { label: 'VIX',       value: vix?.toFixed(2) ?? '—', color: vixColor },
            { label: 'Regime',    value: String(regime).toUpperCase(), color: 'var(--muted)' },
            { label: 'Pacing',    value: String(pacing) },
          ]} />

          {/* Near-expiry banner */}
          {nearExpiry.length > 0 && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: nearExpiry[0]._dte! <= 7 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.06)',
              border: `1px solid ${nearExpiry[0]._dte! <= 7 ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.25)'}`,
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap',
            }}>
              <span style={{ color: nearExpiry[0]._dte! <= 7 ? 'var(--red)' : 'var(--yellow)', fontWeight: 600 }}>
                {nearExpiry[0]._dte! <= 7 ? '⚠ Expiring soon:' : 'Near expiry:'}
              </span>
              {nearExpiry.map(p => (
                <span key={p.ticker + p.expiry} style={{
                  fontFamily: 'monospace', fontSize: 12, padding: '2px 8px', borderRadius: 4,
                  background: p._dte! <= 7 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)',
                  color: p._dte! <= 7 ? 'var(--red)' : 'var(--yellow)', fontWeight: 600,
                }}>{p.ticker} {p._dte}d</span>
              ))}
            </div>
          )}

          {/* Alerts */}
          {activeAlerts.length > 0 && (
            <Card title={`⚠ Active Alerts (${activeAlerts.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeAlerts.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px',
                    background: 'var(--surface2)',
                    borderRadius: 6,
                    borderLeft: `3px solid ${a.state === 'act' ? 'var(--red)' : 'var(--yellow)'}`,
                  }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{a.message ?? a.ticker ?? JSON.stringify(a)}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                      color: a.state === 'act' ? 'var(--red)' : 'var(--yellow)',
                    }}>{a.state}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Positions summary — group legs by ticker */}
          {(() => {
            // Group raw legs by ticker, pick worst alert_state and sum net_liq_pct
            const grouped: Record<string, any> = {};
            for (const p of positions) {
              const t = p.ticker;
              if (!grouped[t]) {
                grouped[t] = { ...p, _legs: [p] };
              } else {
                grouped[t]._legs.push(p);
                // accumulate net_liq_pct
                if (p.net_liq_pct != null)
                  grouped[t].net_liq_pct = (grouped[t].net_liq_pct ?? 0) + p.net_liq_pct;
                // keep worst alert state
                if (p.alert_state === 'act') grouped[t].alert_state = 'act';
                else if (p.alert_state === 'watch' && grouped[t].alert_state !== 'act')
                  grouped[t].alert_state = 'watch';
                // keep highest absolute delta leg as representative
                if (p.current_delta != null &&
                    Math.abs(p.current_delta) > Math.abs(grouped[t].current_delta ?? 0))
                  grouped[t].current_delta = p.current_delta;
                // use shortest expiry
                if (p.expiry && (!grouped[t].expiry || p.expiry < grouped[t].expiry))
                  grouped[t].expiry = p.expiry;
              }
            }
            const rows = Object.values(grouped);
            return (
            <Card title={`Positions (${rows.length})`}>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Legs</th>
                    <th>Next Expiry</th>
                    <th className="text-right">Delta</th>
                    <th className="text-right">NLV%</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p: any, i: number) => {
                    const deltaWarn = p.current_delta && Math.abs(p.current_delta) > 0.4;
                    const daysToExp = p.expiry
                      ? Math.ceil((new Date(p.expiry).getTime() - Date.now()) / 86400000)
                      : null;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{p.ticker}</td>
                        <td style={{ color: 'var(--muted)' }}>{p._legs.length}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {p.expiry ?? '—'}
                          {daysToExp != null && (
                            <span style={{ color: daysToExp < 14 ? 'var(--yellow)' : 'var(--muted)', marginLeft: 6, fontSize: 11 }}>
                              {daysToExp}d
                            </span>
                          )}
                        </td>
                        <td className={`text-right mono ${deltaWarn ? 'text-yellow' : ''}`}>
                          {p.current_delta != null ? p.current_delta.toFixed(3) : '—'}
                        </td>
                        <td className="text-right">{p.net_liq_pct != null ? `${p.net_liq_pct.toFixed(1)}%` : '—'}</td>
                        <td>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 4,
                            background: p.alert_state === 'safe' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.15)',
                            color: p.alert_state === 'safe' ? 'var(--green)' : 'var(--yellow)',
                            fontWeight: 600, textTransform: 'uppercase',
                          }}>{p.alert_state ?? 'unknown'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </Card>
            );
          })()}

          {/* IBKR status */}
          <Card title="Infrastructure">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <StatusDot label="IBKR Web API" ok={ibkrOk} />
              <StatusDot label="OPRA" ok={ibkr?.web_api?.opra_subscribed} />
              <StatusDot label="Backend" ok={!!briefing} />
            </div>
          </Card>

          {/* Priority orders from briefing */}
          {(briefing?.actions?.length ?? 0) > 0 && (
            <Card title={`Actions (${briefing?.actions?.length})`}>
              {briefing?.actions?.map((o, i) => (
                <div key={i} style={{
                  padding: '8px 0', borderBottom: '1px solid var(--border)',
                  fontSize: 13, display: 'flex', gap: 10,
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--yellow)' }}>{o.ticker ?? o.id}</span>
                  <span style={{ color: 'var(--muted)' }}>{o.action ?? o.type ?? JSON.stringify(o)}</span>
                </div>
              ))}
            </Card>
          )}

        </div>
      )}
    </Layout>
  );
}

function StatusDot({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: ok ? 'var(--green)' : 'var(--red)',
        boxShadow: ok ? '0 0 6px var(--green)' : '0 0 6px var(--red)',
      }} />
      <span style={{ fontSize: 13, color: ok ? 'var(--text)' : 'var(--muted)' }}>{label}</span>
    </div>
  );
}
