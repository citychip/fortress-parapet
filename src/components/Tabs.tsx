import { ReactNode } from 'react';

interface Tab { key: string; label: string; }

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  children: ReactNode;
}

export function TabBar({ tabs, active, onChange }: Omit<TabsProps, 'children'>) {
  return (
    <div style={{
      display: 'flex', gap: 2,
      borderBottom: '1px solid var(--border)',
      marginBottom: 20,
    }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          background: 'none',
          color: active === t.key ? 'var(--text)' : 'var(--muted)',
          borderRadius: '6px 6px 0 0',
          padding: '8px 16px',
          fontWeight: active === t.key ? 600 : 400,
          borderBottom: active === t.key ? '2px solid var(--accent)' : '2px solid transparent',
          marginBottom: -1,
          fontSize: 13,
        }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
