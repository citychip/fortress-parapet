import { useState } from 'react';

// ── Hook ──────────────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc';

export function useSortable<T extends Record<string, any>>(
  rows: T[],
  defaultKey?: string,
  defaultDir: SortDir = 'asc'
) {
  const [key, setKey] = useState<string | null>(defaultKey ?? null);
  const [dir, setDir] = useState<SortDir>(defaultDir);

  const toggle = (k: string) => {
    if (key === k) {
      setDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setKey(k);
      setDir('asc');
    }
  };

  const sorted = key
    ? [...rows].sort((a, b) => {
        let av = a[key], bv = b[key];
        // Null/undefined always last
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        // Numeric
        if (typeof av === 'number' && typeof bv === 'number') {
          return (av - bv) * (dir === 'asc' ? 1 : -1);
        }
        // String
        const as = String(av).toLowerCase();
        const bs = String(bv).toLowerCase();
        return (as < bs ? -1 : as > bs ? 1 : 0) * (dir === 'asc' ? 1 : -1);
      })
    : rows;

  return { sorted, key, dir, toggle };
}

// ── SortTh ────────────────────────────────────────────────────────────────────

interface SortThProps {
  label: string;
  sortKey: string;
  activeKey: string | null;
  dir: SortDir;
  onToggle: (k: string) => void;
  align?: 'left' | 'right' | 'center';
}

export function SortTh({ label, sortKey, activeKey, dir, onToggle, align = 'left' }: SortThProps) {
  const active = activeKey === sortKey;
  return (
    <th
      onClick={() => onToggle(sortKey)}
      style={{
        cursor: 'pointer', userSelect: 'none', textAlign: align,
        whiteSpace: 'nowrap',
        color: active ? 'var(--text)' : undefined,
        background: active ? 'var(--surface2)' : undefined,
      }}
    >
      {label}
      <span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.3 }}>
        {active ? (dir === 'asc' ? '▲' : '▼') : '⬍'}
      </span>
    </th>
  );
}
