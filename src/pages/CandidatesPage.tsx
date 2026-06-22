import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSortable, SortTh } from '../components/Sortable';
import Layout from '../components/Layout';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { getCandidates, getStrategyMetrics, getPretradeAll, getCapitalEff, getEarningsVolatility, getCheckLiquidity, getAllTickerNews, stageOrder, type CandidateRow, type Advisory } from '../lib/api';
import Badge from '../components/Badge';
import { useToast } from '../components/Toast';

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

// ── Strategy badge ────────────────────────────────────────────────────────────

const STRATEGY_STYLE: Record<string, { color: string; bg: string }> = {
  PMCC:     { color: 'var(--green)',          bg: 'rgba(34,197,94,0.12)' },
  CSP:      { color: '#38bdf8',               bg: 'rgba(56,189,248,0.12)' },
  IC:       { color: 'var(--purple, #a78bfa)', bg: 'rgba(167,139,250,0.12)' },
  PCS:      { color: 'var(--yellow)',          bg: 'rgba(245,158,11,0.12)' },
  Diagonal: { color: 'var(--muted)',           bg: 'rgba(100,116,139,0.12)' },
  CC:       { color: 'var(--green)',           bg: 'rgba(34,197,94,0.10)' },
};

function StrategyBadge({ name, loading }: { name: string | null | undefined; loading?: boolean }) {
  if (loading) return <span style={{ color: 'var(--muted)', fontSize: 11 }}>…</span>;
  if (!name)   return <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>;
  const style = STRATEGY_STYLE[name] ?? { color: 'var(--muted)', bg: 'rgba(100,116,139,0.1)' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      color: style.color, background: style.bg, fontFamily: 'monospace',
      whiteSpace: 'nowrap',
    }}>{name}</span>
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

// ── Vol math ──────────────────────────────────────────────────────────────────

function normCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const d = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * poly;
  return x >= 0 ? d : 1 - d;
}

/** Probability that stock closes ABOVE strike at expiry (PoP for a short put).
 *  iv: percentage form (35 = 35%). Returns 0–100. */
