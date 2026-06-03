import Card from '../Card';
import type { AlertData } from '../../lib/api';

interface Props {
  alerts: AlertData[];
  newAlert: { ticker: string; condition: string; threshold: string };
  onNewAlertChange: (a: { ticker: string; condition: string; threshold: string }) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}

export function AlertsSection({ alerts, newAlert, onNewAlertChange, onAdd, onDelete }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="Add Alert">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            placeholder="Ticker (e.g. NVDA)"
            value={newAlert.ticker}
            onChange={e => onNewAlertChange({ ...newAlert, ticker: e.target.value.toUpperCase() })}
            style={{ width: 120 }}
          />
          <input
            placeholder="Condition (e.g. delta > 0.4)"
            value={newAlert.condition}
            onChange={e => onNewAlertChange({ ...newAlert, condition: e.target.value })}
            style={{ flex: 1, minWidth: 200 }}
          />
          <input
            placeholder="Threshold"
            value={newAlert.threshold}
            onChange={e => onNewAlertChange({ ...newAlert, threshold: e.target.value })}
            style={{ width: 100 }}
          />
          <button onClick={onAdd} style={{ background: 'var(--accent)', color: '#fff' }}>
            Add
          </button>
        </div>
      </Card>

      <Card title={`Active Alerts (${alerts.length})`}>
        {alerts.length === 0
          ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No alerts configured.</p>
          : alerts.map((a, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontWeight: 600, minWidth: 60 }}>{a.ticker ?? '—'}</span>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>
                {a.condition ?? a.message ?? JSON.stringify(a)}
              </span>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                background: a.state === 'safe' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.15)',
                color: a.state === 'safe' ? 'var(--green)' : 'var(--yellow)',
                fontWeight: 600, textTransform: 'uppercase',
              }}>{a.state ?? '—'}</span>
              <button onClick={() => onDelete(a.id)} style={{
                background: 'none', color: 'var(--red)', fontSize: 16, padding: '2px 8px',
              }}>×</button>
            </div>
          ))
        }
      </Card>
    </div>
  );
}
