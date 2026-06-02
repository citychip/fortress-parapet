const API_BASE = (import.meta.env.VITE_API_BASE as string) || '';
const API_TOKEN = (import.meta.env.VITE_API_TOKEN as string) || '';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
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
  return res.json();
}

// ── Briefing / Overview ─────────────────────────────────────────────────────
export const getBriefing       = () => req<any>('/api/briefing');
export const getIbkrStatus     = () => req<any>('/api/ibkr/capability');

// ── Portfolio ────────────────────────────────────────────────────────────────
export const getPositions      = (aggregated = true) =>
  req<any>(`/api/positions?aggregated=${aggregated}`);
export const getPnl            = () => req<any>('/api/pnl');
export const getPnlHistory     = () => req<any>('/api/pnl/history');
export const getPortfolioBeta  = () => req<any>('/api/portfolio/beta');
export const getSectorExposure = () => req<any>('/api/portfolio/sector-exposure');
export const getCapitalEff     = () => req<any>('/api/portfolio/capital-efficiency');
export const getForwardPnl     = () => req<any>('/api/options/forward-pnl');
export const getJournal        = () => req<any>('/api/journal');
export const addJournalEntry   = (body: any) =>
  req<any>('/api/journal', { method: 'POST', body: JSON.stringify(body) });

// ── Market ───────────────────────────────────────────────────────────────────
export const getMarketIntel    = () => req<any>('/api/market-intelligence');
export const getCalendar       = () => req<any>('/api/calendar');
export const fetchEarnings     = () => req<any>('/api/calendar/fetch-earnings', { method: 'POST' });
export const getQuantDataReports = () => req<any>('/api/qd/tools');

// ── Orders ───────────────────────────────────────────────────────────────────
export const getPendingOrders  = () => req<any>('/api/orders/pending');
export const approveOrder      = (id: string) =>
  req<any>(`/api/orders/pending/${id}/approve`, { method: 'POST' });
export const declineOrder      = (id: string) =>
  req<any>(`/api/orders/pending/${id}`, { method: 'DELETE' });

// ── Alerts ───────────────────────────────────────────────────────────────────
export const getAlerts         = () => req<any>('/api/alerts');
export const addAlert          = (body: any) =>
  req<any>('/api/alerts', { method: 'POST', body: JSON.stringify(body) });
export const deleteAlert       = (id: string) =>
  req<any>(`/api/alerts/${id}`, { method: 'DELETE' });

// ── Settings ─────────────────────────────────────────────────────────────────
export const getSettings       = () => req<any>('/api/settings');
export const updateSettings    = (section: string, data: any) =>
  req<any>(`/api/settings/${section}`, { method: 'PATCH', body: JSON.stringify(data) });

// ── Universe ─────────────────────────────────────────────────────────────────
export const getUniverse       = () => req<any>('/api/universe');
export const addTicker         = (ticker: string, tier = 'tier1') =>
  req<any>(`/api/universe/${tier}/${ticker}`, { method: 'POST' });
export const excludeTicker     = (ticker: string) =>
  req<any>(`/api/universe/exclude/${ticker}`, { method: 'POST' });

// ── Scripts ──────────────────────────────────────────────────────────────────
export const listScripts       = () => req<any>('/api/run/scripts');
export const runScript         = (key: string) =>
  req<any>(`/api/run/${key}`, { method: 'POST' });

// ── Infrastructure ───────────────────────────────────────────────────────────
export const triggerIbkrSync   = () => req<any>('/api/ibkr/sync', { method: 'POST' });
export const retryIbkrSync     = () => req<any>('/api/ibkr/upload/retry', { method: 'POST' });

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
