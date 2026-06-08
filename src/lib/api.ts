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

// ── Briefing / Overview ─────────────────────────────────────────────────────
export const getBriefing   = () => req<BriefingData>('/api/briefing');
export const getIbkrStatus = () => req<IbkrStatusData>('/api/ibkr/capability');

// ── Portfolio ────────────────────────────────────────────────────────────────
export const getPositions      = (aggregated = true) =>
  req<{ positions: PositionData[] }>(`/api/positions?aggregated=${aggregated}`);
export const getPnl            = () => req<PnLData>('/api/pnl');
export const getPnlHistory     = () => req<any>('/api/pnl/history');
export const getPortfolioBeta  = () => req<any>('/api/portfolio/beta');
export const getSectorExposure = () => req<any>('/api/portfolio/sector-exposure');
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
}
export const getIvRank = (ticker: string) =>
  req<IvRankData>(`/api/qd/iv-rank/${encodeURIComponent(ticker)}`);

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

// ── Orders ───────────────────────────────────────────────────────────────────
export const getPendingOrders  = () => req<{ orders?: OrderData[]; pending?: OrderData[] }>('/api/orders/pending');
export const approveOrder      = (id: string) =>
  req<any>(`/api/orders/pending/${id}/approve`, { method: 'POST' });
export const declineOrder      = (id: string) =>
  req<any>(`/api/orders/pending/${id}`, { method: 'DELETE' });

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

export function clsN(n: number | null | undefined): string {
  if (n == null) return '';
  return n >= 0 ? 'text-green' : 'text-red';
}
