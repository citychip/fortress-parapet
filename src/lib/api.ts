// ── Core data types ──────────────────────────────────────────────────────────

export interface AlertData {
  id: string;
  ticker?: string;
  message?: string;
  state: 'ok' | 'watch' | 'act' | 'safe' | string;
  condition?: string;
  threshold?: number;
  created_at?: string;
}

export interface PositionData {
  ticker: string;
  strategy?: string;
  leg_count?: number;
  // aggregated view: spread strikes
  short_strike?: number | null;
  long_strike?: number | null;
  // unaggregated (legs) view: individual leg fields
  strike?: number | null;
  leg_direction?: 'short' | 'long' | string;
  right?: 'C' | 'P' | string | null;
  qty?: number | null;
  market_value?: number | null;
  expiry?: string | null;
  current_delta?: number | null;
  net_liq_pct?: number | null;
  alert_state?: 'safe' | 'watch' | 'act' | string;
  _legs?: PositionData[];
}

export interface PnlTickerData {
  ticker: string;
  pnl: number | null;
}

export interface PnLData {
  summary?: {
    unrealized_pnl?: number | null;
    realized_pnl?: number | null;
    total_pnl?: number | null;
  };
  by_ticker?: PnlTickerData[];
}

export interface OrderLeg {
  action: 'BUY' | 'SELL' | string;
  sec_type?: string;
  right?: 'C' | 'P' | string;
  strike?: number | null;
  expiry?: string | null;
  ratio?: number;
}

export interface OrderData {
  id: string;
  ticker?: string;
  strategy?: string;
  order_type?: string;
  status?: string;
  limit_price?: number | null;
  quantity?: number | null;
  max_loss?: number | null;
  notes?: string | null;
  created_at?: string;
  legs?: OrderLeg[];
}

export interface RegimeSignal {
  source: string;
  signal: string;
  weight: number;
  note?: string;
}

export interface BriefingData {
  account?: {
    net_liq?: number | null;
    available_funds?: number | null;
    excess_liq?: number | null;
    thresholds?: { available_funds_ok?: boolean; excess_liq_ok?: boolean };
  };
  macro_regime?: {
    regime?: string;
    vix?: number | null;
    vix_state?: string | null;
  };
  pacing?: {
    used?: number;
    max_per_week?: number;
    remaining?: number;
  };
  greeks?: {
    portfolio_delta?: number | null;
    portfolio_theta?: number | null;
    portfolio_vega?: number | null;
    beta_weighted_delta?: number | null;
  };
  concentration?: {
    top?: Array<{ ticker: string; pct: number }>;
    all?: Record<string, number>;
    msft_warning?: boolean;
  };
  staleness?: { hours?: number; state?: string };
  actions?: Array<{ ticker?: string; id?: string; action?: string; type?: string; urgency?: string; message?: string }>;
}

