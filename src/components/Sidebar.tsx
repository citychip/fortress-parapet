import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { getIbkrStatus, getStopLossAll, getPendingOrders, type IbkrStatusData } from '../lib/api';

// badgeKeys link a nav item to live counts. Sprint 13 (#78): pending-orders
// badge moved from System → Triage, where order status now lives.
const NAV: { path: string; label: string; icon: string; badgeKeys?: Array<'act' | 'orders'> }[] = [
  { path: '/',           label: 'Briefing',   icon: '◈' },
  { path: '/triage',     label: 'Triage',     icon: '⚑', badgeKeys: ['act', 'orders'] },
  { path: '/candidates', label: 'Candidates', icon: '⊕' },
  { path: '/market',     label: 'Market',     icon: '◎' },
  { path: '/positions',  label: 'Positions',  icon: '▦' },
  { path: '/system',     label: 'System',     icon: '⚙' },
];

function useIbkrDot() {
  const [data, setData] = useState<IbkrStatusData | null>(null);
  useEffect(() => {
    const poll = () => getIbkrStatus().then(setData).catch(() => setData(null));
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);
  const s = data?.web_api?.session_status;
  if (!s)                              return { color: 'var(--muted)',  label: 'IBKR —', title: 'Status unknown' };
  if (s.established)                   return { color: 'var(--green)',  label: 'IBKR ●', title: 'Connected & established' };
  if (s.authenticated && s.connected)  return { color: 'var(--yellow)', label: 'IBKR ◑', title: 'Authenticated, not established' };
  if (s.authenticated)                 return { color: 'var(--yellow)', label: 'IBKR ○', title: 'Authenticated only' };
  return                                      { color: 'var(--red)',    label: 'IBKR ✕', title: 'Disconnected' };
}

function useActCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const load = () => getStopLossAll()
      .then((d: any) => setCount((d?.summary?.act_immediately ?? 0) + (d?.summary?.act ?? 0)))
      .catch(() => {});
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  return count;
}

function useOrdersCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const load = () => getPendingOrders()
      .then((d: any) => {
        const n = (d?.orders?.length ?? 0) + (d?.pending?.length ?? 0);
        setCount(n);
      })
      .catch(() => {});
    load();
    const id = setInterval(load, 2 * 60_000);
    return () => clearInterval(id);
  }, []);
  return count;
}

export default function Sidebar() {
  const [location, navigate] = useLocation();
  const ibkr        = useIbkrDot();
  const actCount    = useActCount();
  const ordersCount = useOrdersCount();

  const badgeCounts: Record<string, number> = { act: actCount, orders: ordersCount };
  const badgeColors: Record<string, string> = {
    act:    'var(--red)',
    orders: 'rgba(245,158,11,0.95)',
  };

  return (
    <nav style={{
      width: 200,
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      padding: '20px 0',
    }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 24px', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.02em' }}>Parapet</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Fortress v5</div>
        <div title={ibkr.title} style={{ fontSize: 11, color: ibkr.color, marginTop: 8, fontWeight: 600, letterSpacing: '0.02em', cursor: 'default' }}>
          {ibkr.label}
        </div>
      </div>

      {/* Nav items */}
      {NAV.map(item => {
        const active = location === item.path || (item.path !== '/' && location.startsWith(item.path));
        const badges = (item.badgeKeys ?? [])
          .map(k => ({ key: k, count: badgeCounts[k] ?? 0, color: badgeColors[k] ?? 'var(--red)' }))
          .filter(b => b.count > 0);
        const iconColor = active ? 'var(--accent)' : badges.length ? badges[0].color : 'var(--muted)';

        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 20px',
              background: active ? 'var(--surface2)' : 'none',
              color: active ? 'var(--text)' : 'var(--muted)',
              borderRadius: 0,
              fontWeight: active ? 600 : 400,
              fontSize: 13,
              borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 14, color: iconColor }}>{item.icon}</span>
            {item.label}
            {badges.length > 0 && (
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {badges.map(b => (
                  <span key={b.key} title={b.key === 'act' ? 'Stop-loss ACT signals' : 'Pending orders'} style={{
                    minWidth: 18, height: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 9,
                    background: b.color,
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '0 5px',
                  }}>{b.count}</span>
                ))}
              </span>
            )}
          </button>
        );
      })}

      {/* Footer */}
      <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
        backend :8081
      </div>
    </nav>
  );
}