function calcPoP(spot: number, strike: number, dte: number, ivPct: number, r = 0.045): number {
  const T = dte / 365;
  const sigma = ivPct / 100;
  if (T <= 0 || sigma <= 0 || spot <= 0 || strike <= 0) return 0;
  const d2 = (Math.log(spot / strike) + (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return normCDF(d2) * 100;
}

/** Expected 1-standard-deviation move in $ */
function calc1SD(spot: number, ivPct: number, dte: number): number {
  return spot * (ivPct / 100) * Math.sqrt(dte / 365);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const [rows, setRows]       = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [filter, setFilter]   = useState<'all' | 'ready' | 'blocked' | 'actionable' | 'watch'>('all');

  // Strategy recommendations: ticker → recommended short_name (or null)
  const [strategyMap, setStrategyMap]           = useState<Map<string, string | null>>(new Map());
  const [strategyLoading, setStrategyLoading]   = useState<Set<string>>(new Set());
  // Pretrade: ticker → "PROCEED" | "BLOCKED" | null
  const [pretradeMap, setPretradeMap]           = useState<Map<string, string | null>>(new Map());
  // Sprint 16.1 — advisory caution: ticker → flags[]; + market-wide advisories
  const [cautionMap, setCautionMap]             = useState<Map<string, string[]>>(new Map());
  const [marketAdv, setMarketAdv]               = useState<{ macro_defer?: Advisory; vix_term?: Advisory } | null>(null);
  // Sprint 15.2 — OTM tradeable short-leg liquidity: ticker → {grade,status,spread}
  const [liqMap, setLiqMap]                     = useState<Map<string, { grade?: string; status?: string | null; spread?: number | null }>>(new Map());
  // Capital efficiency: ticker → efficiency pct (null if no position)
  const [effMap, setEffMap]                     = useState<Map<string, number | null>>(new Map());
  // Earnings volatility: ticker → { implied_move_pct, avg_historical_pct }
  const [earnVolMap, setEarnVolMap]             = useState<Map<string, { implied: number | null; avg: number | null }>>(new Map());
  // Sprint 17.4 — per-ticker news-spike cooldown: ticker → {days_since, cooldown_active, headline}
  const [newsMap, setNewsMap]                   = useState<Map<string, { days?: number | null; active?: boolean; headline?: string | null }>>(new Map());

  const fetchStrategies = useCallback(async (canTradeRows: CandidateRow[]) => {
    if (!canTradeRows.length) return;
    const tickers = canTradeRows.map(r => r.ticker);
    setStrategyLoading(new Set(tickers));
    const results = await Promise.allSettled(
      tickers.map(t => getStrategyMetrics(t))
    );
    setStrategyMap(prev => {
      const next = new Map(prev);
      results.forEach((res, i) => {
        const ticker = tickers[i];
        if (res.status === 'fulfilled') {
          const rec = res.value.strategies?.find(s => s.recommended);
          next.set(ticker, rec?.short_name ?? null);
        } else {
          next.set(ticker, null);
        }
      });
      return next;
    });
    setStrategyLoading(new Set());
  }, []);

  // Sprint 15.2 — fetch OTM tradeable short-leg liquidity for tradeable rows only
  // (bounded; check_liquidity hits the IBKR chain, so don't fan out to all rows).
  const fetchLiquidity = useCallback(async (canTradeRows: CandidateRow[]) => {
    if (!canTradeRows.length) return;
    const tickers = canTradeRows.map(r => r.ticker);
    const results = await Promise.allSettled(tickers.map(t => getCheckLiquidity(t)));
    setLiqMap(prev => {
      const next = new Map(prev);
      results.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          next.set(tickers[i], {
            grade:  res.value.liquidity_grade,
            status: res.value.tradeable_status ?? null,
            spread: res.value.tradeable_spread_pct ?? null,
          });
        }
      });
      return next;
    });
  }, []);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const data = await getCandidates();
      const fetched = data.rows ?? [];
      setRows(fetched);
      setUpdatedAt(data.as_of ?? new Date().toISOString());
      // Fetch strategy, pretrade, and capital efficiency in background
      fetchStrategies(fetched.filter(r => r.can_trade));
      fetchLiquidity(fetched.filter(r => r.can_trade));
      // Pretrade gate
      getPretradeAll().then(d => {
        const m = new Map<string, string | null>();
        const c = new Map<string, string[]>();
        for (const r of (d?.results ?? [])) {
          m.set(r.ticker, r.verdict ?? null);
          if (r.caution && r.caution_flags && r.caution_flags.length) c.set(r.ticker, r.caution_flags);
        }
        setPretradeMap(m);
        setCautionMap(c);
        setMarketAdv(d?.market_advisories ?? null);
      }).catch(() => {});
      // Capital efficiency (existing positions only)
      getCapitalEff().then(d => {
        const m = new Map<string, number | null>();
        for (const p of (d?.by_position ?? [])) m.set(p.ticker, p.efficiency ?? null);
        setEffMap(m);
      }).catch(() => {});
      // Earnings volatility — fetch in background for all rows
      Promise.allSettled(
        fetched.map(r => getEarningsVolatility(r.ticker).then(d => ({ ticker: r.ticker, d })))
      ).then(results => {
        const m = new Map<string, { implied: number | null; avg: number | null }>();
        for (const res of results) {
          if (res.status === 'fulfilled') {
            const { ticker, d } = res.value;
            m.set(ticker, { implied: d?.implied_move_pct ?? null, avg: d?.avg_historical_pct ?? null });
          }
        }
        setEarnVolMap(m);
      }).catch(() => {});
      // Sprint 17.4 — per-ticker news-spike cooldown indicator (single call)
      getAllTickerNews().then(d => {
        const m = new Map<string, { days?: number | null; active?: boolean; headline?: string | null }>();
        for (const [tk, n] of Object.entries(d?.tickers ?? {})) {
          m.set(tk, { days: n.days_since ?? null, active: !!n.cooldown_active, headline: n.headline ?? null });
        }
        setNewsMap(m);
      }).catch(() => {});
    } catch (e: any) {
      setError(String(e));
    } finally {
      if (!background) setLoading(false);
    }
  }, [fetchStrategies]);

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

  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  const { sorted: tableSorted, key: sortKey, dir: sortDir, toggle } = useSortable(visible, 'ivr', 'desc', 'candidates');
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

      {/* Sprint 16.1 — market-wide advisory banner (macro defer / VIX term).
          Non-blocking heads-up; ex-div is per-row below. */}
      {marketAdv && [marketAdv.macro_defer, marketAdv.vix_term]
        .filter((a): a is Advisory => !!a && a.level === 'amber')
        .map(a => (
          <div key={a.name} style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)',
          }}>
            <Badge tone="yellow">{a.name === 'macro_defer' ? '⚠ Macro defer' : '⚠ VIX term'}</Badge>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{a.detail || 'Advisory only (§15.1) — non-blocking'}</span>
          </div>
        ))}

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
                <th>Pretrade</th>
                <th>Signal</th>
                <th>Rec</th>
                <th className="text-right">Eff%</th>
                <th className="text-right">Earn Move</th>
              </tr></thead>
              <tbody>
                {sorted.flatMap((row, i) => {
                  const rowBg = !row.can_trade ? 'rgba(239,68,68,0.02)' : undefined;
                  const spreadColor = (row.spread_pp ?? 0) >= 8 ? 'var(--green)'
                    : (row.spread_pp ?? 0) >= 4 ? 'var(--yellow)'
                    : (row.spread_pp ?? 0) < 0 ? 'var(--red)' : 'var(--muted)';
                  const tier = getSignalTier(row.signal);
                  const rowHighlight = tier === 'strong' ? 'rgba(239,68,68,0.04)'
                    : tier === 'sell' ? 'rgba(245,158,11,0.03)' : rowBg;
                  const isExpanded = expandedTicker === row.ticker;
                  return [
                    <tr
                      key={row.ticker}
                      onClick={() => setExpandedTicker(isExpanded ? null : row.ticker)}
                      style={{ background: rowHighlight, opacity: row.can_trade ? 1 : 0.55, cursor: 'pointer' }}
                    >
                      <td style={{ fontWeight: 700, fontSize: 14 }}>
                        <span style={{ marginRight: 6, fontSize: 9, color: 'var(--muted)', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                        {row.ticker}
                      </td>
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
                      <td>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                          <GateBadge row={row} />
                          {/* Sprint 16.1 — per-ticker ex-div caution chip */}
                          {cautionMap.get(row.ticker)?.includes('ex_div') && (
                            <Badge tone="yellow" title="Ex-div assignment risk on this ticker's short calls — roll before ex-div">⚠ EX-DIV</Badge>
                          )}
                          {/* Sprint 15.2 — OTM tradeable short-leg liquidity grade */}
                          {(() => {
                            const lq = liqMap.get(row.ticker);
                            if (!lq?.grade) return null;
                            const tone = lq.status === 'good' ? 'green' : lq.status === 'wide' ? 'red' : 'yellow';
                            const sp = lq.spread != null ? ` ${lq.spread}%` : '';
                            return <Badge tone={tone} title={`OTM short-leg spread ${lq.spread ?? '?'}% (${lq.status ?? 'n/a'}) — grade ${lq.grade}`}>LIQ {lq.grade}{sp}</Badge>;
                          })()}
                          {/* Sprint 17.4 — per-ticker news-spike cooldown indicator (§4) */}
                          {(() => {
                            const n = newsMap.get(row.ticker);
                            if (!n || n.days == null) return null;
                            const title = `${n.headline ? n.headline + ' — ' : ''}last material headline ${n.days}d ago${n.active ? ' (within §4 news cooldown — size down / defer new entries)' : ''}`;
                            return <Badge tone={n.active ? 'yellow' : 'muted'} title={title}>📰 {n.days}d</Badge>;
                          })()}
                        </div>
                      </td>
                      <td>
                        {(() => {
                          const v = pretradeMap.get(row.ticker);
                          if (v == null) return <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>;
                          const ok = v === 'PROCEED';
                          return (
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                              color: ok ? 'var(--green)' : 'var(--red)',
                              background: ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            }}>{v}</span>
                          );
                        })()}
                      </td>
                      <td><SignalBadge raw={row.signal} /></td>
                      <td>
                        {row.can_trade
                          ? <StrategyBadge name={strategyMap.get(row.ticker)} loading={strategyLoading.has(row.ticker)} />
                          : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
                        }
                      </td>
                      <td className="text-right mono" style={{ fontSize: 12 }}>
                        {(() => {
                          const eff = effMap.get(row.ticker);
                          if (eff == null) return <span style={{ color: 'var(--muted)' }}>—</span>;
                          const color = eff >= 15 ? 'var(--green)' : eff >= 8 ? 'var(--yellow)' : 'var(--red)';
                          return <span style={{ color, fontWeight: 600 }}>{eff.toFixed(1)}%</span>;
                        })()}
                      </td>
                      <td className="text-right" style={{ fontSize: 11 }}>
                        {(() => {
                          const ev = earnVolMap.get(row.ticker);
                          if (!ev) return <span style={{ color: 'var(--muted)' }}>—</span>;
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                              {ev.implied != null && <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>±{ev.implied.toFixed(1)}%</span>}
                              {ev.avg != null && <span style={{ color: 'var(--muted)', fontFamily: 'monospace' }}>avg ±{ev.avg.toFixed(1)}%</span>}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>,
                    isExpanded && (
                      <tr key={`${row.ticker}-detail`} style={{ background: 'var(--surface2)' }}>
                        <td colSpan={14} style={{ padding: '12px 16px' }}>
                          <CandidateDetail
                            row={row}
                            pretrade={pretradeMap.get(row.ticker)}
                            strategy={strategyMap.get(row.ticker)}
                            eff={effMap.get(row.ticker)}
                            ev={earnVolMap.get(row.ticker)}
                          />
                        </td>
                      </tr>
                    ),
                  ];
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

// ── Candidate Detail Panel ────────────────────────────────────────────────────

function DetailChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90 }}>
      <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: color ?? 'var(--fg)' }}>{value}</span>
    </div>
  );
}

