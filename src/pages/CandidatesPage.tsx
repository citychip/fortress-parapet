import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSortable, SortTh } from '../components/Sortable';
import Layout from '../components/Layout';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { getCandidates, type CandidateRow } from '../lib/api';

// ── Signal tier ───────────────────────────────────────────────────────────────

type SignalTier = 'strong' | 'sell' | 'watch' | 'neutral';

function getSignalTier(raw: string | null | undefined): SignalTier {
  if (!raw) return 'neutral';
  const s = raw.toUpperCase().replace(/\s+/g, '_');
  if (s.includes('STRONG')) return 'strong';
  if (s.includes('BULL') || s === 'SELL' || s.includes('PREMIUM')) return 'sell';
  if (s.includes('WATCH')) return 'watch';
  return 'neutral';
}

function signalStyle(tier: SignalTier): { color: string; bg: string; border: string } {
  switch (tier) {
    case 'strong':  return { color: 'var(--red)',    bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)' };
    case 'sell':    return { color: 'var(--yellow)', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)' };
    case 'watch':   return { color: 'var(--blue, #38bdf8)', bg: 'rgba(56,189,248,0.10)', border: 'rgba(56,189,248,0.3)' };
    default:        return { color: 'var(--muted)',  bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)' };
  }
}

function SignalBadge({ raw }: { raw: string | null | undefined }) {
  if (!raw || raw === '-') return <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>;
  const tier = getSignalTier(raw);
  const { color, bg, border } = signalStyle(tier);
  const label = raw.replace(/_/g, ' ');
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      color, background: bg, border: `1px solid ${border}`,
      fontFamily: 'monospace',
      ...(tier === 'strong' ? { animation: 'pulse 2s infinite' } : {}),
    }}>{label}</span>
  );
}

// ── Gate badge ────────────────────────────────────────────────────────────────

function GateBadge({ row }: { row: CandidateRow }) {
  if (row.excluded) return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(100,116,139,0.15)', color: 'var(--muted)', fontWeight: 600 }}>
      EXCLUDED
    </span>
  );
  if (row.earnings_state === 'blackout') return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: 'var(--red)', fontWeight: 600 }}>
      BLACKOUT
    </span>
  );
  if (row.concentration_state === 'high') return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: 'var(--red)', fontWeight: 600 }}>
      CONC HIGH
    </span>
  );
  if (row.earnings_state === 'approaching') return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: 'var(--yellow)', fontWeight: 600 }}>
      EARNINGS {row.days_to_earnings}d
    </span>
  );
  if (row.concentration_state === 'moderate') return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: 'var(--yellow)', fontWeight: 600 }}>
      CONC MOD
    </span>
  );
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: 'var(--green)', fontWeight: 600 }}>
      READY
    </span>
  );
}

// ── IVR bar ───────────────────────────────────────────────────────────────────

