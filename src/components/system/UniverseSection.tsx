import Card from '../Card';

interface Props {
  universe: any;
  newTicker: string;
  onNewTickerChange: (v: string) => void;
  onAdd: () => void;
  onExclude: (ticker: string) => void;
}

export function UniverseSection({ universe, newTicker, onNewTickerChange, onAdd, onExclude }: Props) {
  const raw: any[]      = universe?.tickers ?? universe?.tier1 ?? universe?.universe ?? [];
  const tickers: string[] = raw.map((t: any) => typeof t === 'string' ? t : (t?.ticker ?? t?.symbol ?? String(t)));
  const rawExcl: any[]    = universe?.excluded ?? [];
  const excluded: string[] = rawExcl.map((t: any) => typeof t === 'string' ? t : (t?.ticker ?? t?.symbol ?? String(t)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="Add Ticker">
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            placeholder="Ticker (e.g. AAPL)"
            value={newTicker}
            onChange={e => onNewTickerChange(e.target.value.toUpperCase())}
            style={{ width: 140 }}
            onKeyDown={e => e.key === 'Enter' && onAdd()}
          />
          <button onClick={onAdd} disabled={!newTicker.trim()} style={{
            background: 'var(--accent)', color: '#fff',
          }}>Add to Universe</button>
        </div>
      </Card>

      <Card title="Universe">
        {!universe
          ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No universe data.</p>
          : (
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {tickers.map((t, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '4px 10px',
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{t}</span>
                    <button
                      onClick={() => onExclude(t)}
                      style={{ background: 'none', color: 'var(--muted)', padding: '0 2px', fontSize: 14 }}
                      title="Exclude"
                    >×</button>
                  </div>
                ))}
              </div>
              {excluded.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Excluded</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {excluded.map((t, i) => (
                      <span key={i} style={{
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: 6, padding: '4px 10px', fontSize: 13, color: 'var(--muted)',
                        textDecoration: 'line-through',
                      }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        }
      </Card>
    </div>
  );
}
