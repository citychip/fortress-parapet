import { useLocation } from 'wouter';

const NAV = [
  { path: '/',            label: 'Overview',   icon: '◈' },
  { path: '/portfolio',   label: 'Portfolio',  icon: '▦' },
  { path: '/candidates',  label: 'Candidates', icon: '⊕' },
  { path: '/market',      label: 'Market',     icon: '◎' },
  { path: '/orders',      label: 'Orders',     icon: '⊡' },
  { path: '/system',      label: 'System',     icon: '⚙' },
];

export default function Sidebar() {
  const [location, navigate] = useLocation();

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
      <div style={{
        padding: '0 20px 24px',
        borderBottom: '1px solid var(--border)',
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.02em' }}>
          Parapet
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          Fortress v5
        </div>
      </div>

      {/* Nav items */}
      {NAV.map(item => {
        const active = location === item.path || (item.path !== '/' && location.startsWith(item.path));
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
            <span style={{ fontSize: 14, color: active ? 'var(--accent)' : 'var(--muted)' }}>{item.icon}</span>
            {item.label}
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