export interface IbkrStatusData {
  active_backend?: string;
  web_api?: {
    account?: string;
    opra_subscribed?: boolean;
    session_status?: {
      authenticated?: boolean;
      connected?: boolean;
      established?: boolean;
    };
    error?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '';
const API_TOKEN = (import.meta.env.VITE_API_TOKEN as string) || '';

// ── Module-level GET cache (30s TTL) ─────────────────────────────────────────
// Prevents redundant fetches when navigating between pages within the TTL window.
// Write operations (POST/DELETE/PATCH) bypass and invalidate the cache.
const _cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 30_000;

export function invalidateCache(pathPrefix?: string) {
  if (!pathPrefix) { _cache.clear(); return; }
  for (const key of _cache.keys()) {
    if (key.startsWith(pathPrefix)) _cache.delete(key);
  }
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const method = (opts?.method ?? 'GET').toUpperCase();
  const isGet  = method === 'GET';

  if (isGet) {
    const cached = _cache.get(path);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.data as T;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'X-API-Token': API_TOKEN,
      'Content-Type': 'application/json',
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  const data = await res.json();

  if (isGet) _cache.set(path, { data, ts: Date.now() });
  else invalidateCache(); // mutation — nuke everything

  return data as T;
}

// ── Data integrity (gateway-down guard) ──────────────────────────────────────
// Honest live/fallback/down verdict for the market-data backbone. The backend
// route live-probes the IBKR gateway rather than trusting the briefing
// `staleness` field, which lingers "fresh" after the gateway dies. The badge at
// the top of the UI consumes this so the operator never trades on frozen data.
export type IntegrityState = 'live' | 'fallback' | 'down' | 'unknown';
export interface IntegrityData {
  integrity: IntegrityState;
  live: boolean;
  source: 'ibkr' | 'yfinance' | 'none' | string;
  delayed: boolean;
  probe_ticker?: string;
  spot?: number | null;
  checked_at?: string;
  message?: string;
}

// Maps the capability payload to an integrity verdict — used as the fallback
// when /api/data-integrity isn't deployed yet (active_backend 'web_api' + an
// authenticated session === live; anything else === gateway down → fallback).
function integrityFromCapability(s: IbkrStatusData): IntegrityData {
  const authed = s?.web_api?.session_status?.authenticated === true;
  const live = authed && s?.active_backend === 'web_api';
  return {
    integrity: live ? 'live' : 'fallback',
    live,
    source: live ? 'ibkr' : 'yfinance',
    delayed: !live,
    message: live
      ? 'IBKR Web API authenticated — real-time data.'
      : 'IBKR gateway not authenticated — data is delayed/fallback. Check System → Connections.',
  };
}

export const getDataIntegrity = async (): Promise<IntegrityData> => {
  try {
    const d = await req<IntegrityData & { error?: string }>('/api/data-integrity');
    if (d && !d.error && d.integrity) return d;
  } catch { /* route not deployed yet → fall back to capability */ }
  try {
    return integrityFromCapability(await getIbkrStatus());
  } catch {
    return { integrity: 'unknown', live: false, source: 'none', delayed: true,
             message: 'Cannot reach the backend to verify data source.' };
  }
};

// ── Briefing / Overview ─────────────────────────────────────────────────────
export const getBriefing   = () => req<BriefingData>('/api/briefing');
export const getIbkrStatus = () => req<IbkrStatusData>('/api/ibkr/capability');

// ── Portfolio ────────────────────────────────────────────────────────────────
export const getPositions      = (aggregated = true) =>
  req<{ positions: PositionData[] }>(`/api/positions?aggregated=${aggregated}`);
export const getPnl            = () => req<PnLData>('/api/pnl');
export const getPnlHistory     = () => req<any>('/api/pnl/history');
export interface BetaComponent {
  ticker: string;
  beta?: number | null;
  price?: number | null;
  delta_contribution?: number | null;
}
export interface BetaData {
  beta_weighted_delta?: number | null;
  spy_price?: number | null;
  component_betas?: BetaComponent[];
}
export interface SectorRow {
  sector?: string;
  name?: string;
  pct?: number | null;
  notional?: number | null;
  tickers?: string[];
}
export const getPortfolioBeta  = () => req<BetaData>('/api/portfolio/beta');
export const getSectorExposure = () => req<{ sectors?: SectorRow[] } | SectorRow[]>('/api/portfolio/sector-exposure');
export const getCapitalEff     = () => req<any>('/api/portfolio/capital-efficiency');
export interface ForwardPnlPoint { price: number; pnl: number; }
export interface ForwardPnlData {
  ticker: string;
  spot: number;
  target_price: number;
  target_date: string;
  iv_adj: number;
  target_pnl: number;
  curve: ForwardPnlPoint[];
  max_profit: number;
  max_loss: number;
  net_premium: number;
  breakevens: number[];
}
export const getForwardPnl = (
  ticker: string,
  legs: any[],
  targetPrice: number,
  targetDate: string,
  ivAdj = 1.0,
) => {
  const params = new URLSearchParams({
    ticker,
    legs: JSON.stringify(legs),
    target_price: String(targetPrice),
    target_date: targetDate,
    iv_adj: String(ivAdj),
  });
  return req<ForwardPnlData>(`/api/options/forward-pnl?${params.toString()}`);
};
export const getJournal        = () => req<any>('/api/journal');
export const addJournalEntry   = (body: any) =>
  req<any>('/api/journal', { method: 'POST', body: JSON.stringify(body) });

// ── Market ───────────────────────────────────────────────────────────────────
export const getMarketIntel    = () => req<any>('/api/market-intelligence');
export const getCalendar       = () => req<any>('/api/calendar');
export const fetchEarnings     = () => req<any>('/api/calendar/fetch-earnings', { method: 'POST' });

// Macro-event catalyst gate (Strategy §4 binary-event timing). Claude-curated
// store; backend computes days_until + a defer advisory. Display-only here.
export interface MacroEvent {
  label: string;
  date: string;
  days_until: number | null;
  impact: string;            // 'high' | 'medium' | 'low'
  note?: string | null;
}
export interface MacroEventsData {
  events: MacroEvent[];
  defer_advisory: boolean;
  defer_reason?: string | null;
  nearest_high_impact?: MacroEvent | null;
  defer_days?: number;
  updated_at?: string | null;
  stale?: boolean;
}
export const getMacroEvents    = () => req<MacroEventsData>('/api/options/macro-events');

// Order queue: which orders still need a decision (pending/submitted/failed) vs
// terminal history (expired/declined/filled/cancelled). Shared by the Triage
// table and the Sidebar badge so the count and the list always agree.
const ACTIONABLE_ORDER_STATUSES = new Set(['pending', 'submitted', 'failed']);
export function actionableOrders(payload: any): any[] {
  const all = [...(payload?.orders ?? []), ...(payload?.pending ?? [])];
  return all.filter(o => ACTIONABLE_ORDER_STATUSES.has(String(o?.status ?? 'pending').toLowerCase()));
}
export const getQuantDataReports = () => req<any>('/api/qd/tools');

export interface IvRankData {
  ticker: string;
  session_date: string;
  iv_rank: number | null;
  current_iv: number | null;
  iv_52w_high: number | null;
  iv_52w_low: number | null;
  call_iv: number | null;
  put_iv: number | null;
  /** "iv_snapshots" (true IV rank from own history) | "hv_proxy" (cold-start) | undefined (legacy QD) */
  source?: string;
  n_snapshots?: number;
}
// Primary: backend yfinance route (/api/options/iv-rank) — added after the
// upstream quantdata-mcp iv_rank bug (ticker arg ignored, verified 2026-06-10).
// Falls back to the legacy QD route if the backend route isn't deployed yet.
export const getIvRank = async (ticker: string): Promise<IvRankData> => {
  try {
    const d = await req<IvRankData & { error?: string }>(`/api/options/iv-rank/${encodeURIComponent(ticker)}`);
    if (!d?.error && d?.iv_rank != null) return d;
  } catch {}
  return req<IvRankData>(`/api/qd/iv-rank/${encodeURIComponent(ticker)}`);
};

export interface CandidateRow {
  ticker: string;
  price: number | null;
  ivr: number | null;
  current_iv: number | null;
  hv20: number | null;
  spread_pp: number | null;
  days_to_earnings: number | null;
  signal: string | null;
  concentration_pct: number;
  earnings_state: 'clear' | 'approaching' | 'blackout' | string;
  concentration_state: 'low' | 'moderate' | 'high' | string;
  excluded: boolean;
  exclusion_reason: string | null;
  can_trade: boolean;
}
export const getCandidates = () =>
  req<{ as_of: string | null; rows: CandidateRow[] }>('/api/candidates');

export interface StrategyOption {
  short_name: string;
  recommended: boolean;
  regime_score: number;
  annualized_yield?: number | null;
  capital_required?: number | null;
}
export interface StrategyMetrics {
  regime: string;
  ivr: number | null;
  earnings_safe?: boolean;
  strategies: StrategyOption[];
}
export const getStrategyMetrics = (ticker: string, mode = 'new', target_dte = 45) =>
  req<StrategyMetrics>(
    `/api/options/strategy_metrics?ticker=${encodeURIComponent(ticker)}&mode=${mode}&target_dte=${target_dte}`
  );

// ── Manage / Triage ──────────────────────────────────────────────────────────
export interface RollPosition {
  ticker: string;
  strategy?: string | null;
  expiry?: string | null;
  short_strike?: number | null;
  current_delta?: number | null;
  current_dte?: number | null;
  urgency?: 'urgent' | 'warning' | 'approaching' | 'none' | string;
  reasons?: string[];
}
export interface RollAllData {
  summary?: { urgent?: number; warning?: number; approaching?: number; none?: number };
  positions?: RollPosition[];
}
export interface StopLossPosition {
  ticker: string;
  latest_price?: number | null;
  sma_200?: number | null;
  verdict?: 'ACT' | 'WATCH' | 'SAFE' | string;
  recommended_action?: string | null;
  signals?: string[];
}
export interface StopLossAllData {
  summary?: { act_immediately?: number; act?: number; watch?: number; safe?: number };
  positions?: StopLossPosition[];
}
export const getTimeOfDay   = () => req<{ group?: string }>('/api/run/time_of_day');
export const getRollAll     = () => req<RollAllData>('/api/manage/roll_all');
export const getStopLossAll = () => req<StopLossAllData>('/api/manage/stop_loss_all');
// Sprint 16.1 — advisory sub-flags (non-blocking heads-up; separate from the
// five hard gates). macro_defer/vix_term are market-wide; ex_div is per-ticker.
export interface Advisory {
  name: string;
  level: 'ok' | 'amber' | 'unknown';
  detail?: string | null;
  state?: string | null;
  severity?: string | null;
}
export interface PretradeRow {
  ticker: string;
  verdict?: string | null;
  caution?: boolean;
  caution_flags?: string[];
}
export interface PretradeAllData {
  results?: PretradeRow[];
  market_advisories?: { macro_defer?: Advisory; vix_term?: Advisory };
  summary?: { proceed?: number; blocked?: number; caution?: number };
}
export const getPretradeAll = () => req<PretradeAllData>('/api/manage/pretrade_all');
export const evaluateRoll   = (ticker: string) =>
  req<any>(`/api/manage/evaluate_roll?ticker=${encodeURIComponent(ticker)}`);

// ── Options analytics ────────────────────────────────────────────────────────
export const getGex          = (ticker: string) => req<any>(`/api/options/gex/${encodeURIComponent(ticker)}`);
export const getVolSkew      = (ticker: string) => req<any>(`/api/options/vol-skew/${encodeURIComponent(ticker)}`);
export const getVolAnalytics = (ticker: string) => req<any>(`/api/options/vol-analytics?ticker=${encodeURIComponent(ticker)}`);

// ── Reports ──────────────────────────────────────────────────────────────────
export interface TradeReportData {
  as_of?: string;
  macro?: { regime?: string };
  summary?: { stop_loss_alerts_count?: number; entry_candidates_count?: number; exit_candidates_count?: number };
  stop_loss_alerts?: Array<StopLossPosition & { strategy?: string | null; reasons?: string[] }>;
  exit_candidates?: Array<{ ticker: string; strategy?: string | null; action?: string; net_market_value?: number | null; note?: string | null }>;
  entry_candidates?: Array<{
    ticker: string; iv_rank?: number | null; days_to_earnings?: number | null;
    earnings_state?: string | null; concentration_pct?: number | null;
    has_existing_position?: boolean; action?: string | null;
  }>;
}
export const getTradeReport       = () => req<TradeReportData>('/api/manage/trade_report');
export const getPositionLimits    = (ticker: string, legs: any[]) => {
  const params = new URLSearchParams({ ticker, legs: JSON.stringify(legs) });
  return req<any>(`/api/options/position-limits?${params.toString()}`);
};
export const getEarningsVolatility = (ticker: string) =>
  req<any>(`/api/market/earnings-volatility/${encodeURIComponent(ticker)}`);

// ── Orders ───────────────────────────────────────────────────────────────────
export const getPendingOrders  = () => req<{ orders?: OrderData[]; pending?: OrderData[] }>('/api/orders/pending');
export const approveOrder      = (id: string) =>
  req<any>(`/api/orders/pending/${id}/approve`, { method: 'POST' });
export const declineOrder      = (id: string) =>
  req<any>(`/api/orders/pending/${id}`, { method: 'DELETE' });
export const stageOrder        = (body: any) =>
  req<any>('/api/orders/stage', { method: 'POST', body: JSON.stringify(body) });

// ── Alerts ───────────────────────────────────────────────────────────────────
export const getAlerts         = () => req<{ alerts: AlertData[] }>('/api/alerts');
export const addAlert          = (body: any) =>
  req<any>('/api/alerts', { method: 'POST', body: JSON.stringify(body) });
export const deleteAlert       = (id: string) =>
  req<any>(`/api/alerts/${id}`, { method: 'DELETE' });

// ── Settings ─────────────────────────────────────────────────────────────────
export const getSettings       = () => req<any>('/api/settings');
export const getSpyHedge       = () => req<any>('/api/manage/spy_hedge_coverage');
export const getDpFloorsGex    = (ticker: string) => req<any>(`/api/chart/${encodeURIComponent(ticker)}/levels`);
export const getPcsExposure    = () => req<any>('/api/portfolio/pcs-exposure');
export const updateSettings    = (section: string, data: any) =>
  req<any>(`/api/settings/${section}`, { method: 'PATCH', body: JSON.stringify(data) });

// ── Universe ─────────────────────────────────────────────────────────────────
export const getUniverse     = () => req<any>('/api/universe');
export const addTicker       = (ticker: string, tier = 'tier1') =>
  req<any>('/api/universe/add', { method: 'POST', body: JSON.stringify({ ticker, tier }) });
export const removeTicker    = (tier: string, ticker: string) =>
  req<any>(`/api/universe/${encodeURIComponent(tier)}/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
export const excludeTicker   = (ticker: string, reason = 'manual', note = '') =>
  req<any>('/api/universe/exclude', { method: 'POST', body: JSON.stringify({ ticker, reason, note }) });
export const unexcludeTicker = (ticker: string) =>
  req<any>(`/api/universe/exclude/${encodeURIComponent(ticker)}`, { method: 'DELETE' });

// ── Scripts ──────────────────────────────────────────────────────────────────
export const listScripts       = () => req<any>('/api/run/scripts');
export const runScript         = (key: string) =>
  req<any>(`/api/run/${key}`, { method: 'POST' });

// ── Infrastructure ───────────────────────────────────────────────────────────
export const triggerIbkrSync   = () => req<any>('/api/ibkr/sync', { method: 'POST' });
export const retryIbkrSync     = () => req<any>('/api/ibkr/upload/retry', { method: 'POST' });
export const ibkrReconnect     = () => req<{ ok: boolean; message?: string }>('/api/ibkr/reconnect', { method: 'POST' });
export const testQuantData     = () => req<{ ok: boolean; message?: string; iv_rank?: number | null; error?: string }>('/api/settings/test_quantdata', { method: 'POST' });
export const getApiHealth      = () => req<{ status: string; version?: string }>('/api/health');

// ── Helpers ──────────────────────────────────────────────────────────────────
export function fmt$(n: number | null | undefined, decimals = 0): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (n < 0 ? '-$' : '$') + s;
}

export function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(decimals) + '%';
}

export function fmtDelta(n: number | null | undefined): string {
  if (n == null) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(3);
}

// Consistent YYYY-MM-DD HH:MM:SS timestamp display, matching the app's
// date_format setting (avoids locale-dependent toLocaleString output like "30-5-2026").
export function fmtDateTime(ts: string | number | Date | null | undefined): string {
  if (ts == null) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function clsN(n: number | null | undefined): string {
  if (n == null) return '';
  return n >= 0 ? 'text-green' : 'text-red';
}