function IvrBar({ ivr }: { ivr: number | null }) {
  if (ivr == null) return <span style={{ color: 'var(--muted)' }}>—</span>;
  const color = ivr >= 50 ? 'var(--green)' : ivr >= 25 ? 'var(--yellow)' : 'var(--muted)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 60, height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, ivr)}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 12, color }}>{ivr.toFixed(0)}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const [rows, setRows]       = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [filter, setFilter]   = useState<'all' | 'ready' | 'blocked' | 'actionable' | 'watch'>('all');

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const data = await getCandidates();
      setRows(data.rows ?? []);
      setUpdatedAt(data.as_of ?? new Date().toISOString());
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

  const ready      = rows.filter(r => r.can_trade);
  const blocked    = rows.filter(r => !r.can_trade);
  const actionable = rows.filter(r => r.can_trade && ['strong','sell'].includes(getSignalTier(r.signal)));
  const watchList  = rows.filter(r => getSignalTier(r.signal) === 'watch');
  const visible    = filter === 'ready'      ? ready
                   : filter === 'blocked'    ? blocked
                   : filter === 'actionable' ? actionable
                   : filter === 'watch'      ? watchList
                   : rows;

  const { sorted: tableSorted, key: sortKey, dir: sortDir, toggle } = useSortable(visible, 'ivr', 'desc');
  // When no column sort active, keep ready-first default
  const sorted = useMemo(() => {
    if (sortKey) return tableSorted;
    return [...visible].sort((a, b) => {
      if (a.can_trade !== b.can_trade) return a.can_trade ? -1 : 1;
      return (b.ivr ?? 0) - (a.ivr ?? 0);
    });
  }, [tableSorted, sortKey, visible]);

  return (
    <Layout title="Candidates" onRefresh={load} loading={loading} lastUpdated={updatedAt}>
      {loading && !rows.length && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={32} />
        </div>
      )}
      {error && <ErrorBanner msg={error} onRetry={load} />}

      {/* Summary bar */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Signal stat cards */}
          {([
            { key: 'actionable', label: 'Actionable', count: actionable.length, color: 'var(--yellow)', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.25)' },
            { key: 'watch',      label: 'Watch',      count: watchList.length,  color: '#38bdf8',       bg: 'rgba(56,189,248,0.07)', border: 'rgba(56,189,248,0.25)' },
            { key: 'ready',      label: 'Ready',      count: ready.length,      color: 'var(--green)',  bg: 'rgba(34,197,94,0.06)',  border: 'rgba(34,197,94,0.2)' },
            { key: 'blocked',    label: 'Blocked',    count: blocked.length,    color: 'var(--muted)',  bg: 'var(--surface)',        border: 'var(--border)' },
          ] as const).map(({ key, label, count, color, bg, border }) => (
            <button key={key} onClick={() => setFilter(key as any)} style={{
              background: filter === key ? bg : 'var(--surface)',
              border: `1px solid ${filter === key ? border : 'var(--border)'}`,
              borderRadius: 10, padding: '10px 18px', cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: filter === key ? color : 'var(--fg)' }}>{count}</div>
            </button>
          ))}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '10px 18px', flex: 1, minWidth: 160,
          }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>IVR ≥ 25 required · ≥ 50 prime</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Top: {actionable.slice(0, 3).map(r => `${r.ticker} ${r.ivr?.toFixed(0)}`).join(' · ') || ready.slice(0, 3).map(r => `${r.ticker} ${r.ivr?.toFixed(0)}`).join(' · ') || '—'}
            </div>
          </div>
          {/* All button */}
          <button onClick={() => setFilter('all')} style={{
            fontSize: 12, padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
            background: filter === 'all' ? 'var(--accent)' : 'var(--surface2)',
            color: filter === 'all' ? '#fff' : 'var(--muted)',
            border: filter === 'all' ? 'none' : '1px solid var(--border2)',
            fontWeight: filter === 'all' ? 600 : 400, alignSelf: 'center',
          }}>All</button>
        </div>
      )}

      {/* Candidates table */}
      {sorted.length > 0 && (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr>
                <SortTh label="Ticker"   sortKey="ticker"            activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                <SortTh label="Price"    sortKey="price"             activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
                <SortTh label="IVR"      sortKey="ivr"               activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                <SortTh label="IV"       sortKey="current_iv"        activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
                <SortTh label="HV20"     sortKey="hv20"              activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
                <SortTh label="Spread"   sortKey="spread_pp"         activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
                <SortTh label="Earnings" sortKey="days_to_earnings"  activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
                <SortTh label="Conc%"    sortKey="concentration_pct" activeKey={sortKey} dir={sortDir} onToggle={toggle} align="right" />
                <th>Gate</th>
                <th>Signal</th>
              </tr></thead>
              <tbody>
                {sorted.map((row, i) => {
                  const rowBg = !row.can_trade ? 'rgba(239,68,68,0.02)' : undefined;
                  const signalWarn = row.signal && row.signal !== '-' && row.signal !== '';
                  const spreadColor = (row.spread_pp ?? 0) >= 8 ? 'var(--green)'
                    : (row.spread_pp ?? 0) >= 4 ? 'var(--yellow)'
                    : (row.spread_pp ?? 0) < 0 ? 'var(--red)' : 'var(--muted)';
                  const tier = getSignalTier(row.signal);
                  const rowHighlight = tier === 'strong' ? 'rgba(239,68,68,0.04)'
                    : tier === 'sell' ? 'rgba(245,158,11,0.03)' : rowBg;
                  return (
                    <tr key={i} style={{ background: rowHighlight, opacity: row.can_trade ? 1 : 0.55 }}>
                      <td style={{ fontWeight: 700, fontSize: 14 }}>{row.ticker}</td>
                      <td className="text-right mono" style={{ fontSize: 12 }}>
                        {row.price != null ? `$${row.price.toFixed(2)}` : '—'}
                      </td>
                      <td><IvrBar ivr={row.ivr} /></td>
                      <td className="text-right mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {row.current_iv != null ? `${row.current_iv.toFixed(1)}%` : '—'}
                      </td>
                      <td className="text-right mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {row.hv20 != null ? `${row.hv20.toFixed(1)}%` : '—'}
                      </td>
                      <td className="text-right mono" style={{ fontSize: 12, color: spreadColor, fontWeight: 600 }}>
                        {row.spread_pp != null ? `${row.spread_pp > 0 ? '+' : ''}${row.spread_pp.toFixed(1)}pp` : '—'}
                      </td>
                      <td className="text-right" style={{ fontSize: 12, color: row.days_to_earnings != null && row.days_to_earnings <= 10 ? 'var(--red)' : row.days_to_earnings != null && row.days_to_earnings <= 30 ? 'var(--yellow)' : 'var(--muted)' }}>
                        {row.days_to_earnings != null ? `${row.days_to_earnings}d` : '—'}
                      </td>
                      <td className="text-right mono" style={{ fontSize: 12, color: Math.abs(row.concentration_pct) > 50 ? 'var(--red)' : Math.abs(row.concentration_pct) > 20 ? 'var(--yellow)' : 'var(--muted)' }}>
                        {row.concentration_pct !== 0 ? `${row.concentration_pct > 0 ? '+' : ''}${row.concentration_pct.toFixed(1)}%` : '—'}
                      </td>
                      <td><GateBadge row={row} /></td>
                      <td><SignalBadge raw={row.signal} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && rows.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)', fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          No candidates data. Run the IV Crush script first.
        </div>
      )}
    </Layout>
  );
}
