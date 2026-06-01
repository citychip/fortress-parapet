import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { getPendingOrders, approveOrder, declineOrder, fmt$ } from '../lib/api';

export default function OrdersPage() {
  const [orders, setOrders]     = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [acting, setActing]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await getPendingOrders();
      const all: any[] = data?.orders ?? data?.pending ?? (Array.isArray(data) ? data : []);
      // Only show truly pending orders
      setOrders(all.filter((o: any) => !o.status || o.status === 'pending'));
      setUpdatedAt(new Date().toISOString());
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string) => {
    setActing(id);
    try {
      await approveOrder(id);
      await load();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setActing(null);
    }
  };

  const handleDecline = async (id: string) => {
    if (!confirm('Decline this order?')) return;
    setActing(id);
    setError(null);
    try {
      await declineOrder(id);
      // Remove immediately from local state, then reload
      setOrders(prev => prev.filter(o => o.id !== id));
      await load();
    } catch (e: any) {
      setError(`Decline failed: ${e}`);
    } finally {
      setActing(null);
    }
  };

  return (
    <Layout
      title="Orders"
      onRefresh={load}
      loading={loading}
      lastUpdated={updatedAt}
      action={
        <span style={{
          fontSize: 12, padding: '4px 12px', borderRadius: 20,
          background: orders.length ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.1)',
          color: orders.length ? 'var(--yellow)' : 'var(--green)',
          fontWeight: 600,
        }}>
          {orders.length} pending
        </span>
      }
    >
      {loading && !orders.length && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={32} />
        </div>
      )}
      {error && <ErrorBanner msg={error} onRetry={load} />}

      {!loading && orders.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '80px 0',
          color: 'var(--muted)', fontSize: 14,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          No pending orders
        </div>
      )}

      {orders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map((order: any) => (
            <OrderCard
              key={order.id}
              order={order}
              onApprove={() => handleApprove(order.id)}
              onDecline={() => handleDecline(order.id)}
              disabled={acting === order.id}
              acting={acting === order.id}
            />
          ))}
        </div>
      )}
    </Layout>
  );
}

function OrderCard({
  order, onApprove, onDecline, disabled, acting,
}: {
  order: any;
  onApprove: () => void;
  onDecline: () => void;
  disabled: boolean;
  acting: boolean;
}) {
  const legs: any[] = order.legs ?? [];

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--surface2)',
      }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{order.ticker ?? '—'}</span>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 4,
          background: 'rgba(99,102,241,0.15)',
          color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase',
        }}>{order.strategy ?? order.order_type ?? 'ORDER'}</span>
        <span style={{ flex: 1 }} />
        {order.limit_price != null && (
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Limit: <span className="mono" style={{ color: 'var(--text)' }}>{fmt$(order.limit_price, 2)}</span>
          </span>
        )}
        {order.quantity != null && (
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Qty: <span className="mono" style={{ color: 'var(--text)' }}>{order.quantity}</span>
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {order.created_at ? new Date(order.created_at).toLocaleString() : ''}
        </span>
      </div>

      {/* Legs */}
      {legs.length > 0 && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <table style={{ width: 'auto' }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 0 }}>Action</th>
                <th>Type</th>
                <th>Strike</th>
                <th>Expiry</th>
                <th>Ratio</th>
              </tr>
            </thead>
            <tbody>
              {legs.map((leg: any, i: number) => (
                <tr key={i}>
                  <td style={{
                    paddingLeft: 0,
                    color: leg.action === 'BUY' ? 'var(--green)' : 'var(--red)',
                    fontWeight: 600, fontSize: 13,
                  }}>{leg.action}</td>
                  <td className="mono">{leg.right ? `${leg.right}` : leg.sec_type ?? '—'}</td>
                  <td className="mono">{leg.strike ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{leg.expiry ?? '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{leg.ratio ?? 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      {order.notes && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>{order.notes}</p>
        </div>
      )}

      {/* Max loss */}
      {order.max_loss != null && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Max loss: <span className="mono text-red">{fmt$(order.max_loss, 0)}</span>
          </span>
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onDecline} disabled={disabled} style={{
          background: 'rgba(239,68,68,0.1)',
          color: 'var(--red)',
          border: '1px solid rgba(239,68,68,0.3)',
        }}>
          {acting ? '…' : 'Decline'}
        </button>
        <button onClick={onApprove} disabled={disabled} style={{
          background: 'var(--accent)',
          color: '#fff',
          fontWeight: 600,
          padding: '6px 24px',
        }}>
          {acting ? '…' : '✓ Approve'}
        </button>
      </div>
    </div>
  );
}
