import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { TabBar } from '../components/Tabs';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import {
  getPositions, getPnl, getSectorExposure, getPortfolioBeta,
  getJournal, addJournalEntry, fmt$, fmtPct, clsN,
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
        getPositions(true), getPositions(false), getPnl(),
        getSectorExposure(), getPortfolioBeta(), getJournal(),
      ]);
      if (results[0].status === 'fulfilled') setPositions(results[0].value?.positions ?? []);
      if (results[1].status === 'fulfilled') setPosLegs(results[1].value?.positions ?? []);
      if (results[2].status === 'fulfilled') setPnl(results[2].value);
      if (results[3].status === 'fulfilled') setSector(results[3].value);
      if (results[4].status === 'fulfilled') setBeta(results[4].value);
      if (results[5].status === 'fulfilled') setJournal(results[5].value?.entries ?? results[5].value?.journal ?? []);
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
                <th>Ticker</th><th>Strategy</th>
                <th>Short</th><th>Long</th><th>Expiry</th>
                <th className="text-right">Delta</th>
                <th className="text-right">NLV%</th>
                <th>Alert</th>
              </tr></thead>
              <tbody>
                {posLegs.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{p.ticker}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{p.strategy}</td>
                    <td className="mono">{p.short_strike ?? '—'}</td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{p.long_strike ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{p.expiry ?? '—'}</td>
                    <td className="text-right mono">{p.current_delta?.toFixed(3) ?? '—'}</td>
                    <td className="text-right">{p.net_liq_pct != null ? `${p.net_liq_pct.toFixed(1)}%` : '—'}</td>
                    <td><AlertBadge state={p.alert_state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* P&L TAB */}
      {tab === 'pnl' && pnl && (() => {
        const byTickerSum = (pnl.by_ticker ?? []).reduce((s, t) => s + (t.pnl ?? 0), 0);
        const summaryTotal = pnl.summary?.total_pnl ?? null;
        const discrepancy = summaryTotal != null ? Math.abs(byTickerSum - summaryTotal) : 0;
        const hasDiscrepancy = summaryTotal != null && discrepancy > 1;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Cross-check warning */}
            {hasDiscrepancy && (
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
                fontSize: 13, color: 'var(--yellow)',
              }}>
                ⚠ P&L mismatch: by-ticker sum {fmt$(byTickerSum)} vs summary total {fmt$(summaryTotal)} (Δ {fmt$(discrepancy)})
              </div>
            )}
            {/* Summary */}
            <div style={{ display: 'flex', gap: 16 }}>
              {[
                { label: 'Total Unrealized', value: fmt$(pnl.summary?.unrealized_pnl), color: clsN(pnl.summary?.unrealized_pnl) },
                { label: 'Realized',         value: fmt$(pnl.summary?.realized_pnl),   color: clsN(pnl.summary?.realized_pnl) },
                { label: 'Total',            value: fmt$(pnl.summary?.total_pnl),      color: clsN(pnl.summary?.total_pnl) },
                { label: 'By-Ticker Sum',    value: fmt$(byTickerSum),                 color: clsN(byTickerSum) },
              ].map((s, i) => (
                <div key={i} style={{
                  flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '16px 20px',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>{s.label}</div>
                  <div className={`mono ${s.color}`} style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
                </div>
              ))}
            </div>
            {/* By ticker */}
            <Card title="By Ticker">
              <table>
                <thead><tr><th>Ticker</th><th className="text-right">P&L</th></tr></thead>
                <tbody>
                  {(pnl.by_ticker ?? [])
                    .sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0))
                    .map((t, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{t.ticker}</td>
                        <td className={`text-right mono ${clsN(t.pnl)}`}>{fmt$(t.pnl)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          </div>
        );
      })()}

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

function PositionsTab({ positions }: { positions: any[] }) {
  const withDte = positions.map(p => ({
    ...p,
    _dte: p.expiry ? Math.ceil((new Date(p.expiry).getTime() - Date.now()) / 86400000) : null as number | null,
  }));
  const critical = withDte.filter(p => p._dte != null && p._dte <= 7);
  const warning  = withDte.filter(p => p._dte != null && p._dte > 7 && p._dte <= 14);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {critical.length > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap',
        }}>
          <span style={{ color: 'var(--red)', fontWeight: 700 }}>⚠ Expiring soon (≤7d):</span>
          {critical.map(p => (
            <span key={p.ticker + p.expiry} style={{
              fontFamily: 'monospace', fontSize: 12, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(239,68,68,0.15)', color: 'var(--red)', fontWeight: 600,
            }}>{p.ticker} {p._dte}d</span>
          ))}
        </div>
      )}
      {warning.length > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap',
        }}>
          <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>Near expiry (≤14d):</span>
          {warning.map(p => (
            <span key={p.ticker + p.expiry} style={{
              fontFamily: 'monospace', fontSize: 12, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(245,158,11,0.12)', color: 'var(--yellow)', fontWeight: 600,
            }}>{p.ticker} {p._dte}d</span>
          ))}
        </div>
      )}
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>
              <th>Ticker</th><th>Strategy</th><th>Legs</th>
              <th>Short</th><th>Long</th><th>Expiry</th>
              <th className="text-right">Delta</th>
              <th className="text-right">NLV%</th>
              <th>Alert</th>
            </tr></thead>
            <tbody>
              {withDte.map((p, i) => {
                const deltaWarn = p.current_delta && Math.abs(p.current_delta) > 0.4;
                const expiryColor = p._dte != null && p._dte <= 7 ? 'var(--red)'
                  : p._dte != null && p._dte <= 14 ? 'var(--yellow)' : 'var(--muted)';
                return (
                  <tr key={i} style={p._dte != null && p._dte <= 7 ? { background: 'rgba(239,68,68,0.04)' } : undefined}>
                    <td style={{ fontWeight: 600 }}>{p.ticker}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{p.strategy}</td>
                    <td style={{ color: 'var(--muted)' }}>{p.leg_count}</td>
                    <td className="mono">{p.short_strike ?? '—'}</td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{p.long_strike ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {p.expiry ?? '—'}
                      {p._dte != null && (
                        <span style={{ color: expiryColor, marginLeft: 6, fontSize: 11, fontWeight: p._dte <= 14 ? 600 : 400 }}>
                          {p._dte}d
                        </span>
                      )}
                    </td>
                    <td className={`text-right mono ${deltaWarn ? 'text-yellow' : ''}`}>
                      {p.current_delta?.toFixed(3) ?? '—'}
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
    </div>
  );
}

function AlertBadge({ state }: { state?: string }) {
  const color = state === 'safe' ? 'var(--green)' : state === 'act' ? 'var(--red)' : 'var(--yellow)';
  const bg    = state === 'safe' ? 'rgba(34,197,94,0.1)' : state === 'act' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)';
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 4,
      background: bg, color, fontWeight: 600, textTransform: 'uppercase',
    }}>{state ?? '—'}</span>
  );
}
