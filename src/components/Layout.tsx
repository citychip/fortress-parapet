import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import Sidebar from './Sidebar';
import SourceBadge, { useIntegrity, integrityState, headerTint } from './SourceBadge';
import { getTimeOfDay } from '../lib/api';

function useNarrow(bp = 900) {
  const [narrow, setNarrow] = useState(typeof window !== 'undefined' && window.innerWidth < bp);
  useEffect(() => {
    const handler = () => setNarrow(window.innerWidth < bp);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [bp]);
  return narrow;
}

const KEY_MAP: Record<string, string> = {
  b: '/',
  t: '/triage',
  c: '/candidates',
  m: '/market',
  p: '/positions',
  s: '/system',
};

interface LayoutProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  onRefresh?: () => void;
  loading?: boolean;
  lastUpdated?: string | null;
}

const MKT_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  market_hours: { label: 'Open',   color: 'var(--green)',  bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.35)' },
  pre_market:   { label: 'Pre',    color: 'var(--yellow)', bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.3)' },
  post_market:  { label: 'Closed', color: 'var(--muted)',  bg: 'rgba(100,116,139,0.08)', border: 'var(--border)' },
};

export default function Layout({ title, children, action, onRefresh, loading, lastUpdated }: LayoutProps) {
  const [mktGroup, setMktGroup] = useState<string | null>(null);
  const [loc, navigate] = useLocation();
  const narrow = useNarrow();
  const [sideOpen, setSideOpen] = useState(false);
  const integrity = useIntegrity();
  const tint = headerTint(integrityState(integrity));

  // Close sidebar on navigation when narrow
  useEffect(() => { if (narrow) setSideOpen(false); }, [loc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Market-status chip: poll every 60s (#88) — previously fetched once on
  // mount, so the chip showed "Pre" all day if the app stayed open.
  useEffect(() => {
    const poll = () => getTimeOfDay()
      .then(d => setMktGroup(d?.group ?? null))
      .catch(() => {});
    poll();
    const id = setInterval(poll, 60_000);
    return () => clearInterval(id);
  }, []);

  // Keyboard shortcuts — ignore when typing in inputs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target as HTMLElement)?.isContentEditable) return;
      const path = KEY_MAP[e.key];
      if (path) navigate(path);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  const mktCfg = mktGroup ? (MKT_CFG[mktGroup] ?? { label: mktGroup, color: 'var(--muted)', bg: 'rgba(100,116,139,0.08)', border: 'var(--border)' }) : null;

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Mobile backdrop */}
      {narrow && sideOpen && (
        <div
          onClick={() => setSideOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 99 }}
        />
      )}
      {/* Sidebar — fixed overlay on narrow, static on wide */}
      <div style={narrow ? {
        position: 'fixed', left: 0, top: 0, height: '100%', zIndex: 100,
        transform: sideOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.2s ease',
      } : {}}>
        <Sidebar />
      </div>
      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', marginLeft: narrow ? 0 : undefined }}>
        {/* Header */}
        <div style={{
          padding: '16px 28px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--surface)',
          flexShrink: 0,
          transition: 'background 0.3s ease, border-color 0.3s ease',
          ...tint,
        }}>
          {narrow && (
            <button
              onClick={() => setSideOpen(s => !s)}
              title="Menu"
              style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, padding: '2px 6px', cursor: 'pointer', flexShrink: 0 }}
            >☰</button>
          )}
          <h1 style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>{title}</h1>
          <SourceBadge data={integrity} />
          {lastUpdated && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          {mktCfg && (
            <span style={{
              fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 600,
              color: mktCfg.color, background: mktCfg.bg, border: `1px solid ${mktCfg.border}`,
            }}>
              {mktGroup === 'market_hours' ? '● ' : '○ '}{mktCfg.label}
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
