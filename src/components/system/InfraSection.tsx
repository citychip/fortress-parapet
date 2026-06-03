import Card from '../Card';
import type { IbkrStatusData } from '../../lib/api';

interface Props {
  ibkr: IbkrStatusData | null;
  syncing: boolean;
  onSync: () => void;
}

export function InfraSection({ ibkr, syncing, onSync }: Props) {
  if (!ibkr) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>IBKR status unavailable.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="IBKR Status">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Active Backend',  value: ibkr.active_backend },
            { label: 'Account',         value: ibkr.web_api?.account },
            { label: 'Authenticated',   value: String(ibkr.web_api?.session_status?.authenticated) },
            { label: 'OPRA Subscribed', value: String(ibkr.web_api?.opra_subscribed) },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
              <span style={{ color: 'var(--muted)', minWidth: 140 }}>{r.label}</span>
              <span className="mono">{r.value ?? '—'}</span>
            </div>
          ))}
        </div>
        <button onClick={onSync} disabled={syncing} style={{
          background: 'var(--accent)', color: '#fff', padding: '6px 20px',
        }}>
          {syncing ? '…' : '↻ Trigger Sync'}
        </button>
      </Card>
    </div>
  );
}
