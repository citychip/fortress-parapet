import { ReactNode } from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  onRefresh?: () => void;
  loading?: boolean;
  lastUpdated?: string | null;
}

export default function Layout({ title, children, action, onRefresh, loading, lastUpdated }: LayoutProps) {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '16px 28px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--surface)',
          flexShrink: 0,
        }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>{title}</h1>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          {action}
          {onRefresh && (
            <button onClick={onRefresh} disabled={loading} style={{
              background: 'var(--surface2)',
              color: 'var(--muted)',
              border: '1px solid var(--border2)',
              padding: '5px 12px',
              fontSize: 12,
            }}>
              {loading ? '…' : '↻ Refresh'}
            </button>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '24px 28px', overflow: 'auto' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
