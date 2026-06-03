import { useState } from 'react';
import Card from '../Card';
import { addTicker, removeTicker, excludeTicker, unexcludeTicker } from '../../lib/api';

// ── Tier metadata ─────────────────────────────────────────────────────────────

const TIERS = [
  { key: 'tier1', label: 'Tier 1', desc: 'High IV — primary candidates',        color: 'var(--accent)', bg: 'rgba(99,102,241,0.1)',  border: 'rgba(99,102,241,0.25)' },
  { key: 'tier2', label: 'Tier 2', desc: 'Moderate IV — secondary candidates',   color: 'var(--yellow)', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
  { key: 'macro', label: 'Macro',  desc: 'Benchmark & hedge instruments',         color: 'var(--green)',  bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)' },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTickers(raw: any[]): string[] {
  return raw.map((t: any) => typeof t === 'string' ? t : (t?.ticker ?? t?.symbol ?? String(t)));
}

function parseExcluded(raw: any[]): Array<{ ticker: string; reason?: string; note?: string }> {
  return raw.map((e: any) =>
    typeof e === 'string' ? { ticker: e } : { ticker: e.ticker, reason: e.reason, note: e.note }
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  universe: any;
  onRefresh: () => void;
}

export function UniverseSection({ universe, onRefresh }: Props) {
  const [newTicker, setNewTicker]     = useState('');
  const [newTier, setNewTier]         = useState<'tier1' | 'tier2' | 'macro'>('tier1');
  const [acting, setActing]           = useState<string | null>(null);
  const [err, setErr]                 = useState<string | null>(null);
  const [excludeTarget, setExcludeTarget] = useState<string | null>(null);
  const [excludeReason, setExcludeReason] = useState('manual');
  const [excludeNote, setExcludeNote]    = useState('');

  const busy = (key: string) => { setActing(key); setErr(null); };
  const done = () => { setActing(null); onRefresh(); };
  const fail = (e: any) => { setActing(null); setErr(String(e?.message ?? e)); };

  const handleAdd = async () => {
    const t = newTicker.trim().toUpperCase();
    if (!t) return;

    // Pre-validate: check for existing presence in any tier or excluded
    const allTierTickers = ['tier1', 'tier2', 'macro']
      .flatMap(tier => parseTickers(universe?.[tier] ?? []));
    const excludedTickers = parseExcluded(universe?.excluded ?? []).map(e => e.ticker);

    if (allTierTickers.includes(t)) {
      const inTier = ['tier1', 'tier2', 'macro'].find(tier => parseTickers(universe?.[tier] ?? []).includes(t));
      setErr(`${t} is already in ${inTier}. Remove it first to re-add to a different tier.`);
      return;
    }
    if (excludedTickers.includes(t)) {
      setErr(`${t} is in the excluded list. Click Restore first, then re-add to a tier.`);
      return;
    }

    busy(`add-${t}`);
    try { await addTicker(t, newTier); setNewTicker(''); done(); }
    catch (e: any) {
      // Extract readable message from backend 409/422 errors
      const msg = e?.message ?? String(e);
      const match = msg.match(/"detail":"([^"]+)"/);
      fail(match ? { message: match[1] } : e);
    }
  };

  const handleRemove = async (tier: string, ticker: string) => {
    if (!confirm(`Remove ${ticker} from ${tier}?`)) return;
    busy(`rm-${ticker}`);
    try { await removeTicker(tier, ticker); done(); }
    catch (e) { fail(e); }
  };

  const handleExclude = async (ticker: string) => {
    busy(`excl-${ticker}`);
    try {
      await excludeTicker(ticker, excludeReason, excludeNote);
      setExcludeTarget(null); setExcludeReason('manual'); setExcludeNote('');
      done();
    } catch (e) { fail(e); }
  };

  const handleUnexclude = async (ticker: string) => {
    busy(`unexcl-${ticker}`);
    try { await unexcludeTicker(ticker); done(); }
    catch (e) { fail(e); }
  };

  // Detect tickers that appear in both a tier AND excluded (state inconsistency)
  const allTierTickers = new Set(
    ['tier1', 'tier2', 'macro'].flatMap(tier => parseTickers(universe?.[tier] ?? []))
  );
  const excludedSet = new Set(parseExcluded(universe?.excluded ?? []).map(e => e.ticker));
  const inconsistent = [...allTierTickers].filter(t => excludedSet.has(t));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {err && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: 'var(--red)' }}>
          {err} <button onClick={() => setErr(null)} style={{ marginLeft: 8, color: 'var(--muted)', background: 'none', padding: '0 4px' }}>×</button>
        </div>
      )}

      {/* Inconsistency warning */}
      {inconsistent.length > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 12 }}>
          <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>⚠ State inconsistency:</span>
          {' '}<span style={{ color: 'var(--muted)' }}>These tickers appear in both a tier and the excluded list:</span>
          {' '}{inconsistent.map(t => (
            <span key={t} style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--yellow)', marginLeft: 6 }}>{t}</span>
          ))}
          <span style={{ color: 'var(--muted)', marginLeft: 8 }}>— click Restore to remove from excluded, or × to remove from the tier.</span>
        </div>
      )}

      {/* Tier sections */}
      {TIERS.map(tier => {
        const raw: any[] = universe?.[tier.key] ?? [];
        const tickers = parseTickers(raw);
        return (
          <div key={tier.key} style={{
            border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
          }}>
            {/* Tier header */}
            <div style={{
              padding: '10px 16px', background: 'var(--surface2)',
              borderBottom: tickers.length > 0 ? '1px solid var(--border)' : undefined,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: tier.color }}>{tier.label}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>— {tier.desc}</span>
              <span style={{
                marginLeft: 'auto', fontSize: 11, fontFamily: 'monospace',
                padding: '1px 8px', borderRadius: 10,
                background: tier.bg, color: tier.color, border: `1px solid ${tier.border}`,
              }}>{tickers.length}</span>
            </div>

            {/* Tickers */}
            <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 52 }}>
              {tickers.length === 0
                ? <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>No tickers in this tier</span>
                : tickers.map(t => (
                  <div key={t} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: tier.bg, border: `1px solid ${tier.border}`,
                    borderRadius: 6, padding: '3px 6px 3px 10px',
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', color: excludedSet.has(t) ? 'var(--yellow)' : tier.color }}>{t}</span>
                    {excludedSet.has(t) && <span title="Also in excluded list" style={{ fontSize: 10, color: 'var(--yellow)', marginLeft: 2 }}>⚠</span>}
                    {/* Exclude button */}
                    <button
                      onClick={() => setExcludeTarget(t)}
                      disabled={acting !== null}
                      title="Exclude"
                      style={{
                        background: 'none', color: 'var(--muted)', padding: '0 2px', fontSize: 11,
                        lineHeight: 1, borderRadius: 3,
                      }}
                    >⊗</button>
                    {/* Remove button */}
                    <button
                      onClick={() => handleRemove(tier.key, t)}
                      disabled={acting !== null}
                      title="Remove from universe"
                      style={{
                        background: 'none', color: 'var(--muted)', padding: '0 2px', fontSize: 14,
                        lineHeight: 1, borderRadius: 3,
                      }}
                    >×</button>
                  </div>
                ))
              }
            </div>
          </div>
        );
      })}

      {/* Excluded section */}
      {(() => {
        const raw: any[] = universe?.excluded ?? [];
        const excluded = parseExcluded(raw);
        if (excluded.length === 0) return null;
        return (
          <div style={{ border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{
              padding: '10px 16px', background: 'rgba(239,68,68,0.05)',
              borderBottom: '1px solid rgba(239,68,68,0.2)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>⊗ Excluded</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>— Regulatory, suspended, or manual</span>
              <span style={{
                marginLeft: 'auto', fontSize: 11, fontFamily: 'monospace',
                padding: '1px 8px', borderRadius: 10,
                background: 'rgba(239,68,68,0.1)', color: 'var(--red)',
                border: '1px solid rgba(239,68,68,0.25)',
              }}>{excluded.length}</span>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {excluded.map(ex => (
                <div key={ex.ticker} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 6,
                  background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)',
                }}>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13, color: 'var(--red)', minWidth: 60 }}>
                    {ex.ticker}
                  </span>
                  {ex.reason && (
                    <span style={{
                      fontSize: 11, padding: '1px 7px', borderRadius: 4,
                      background: 'rgba(239,68,68,0.12)', color: 'var(--red)',
                      fontFamily: 'monospace',
                    }}>{ex.reason}</span>
                  )}
                  {ex.note && (
                    <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1, fontStyle: 'italic' }}>{ex.note}</span>
                  )}
                  <button
                    onClick={() => handleUnexclude(ex.ticker)}
                    disabled={acting === `unexcl-${ex.ticker}`}
                    style={{
                      marginLeft: 'auto', fontSize: 12, padding: '3px 12px', borderRadius: 5,
                      background: 'rgba(34,197,94,0.08)', color: 'var(--green)',
                      border: '1px solid rgba(34,197,94,0.3)', cursor: 'pointer',
                      opacity: acting === `unexcl-${ex.ticker}` ? 0.5 : 1,
                    }}
                  >
                    {acting === `unexcl-${ex.ticker}` ? '…' : 'Restore'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Exclude confirm panel */}
      {excludeTarget && (
        <div style={{
          padding: '14px 16px', borderRadius: 10,
          border: '1px solid rgba(239,68,68,0.4)',
          background: 'rgba(239,68,68,0.05)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            Exclude <span style={{ fontFamily: 'monospace', color: 'var(--red)' }}>{excludeTarget}</span>?
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <select
              value={excludeReason}
              onChange={e => setExcludeReason(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px' }}
            >
              <option value="manual">Manual</option>
              <option value="regulatory">Regulatory risk</option>
              <option value="thin_chain">Thin option chain</option>
              <option value="suspended">Suspended</option>
              <option value="ignore">Ignore (delisted/irrelevant)</option>
            </select>
            <input
              value={excludeNote}
              onChange={e => setExcludeNote(e.target.value)}
              placeholder="Note (optional)…"
              style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleExclude(excludeTarget)}
              disabled={acting !== null}
              style={{
                fontSize: 12, padding: '5px 16px', borderRadius: 5,
                background: 'var(--red)', color: '#fff', fontWeight: 600,
                opacity: acting !== null ? 0.5 : 1,
              }}
            >{acting !== null ? '…' : 'Confirm Exclude'}</button>
            <button
              onClick={() => { setExcludeTarget(null); setExcludeReason('manual'); setExcludeNote(''); }}
              style={{ fontSize: 12, padding: '5px 14px', borderRadius: 5, background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border2)' }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Add ticker */}
      <Card title="Add Ticker">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Ticker</label>
            <input
              placeholder="e.g. AAPL"
              value={newTicker}
              onChange={e => setNewTicker(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              style={{ width: 120, fontFamily: 'monospace', fontWeight: 600 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Tier</label>
            <select value={newTier} onChange={e => setNewTier(e.target.value as any)}>
              <option value="tier1">Tier 1 — High IV</option>
              <option value="tier2">Tier 2 — Moderate IV</option>
              <option value="macro">Macro / Index</option>
            </select>
          </div>
          <button
            onClick={handleAdd}
            disabled={!newTicker.trim() || acting !== null}
            style={{
              background: 'var(--accent)', color: '#fff', fontWeight: 600,
              opacity: !newTicker.trim() || acting !== null ? 0.5 : 1,
            }}
          >{acting?.startsWith('add') ? '…' : '+ Add to Universe'}</button>
        </div>
      </Card>
    </div>
  );
}
