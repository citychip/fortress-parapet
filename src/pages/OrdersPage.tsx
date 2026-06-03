import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { TabBar } from '../components/Tabs';
import { AlertsSection } from '../components/system/AlertsSection';
import {
  getPendingOrders, approveOrder, declineOrder,
  getJournal, addJournalEntry,
  getAlerts, addAlert, deleteAlert,
  fmt$,
  type OrderData, type AlertData,
} from '../lib/api';

export default function OrdersPage() {
  const [tab, setTab] = useState('pending');

  // ── Pending orders (15s poll) ──────────────────────────────────────────────
  const [orders,    setOrders]    = useState<OrderData[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [acting,    setActing]    = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // ── Journal (lazy) ─────────────────────────────────────────────────────────
  const [journal,       setJournal]       = useState<any[]>([]);
  const [journalLoaded, setJournalLoaded] = useState(false);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalNote,   setJournalNote]   = useState('');
  const [journalSaving, setJournalSaving] = useState(false);

  // ── Alerts (lazy) ──────────────────────────────────────────────────────────
  const [alerts,       setAlerts]       = useState<AlertData[]>([]);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [newAlert, setNewAlert] = useState({ ticker: '', condition: '', threshold: '' });

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadOrders = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const data = await getPendingOrders();
      const all: OrderData[] = data?.orders ?? data?.pending ?? [];
      setOrders(all.filter(o => !o.status || o.status === 'pending'));
      setUpdatedAt(new Date().toISOString());
    } catch (e: any) {
      setError(String(e));
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  const loadJournal = useCallback(async () => {
    setJournalLoading(true);
    try {
      const j = await getJournal();
      setJournal(j?.entries ?? j?.journal ?? []);
      setJournalLoaded(true);
    } catch (e: any) { setError(String(e)); }
    finally { setJournalLoading(false); }
  }, []);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const data = await getAlerts();
      setAlerts(data?.alerts ?? []);
      setAlertsLoaded(true);
    } catch (e: any) { setError(String(e)); }
    finally { setAlertsLoading(false); }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // 15s poll for pending orders only
  useEffect(() => {
    const id = setInterval(() => loadOrders(true), 15_000);
    return () => clearInterval(id);
  }, [loadOrders]);

  // Lazy-load journal/alerts on first tab activation
  useEffect(() => {
    if (tab === 'journal' && !journalLoaded && !journalLoading) loadJournal();
    if (tab === 'alerts'  && !alertsLoaded  && !alertsLoading)  loadAlerts();
  }, [tab, journalLoaded, journalLoading, alertsLoaded, alertsLoading, loadJournal, loadAlerts]);

  // ── Pending order actions ──────────────────────────────────────────────────

  const handleApprove = async (id: string) => {
    setActing(id);
    try { await approveOrder(id); await loadOrders(); }
    catch (e: any) { setError(String(e)); }
    finally { setActing(null); }
  };

  const handleDecline = async (id: string) => {
    if (!confirm('Decline this order?')) return;
    setActing(id); setError(null);
    try { await declineOrder(id); setOrders(prev => prev.filter(o => o.id !== id)); await loadOrders(); }
    catch (e: any) { setError(`Decline failed: ${e}`); }
    finally { setActing(null); }
  };

  // ── Journal actions ────────────────────────────────────────────────────────

  const saveJournal = async () => {
    if (!journalNote.trim()) return;
    setJournalSaving(true);
    try {
      await addJournalEntry({ note: journalNote, timestamp: new Date().toISOString() });
      setJournalNote('');
      await loadJournal();
    } finally { setJournalSaving(false); }
  };

  // ── Alert actions ──────────────────────────────────────────────────────────

  const handleAddAlert = async () => {
    if (!newAlert.ticker) return;
    try {
      await addAlert(newAlert);
      setNewAlert({ ticker: '', condition: '', threshold: '' });
      await loadAlerts();
    } catch (e: any) { setError(String(e)); }
  };

  const handleDeleteAlert = async (id: string) => {
    try { await deleteAlert(id); await loadAlerts(); }
    catch (e: any) { setError(String(e)); }
  };

  const handleRefresh = useCallback(() => {
    if (tab === 'pending') loadOrders();
    else if (tab === 'journal') loadJournal();
    else if (tab === 'alerts')  loadAlerts();
  }, [tab, loadOrders, loadJournal, loadAlerts]);

  const TABS = [
    { key: 'pending', label: 'Pending' },
    { key: 'journal', label: 'Journal' },
    { key: 'alerts',  label: 'Alerts' },
  ];

  return (
    <Layout
      title="Orders"
      onRefresh={handleRefresh}
      loading={loading}
      lastUpdated={updatedAt}
      action={tab === 'pending' ? (
        <span style={{
          fontSize: 12, padding: '4px 12px', borderRadius: 20,
          background: orders.length ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.1)',
          color: orders.length ? 'var(--yellow)' : 'var(--green)',
          fontWeight: 600,
        }}>
          {orders.length} pending
        </span>
      ) : undefined}
    >
      {error && <ErrorBanner msg={error} onRetry={handleRefresh} />}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* ── PENDING ─────────────────────────────────────────────────────────── */}
      {tab === 'pending' && (
        <>
          {loading && !orders.length && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <Spinner size={32} />
            </div>
          )}
          {!loading && orders.length === 0 && (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)', fontSize: 14 }}>
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
        </>
      )}

      {/* ── JOURNAL ─────────────────────────────────────────────────────────── */}
      {tab === 'journal' && (
        <>
          {journalLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={32} /></div>}
          {journalLoaded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card title="Add Entry">
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    value={journalNote}
                    onChange={e => setJournalNote(e.target.value)}
                    placeholder="Trade note, observation, decision rationale..."
                    style={{ flex: 1 }}
                    onKeyDown={e => e.key === 'Enter' && saveJournal()}
                  />
                  <button onClick={saveJournal} disabled={journalSaving || !journalNote.trim()}
                    style={{ background: 'var(--accent)', color: '#fff' }}>
                    {journalSaving ? '…' : 'Save'}
                  </button>
                </div>
              </Card>
              <Card title="Entries">
                {journal.length === 0
                  ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No journal entries.</p>
                  : journal.slice().reverse().map((e: any, i: number) => (
                    <div key={i} style={{
                      padding: '10px 0', borderBottom: '1px solid var(--border)',
                      display: 'flex', gap: 12,
                    }}>
                      <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0, marginTop: 2 }}>
                        {e.timestamp ? new Date(e.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {(e.ticker || e.action) && (
                          <div style={{ fontSize: 12 }}>
                            {e.ticker && <span style={{ fontWeight: 600, marginRight: 8 }}>{e.ticker}</span>}
                            {e.action && <span style={{ color: 'var(--accent)', marginRight: 8 }}>{e.action}</span>}
                            {e.strategy && <span style={{ color: 'var(--muted)' }}>{e.strategy}</span>}
                          </div>
                        )}
                        <span style={{ fontSize: 13 }}>
                          {e.description ?? e.notes ?? e.note ?? e.text ?? e.content ?? JSON.stringify(e)}
                        </span>
                        {e.realized_pnl != null && (
                          <span style={{ fontSize: 12, color: e.realized_pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            P&L: {e.realized_pnl >= 0 ? '+' : ''}{e.realized_pnl}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                }
              </Card>
            </div>
          )}
        </>
      )}

      {/* ── ALERTS ──────────────────────────────────────────────────────────── */}
      {tab === 'alerts' && (
        <>
          {alertsLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={32} /></div>}
          {alertsLoaded && (
            <AlertsSection
              alerts={alerts}
              newAlert={newAlert}
              onNewAlertChange={setNewAlert}
              onAdd={handleAddAlert}
              onDelete={handleDeleteAlert}
            />
          )}
        </>
      )}

    </Layout>
  );
}

// ── Order card ────────────────────────────────────────────────────────────────

function OrderCard({ order, onApprove, onDecline, disabled, acting }: {
  order: any; onApprove: () => void; onDecline: () => void;
  disabled: boolean; acting: boolean;
}) {
  const legs: any[] = order.legs ?? [];
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface2)',
      }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{order.ticker ?? '—'}</span>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 4,
          background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase',
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
            <thead><tr>
              <th style={{ paddingLeft: 0 }}>Action</th>
              <th>Type</th><th>Strike</th><th>Expiry</th><th>Ratio</th>
            </tr></thead>
            <tbody>
              {legs.map((leg: any, i: number) => (
                <tr key={i}>
                  <td style={{ paddingLeft: 0, color: leg.action === 'BUY' ? 'var(--green)' : 'var(--red)', fontWeight: 600, fontSize: 13 }}>{leg.action}</td>
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

      {order.notes && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>{order.notes}</p>
        </div>
      )}

      {order.max_loss != null && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Max loss: <span className="mono text-red">{fmt$(order.max_loss, 0)}</span>
          </span>
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onDecline} disabled={disabled} style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)' }}>
          {acting ? '…' : 'Decline'}
        </button>
        <button onClick={onApprove} disabled={disabled} style={{ background: 'var(--accent)', color: '#fff', fontWeight: 600, padding: '6px 24px' }}>
          {acting ? '…' : '✓ Approve'}
        </button>
      </div>
    </div>
  );
}
