import { useState, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc';

// ── localStorage helpers ──────────────────────────────────────────────────────

function readSort(sk: string | undefined, dk: string | undefined, dd: SortDir) {
  if (!sk) return { key: dk ?? null, dir: dd };
  try {
    const raw = localStorage.getItem(`sort:${sk}`);
    if (raw) return JSON.parse(raw) as { key: string | null; dir: SortDir };
  } catch {}
  return { key: dk ?? null, dir: dd };
}

function writeSort(sk: string | undefined, key: string | null, dir: SortDir) {
  if (!sk) return;
  try { localStorage.setItem(`sort:${sk}`, JSON.stringify({ key, dir })); } catch {}
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSortable<T extends Record<string, any>>(
  rows: T[],
  defaultKey?: string,
  defaultDir: SortDir = 'asc',
  storageKey?: string,
) {
  const init = readSort(storageKey, defaultKey, defaultDir);
  const [key, setKey] = useState<string | null>(init.key);
  const [dir, setDir] = useState<SortDir>(init.dir);

  // Persist on change
  useEffect(() => {
    writeSort(storageKey, key, dir);
  }, [key, dir, storageKey]);

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
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') {
          return (av - bv) * (dir === 'asc' ? 1 : -1);
        }
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