function CandidateDetail({
  row, pretrade, strategy, eff, ev,
}: {
  row: CandidateRow;
  pretrade: string | null | undefined;
  strategy: string | null | undefined;
  eff: number | null | undefined;
  ev: { implied: number | null; avg: number | null } | undefined;
}) {
  const { showToast } = useToast();
  const [staging, setStaging] = useState(false);
  const [staged, setStaged] = useState(false);
  const [stageStrategy, setStageStrategy] = useState(strategy ?? '');
  const [stageDte, setStageDte] = useState('45');
  const [showForm, setShowForm] = useState(false);

  const handleStage = async () => {
    setStaging(true);
    try {
      await stageOrder({
        ticker: row.ticker,
        strategy: stageStrategy || strategy,
        target_dte: parseInt(stageDte, 10) || 45,
        notes: `Staged from Candidates — IVR ${row.ivr?.toFixed(0) ?? '?'}`,
      });
      setStaged(true);
      setShowForm(false);
      showToast(`${row.ticker} order staged`, 'success');
      setTimeout(() => setStaged(false), 3000);
    } catch (e: any) {
      showToast(`Stage failed: ${e.message}`, 'error');
    } finally {
      setStaging(false);
    }
  };
  const spreadColor = (row.spread_pp ?? 0) >= 8 ? 'var(--green)'
    : (row.spread_pp ?? 0) >= 4 ? 'var(--yellow)'
    : (row.spread_pp ?? 0) < 0 ? 'var(--red)' : 'var(--muted)';

  const ivrColor = (row.ivr ?? 0) >= 50 ? 'var(--green)'
    : (row.ivr ?? 0) >= 25 ? 'var(--yellow)' : 'var(--muted)';

  const concColor = Math.abs(row.concentration_pct) > 50 ? 'var(--red)'
    : Math.abs(row.concentration_pct) > 20 ? 'var(--yellow)' : 'var(--muted)';

  const earnColor = (row.days_to_earnings ?? 999) <= 10 ? 'var(--red)'
    : (row.days_to_earnings ?? 999) <= 30 ? 'var(--yellow)' : 'var(--muted)';

  const effColor = eff != null ? (eff >= 15 ? 'var(--green)' : eff >= 8 ? 'var(--yellow)' : 'var(--red)') : 'var(--muted)';

  // Gate reason as readable text
  const gateNote = (() => {
    if (row.excluded) return 'Excluded from universe';
    if (row.earnings_state === 'blackout') return 'Earnings blackout window';
    if (row.concentration_state === 'high') return 'Position concentration too high';
    if (row.earnings_state === 'approaching') return `Earnings in ${row.days_to_earnings}d — caution`;
    if (row.concentration_state === 'moderate') return 'Moderate concentration — watch';
    return 'All gates clear';
  })();

  const gateColor = !row.can_trade ? 'var(--red)'
    : (row.earnings_state === 'approaching' || row.concentration_state === 'moderate') ? 'var(--yellow)'
    : 'var(--green)';

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* Vol context */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <DetailChip label="IVR" value={row.ivr != null ? `${row.ivr.toFixed(0)}` : '—'} color={ivrColor} />
        <DetailChip label="IV" value={row.current_iv != null ? `${row.current_iv.toFixed(1)}%` : '—'} />
        <DetailChip label="HV20" value={row.hv20 != null ? `${row.hv20.toFixed(1)}%` : '—'} />
        <DetailChip label="IV–HV spread" value={row.spread_pp != null ? `${row.spread_pp > 0 ? '+' : ''}${row.spread_pp.toFixed(1)}pp` : '—'} color={spreadColor} />
      </div>

      <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />

      {/* Risk context */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <DetailChip label="Earnings" value={row.days_to_earnings != null ? `${row.days_to_earnings}d` : '—'} color={earnColor} />
        <DetailChip label="Earn state" value={row.earnings_state ?? '—'} color={earnColor} />
        <DetailChip label="Conc%" value={row.concentration_pct !== 0 ? `${row.concentration_pct > 0 ? '+' : ''}${row.concentration_pct.toFixed(1)}%` : '—'} color={concColor} />
      </div>

      <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />

      {/* Gate + pretrade */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gate reason</span>
          <span style={{ fontSize: 12, color: gateColor }}>{gateNote}</span>
        </div>
        <DetailChip
          label="Pretrade"
          value={pretrade ?? '—'}
          color={pretrade === 'PROCEED' ? 'var(--green)' : pretrade === 'BLOCKED' ? 'var(--red)' : 'var(--muted)'}
        />
      </div>

      <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />

      {/* Strategy + efficiency + earn move */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <DetailChip label="Rec strategy" value={strategy ?? '—'} color="var(--accent)" />
        <DetailChip label="Cap eff" value={eff != null ? `${eff.toFixed(1)}%` : '—'} color={effColor} />
        {ev && (
          <>
            {ev.implied != null && <DetailChip label="Impl move" value={`±${ev.implied.toFixed(1)}%`} color="var(--accent)" />}
            {ev.avg != null && <DetailChip label="Avg move" value={`±${ev.avg.toFixed(1)}%`} color="var(--muted)" />}
          </>
        )}
      </div>

      <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />

      {/* Stage trade */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!showForm ? (
          <button
            onClick={() => { setStageStrategy(strategy ?? ''); setShowForm(true); }}
            disabled={staging}
            style={{
              background: staged ? 'rgba(34,197,94,0.15)' : 'var(--accent)',
              color: staged ? 'var(--green)' : '#fff',
              border: staged ? '1px solid rgba(34,197,94,0.4)' : 'none',
              borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {staged ? '✓ Staged' : '⊕ Stage Trade'}
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
            {/* Vol context: 1-SD move + ATM PoP */}
            {row.price != null && row.current_iv != null && (
              <div style={{
                background: 'var(--surface2)', border: '1px solid var(--border2)',
                borderRadius: 6, padding: '6px 10px', fontSize: 11,
              }}>
                {(() => {
                  const dte = parseInt(stageDte, 10) || 45;
                  const sd = calc1SD(row.price, row.current_iv, dte);
                  const pop = calcPoP(row.price, row.price, dte, row.current_iv);
                  const sdPct = (sd / row.price * 100).toFixed(1);
                  return (
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--muted)' }}>
                        1-SD <span style={{ color: 'var(--accent)', fontFamily: 'monospace', fontWeight: 600 }}>±${sd.toFixed(2)}</span> (±{sdPct}%)
                      </span>
                      <span style={{ color: 'var(--muted)' }}>
                        ATM PoP <span style={{ color: pop > 55 ? 'var(--green)' : pop > 45 ? 'var(--yellow)' : 'var(--red)', fontFamily: 'monospace', fontWeight: 600 }}>{pop.toFixed(0)}%</span>
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
            <input
              value={stageStrategy}
              onChange={e => setStageStrategy(e.target.value)}
              placeholder="Strategy (e.g. PMCC)"
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--fg)' }}
            />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={stageDte}
                onChange={e => setStageDte(e.target.value)}
                placeholder="DTE"
                style={{ width: 60, fontSize: 12, padding: '4px 8px', borderRadius: 4, background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--fg)' }}
              />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>DTE</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleStage}
                disabled={staging}
                style={{ flex: 1, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                {staging ? '…' : 'Stage'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border2)', borderRadius: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
