import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import {
  getRollAll, getStopLossAll, getAlerts, evaluateRoll, getPendingOrders, getTradeReport,
  fmt$, fmtDateTime,
  type AlertData, type OrderData, type TradeReportData,
} from '../lib/api';
import { URGENCY_COLOR, URGENCY_BG, VERDICT_COLOR, VERDICT_BG } from '../lib/colors';

// ── Public helper: count ACT signals (used by Sidebar for badge) ──────────────
export function countActSignals(stopData: any): number {
  if (!stopData?.summary) return 0;
  return (stopData.summary.act_immediately ?? 0) + (stopData.summary.act ?? 0);
}

export default function TriagePage() {
  const [rollData, setRollData] = useState<any>(null);
  const [stopData, setStopData] = useState<any>(null);
  const [alerts, setAlerts]     = useState<AlertData[]>([]);
  const [orders, setOrders]     = useState<OrderData[]>([]);
  const [report, setReport]     = useState<TradeReportData | null>(null);
  const [rollPnl, setRollPnl]   = useState<Map<string, any>>(new Map());
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(() => {
    try { return localStorage.getItem('triage_auto_refresh') !== 'off'; } catch { return true; }
  });

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    const [r, s, a, o, tr] = await Promise.allSettled([
      getRollAll(), getStopLossAll(), getAlerts(), getPendingOrders(), getTradeReport(),
    ]);
    if (o.status === 'fulfilled') setOrders([...(o.value?.orders ?? []), ...(o.value?.pending ?? [])]);
    if (tr.status === 'fulfilled') setReport(tr.value);
    if (r.status === 'fulfilled') {
      setRollData(r.value);
      // Load roll P&L estimates in background for urgent/warning positions
      const positions: any[] = r.value?.positions ?? [];
      const toEval = positions.filter(p => p.urgency === 'urgent' || p.urgency === 'warning');
      if (toEval.length) {
        setRollPnl(new Map());
        Promise.allSettled(toEval.map(async p => {
          try {
            const data = await evaluateRoll(p.ticker);
            setRollPnl(prev => new Map(prev).set(p.ticker, data));
          } catch {}
        }));
      }
    }
    if (s.status === 'fulfilled') setStopData(s.value);
    if (a.status === 'fulfilled') setAlerts(a.value?.alerts ?? []);
    if (r.status === 'rejected' && s.status === 'rejected') setError(String(r.reason));
    setUpdatedAt(new Date().toISOString());
    if (!background) setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60s while page is visible
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, 60_000);
    return () => clearInterval(id);
  }, [load, autoRefresh]);

  // Refresh immediately when tab becomes visible again (if stale)
  useEffect(() => {
    if (!autoRefresh) return;
    const onVisible = () => { if (document.visibilityState === 'visible') load(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load, autoRefresh]);

  const toggleAutoRefresh = () => {
    setAutoRefresh(prev => {
      const next = !prev;
      try { localStorage.setItem('triage_auto_refresh', next ? 'on' : 'off'); } catch {}
      return next;
    });
  };

  // Pending orders refresh on a faster cadence (15s) — order status is the
  // most latency-sensitive item on this page. Read-only: approvals via Claude (#78).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      getPendingOrders()
        .then(o => setOrders([...(o?.orders ?? []), ...(o?.pending ?? [])]))
        .catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const actCount = countActSignals(stopData);
  const exitCands = report?.exit_candidates ?? [];

  return (
    <Layout title="Triage" onRefresh={load} loading={loading} lastUpdated={updatedAt}
      action={
        <button
          onClick={toggleAutoRefresh}
          title={autoRefresh ? 'Auto-refresh on (60s) — click to pause' : 'Auto-refresh paused — click to enable'}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: autoRefresh ? 'var(--green)' : 'var(--muted)', fontSize: 12, padding: '5px 12px' }}
        >
          {autoRefresh ? '⟳ Auto 60s' : '⏸ Paused'}
        </button>
      }
    >
      {loading && !rollData && !stopData && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={32} /></div>
      )}
      {error && <ErrorBanner msg={error} onRetry={load} />}

      {/* ACT summary banner */}
      {actCount > 0 && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: 14 }}>⚠ {actCount} stop-loss ACT signal{actCount !== 1 ? 's' : ''}</span>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>— review the stop-loss table below</span>
        </div>
      )}

      {/* ── Pending orders (read-only — approvals via Claude, #78) ──────────── */}
      {orders.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Pending Orders ({orders.length})
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              read-only — approve/decline via Claude (e.g. “approve order {String(orders[0]?.id ?? '').slice(0, 8)}”)
            </span>
          </div>
          <Card>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr>
                  <th>Ticker</th>
                  <th>Strategy</th>
                  <th>Legs</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Limit</th>
                  <th>Status</th>
                  <th>IBKR</th>
                  <th>Created</th>
                  <th>ID</th>
                </tr></thead>
                <tbody>
                  {orders.map((o: any, i: number) => {
                    const legsTxt = (o.legs ?? [])
                      .map((l: any) => `${l.action === 'BUY' ? '+' : '−'}${l.strike ?? ''}${l.right ?? l.sec_type ?? ''}${l.expiry ? ` ${l.expiry.slice(5)}` : ''}`)
                      .join(' / ');
                    const st = (o.status ?? 'pending').toLowerCase();
                    const stColor = st === 'pending' ? 'var(--yellow)' : st === 'submitted' ? 'var(--accent)' : st === 'filled' ? 'var(--green)' : 'var(--muted)';
                    const ibkrSt = o.ibkr_status ?? o.broker_status ?? o.ibkr_order_status ?? null;
                    return (
                      <tr key={o.id ?? i}>
                        <td style={{ fontWeight: 700 }}>{o.ticker ?? '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'monospace' }}>{o.strategy ?? o.order_type ?? '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{legsTxt || '—'}</td>
                        <td className="text-right mono" style={{ fontSize: 12 }}>{o.quantity ?? '—'}</td>
                        <td className="text-right mono" style={{ fontSize: 12 }}>{o.limit_price != null ? fmt$(o.limit_price, 2) : '—'}</td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', color: stColor, background: 'var(--surface2)' }}>{st}</span>
                        </td>
                        <td style={{ fontSize: 11, color: ibkrSt ? 'var(--fg)' : 'var(--muted)', fontFamily: 'monospace' }}>{ibkrSt ?? '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{o.created_at ? fmtDateTime(o.created_at) : '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{String(o.id ?? '').slice(0, 8)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── Active alerts ────────────────────────────────────────────────────── */}
      {(() => {
        const active = alerts.filter(a => a.state === 'act' || a.state === 'watch');
        if (!active.length) return null;
        const ALERT_COLOR: Record<string, string> = { act: 'var(--red)', watch: 'var(--yellow)' };
        const ALERT_BG:    Record<string, string> = { act: 'rgba(239,68,68,0.1)', watch: 'rgba(245,158,11,0.1)' };
        return (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Active Alerts</div>
            <Card>
              <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr>
                  <th>State</th>
                  <th>Ticker</th>
                  <th>Condition</th>
                  <th className="text-right">Threshold</th>
                  <th>Message</th>
                </tr></thead>
                <tbody>
                  {active.map((a, i) => (
                    <tr key={i}>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', color: ALERT_COLOR[a.state] ?? 'var(--muted)', background: ALERT_BG[a.state] ?? 'rgba(100,116,139,0.1)' }}>
                          {a.state}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{a.ticker ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{a.condition ?? '—'}</td>
                      <td className="text-right mono" style={{ fontSize: 12 }}>{a.threshold != null ? a.threshold : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{a.message ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* ── Roll check ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Roll Check</div>

        {rollData && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { label: 'Urgent',      count: rollData.summary?.urgent      ?? 0, color: 'var(--red)'    },
              { label: 'Warning',     count: rollData.summary?.warning     ?? 0, color: 'var(--yellow)' },
              { label: 'Approaching', count: rollData.summary?.approaching ?? 0, color: 'var(--accent)' },
              { label: 'None',        count: rollData.summary?.none        ?? 0, color: 'var(--muted)'  },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.count > 0 && s.label !== 'None' ? s.color : 'var(--fg)' }}>{s.count}</div>
              </div>
            ))}
          </div>
        )}

        {rollData?.positions?.length > 0 && (
          <Card>
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
                  <th className="text-right">Roll P&L</th>
                  <th>Reasons</th>
                </tr></thead>
                <tbody>
                  {rollData.positions.map((p: any, i: number) => {
                    const rp = rollPnl.get(p.ticker);
                    const credit = rp?.net_credit ?? rp?.estimated_credit ?? rp?.credit_estimate ?? null;
                    const creditColor = credit != null ? (credit >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--muted)';
                    return (
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
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', color: URGENCY_COLOR[p.urgency] ?? 'var(--muted)', background: URGENCY_BG[p.urgency] ?? 'rgba(100,116,139,0.1)' }}>{p.urgency ?? '—'}</span>
                      </td>
                      <td className="text-right mono" style={{ fontSize: 12, color: creditColor }}>
                        {credit != null ? `${credit >= 0 ? '+' : ''}$${Math.abs(credit).toFixed(0)}` : (rp ? '—' : '')}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{(p.reasons ?? []).join(', ') || '—'}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {rollData && !rollData?.positions?.length && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>No roll candidates.</p>
        )}
      </div>

      {/* ── Stop-loss check ──────────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Stop-Loss Check</div>

        {stopData && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { label: 'ACT',   count: (stopData.summary?.act_immediately ?? 0) + (stopData.summary?.act ?? 0), color: 'var(--red)'    },
              { label: 'WATCH', count: stopData.summary?.watch ?? 0, color: 'var(--yellow)' },
              { label: 'SAFE',  count: stopData.summary?.safe  ?? 0, color: 'var(--green)'  },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Stop {s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.count > 0 && s.label !== 'SAFE' ? s.color : 'var(--fg)' }}>{s.count}</div>
              </div>
            ))}
          </div>
        )}

        {stopData?.positions?.length > 0 && (
          <Card>
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
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', color: VERDICT_COLOR[p.verdict] ?? 'var(--muted)', background: VERDICT_BG[p.verdict] ?? 'rgba(100,116,139,0.1)' }}>{p.verdict ?? '—'}</span>
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

        {stopData && !stopData?.positions?.length && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>No stop-loss signals.</p>
        )}
      </div>

      {/* ── Exit candidates (from trade report, #85) ─────────────────────────── */}
      {exitCands.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Exit Candidates</div>
          <Card>
            <div style={{ overflowX: 'auto' }}>
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
                      <td style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>{(r.action ?? '—').replace(/_/g, ' ')}</td>
                      <td className="text-right mono" style={{ fontSize: 12 }}>{r.net_market_value != null ? fmt$(r.net_market_value) : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {!loading && !error && !rollData && !stopData && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 60 }}>No triage data available.</p>
      )}
    </Layout>
  );
}
