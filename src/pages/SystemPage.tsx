import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { TabBar } from '../components/Tabs';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import {
  getSettings, getAlerts, addAlert, deleteAlert,
  listScripts, runScript, getIbkrStatus, triggerIbkrSync,
  getUniverse, addTicker, excludeTicker,
} from '../lib/api';

export default function SystemPage() {
  const [tab, setTab]         = useState('settings');
  const [settings, setSettings] = useState<any>(null);
  const [alerts, setAlerts]   = useState<any[]>([]);
  const [scripts, setScripts] = useState<any[]>([]);
  const [ibkr, setIbkr]       = useState<any>(null);
  const [universe, setUniverse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newAlert, setNewAlert]   = useState({ ticker: '', condition: '', threshold: '' });
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, a, sc, i, u] = await Promise.allSettled([
        getSettings(), getAlerts(), listScripts(), getIbkrStatus(), getUniverse(),
      ]);
      if (s.status === 'fulfilled') setSettings(s.value?.config ?? s.value);
      if (a.status === 'fulfilled') setAlerts(a.value?.alerts ?? []);
      if (sc.status === 'fulfilled') setScripts(sc.value?.scripts ?? []);
      if (i.status === 'fulfilled') setIbkr(i.value);
      if (u.status === 'fulfilled') setUniverse(u.value);
      setUpdatedAt(new Date().toISOString());
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRunScript = async (key: string) => {
    setRunning(key);
    try { await runScript(key); }
    catch (e: any) { setError(String(e)); }
    finally { setRunning(null); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try { await triggerIbkrSync(); }
    catch (e: any) { setError(String(e)); }
    finally { setSyncing(false); }
  };

  const handleAddTicker = async () => {
    if (!newTicker.trim()) return;
    try { await addTicker(newTicker.trim().toUpperCase()); setNewTicker(''); await load(); }
    catch (e: any) { setError(String(e)); }
  };

  const handleExcludeTicker = async (t: string) => {
    try { await excludeTicker(t); await load(); }
    catch (e: any) { setError(String(e)); }
  };

  const handleDeleteAlert = async (id: string) => {
    try { await deleteAlert(id); await load(); }
    catch (e: any) { setError(String(e)); }
  };

  const handleAddAlert = async () => {
    if (!newAlert.ticker) return;
    try {
      await addAlert(newAlert);
      setNewAlert({ ticker: '', condition: '', threshold: '' });
      await load();
    } catch (e: any) { setError(String(e)); }
  };

  const TABS = [
    { key: 'settings',  label: 'Settings' },
    { key: 'alerts',    label: 'Alerts' },
    { key: 'scripts',   label: 'Scripts' },
    { key: 'infra',     label: 'Infrastructure' },
    { key: 'universe',  label: 'Universe' },
  ];

  return (
    <Layout title="System" onRefresh={load} loading={loading} lastUpdated={updatedAt}>
      {loading && !settings && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={32} />
        </div>
      )}
      {error && <ErrorBanner msg={error} onRetry={load} />}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* SETTINGS */}
      {tab === 'settings' && settings && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(settings).map(([section, values]: any) => (
            <Card key={section} title={section.toUpperCase()}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {Object.entries(values).map(([k, v]: any) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>{k}</span>
                    <span className="mono" style={{ color: 'var(--text)', textAlign: 'right', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {typeof v === 'boolean' ? (v ? 'true' : 'false') :
                       Array.isArray(v) ? v.join(', ') :
                       v == null ? '—' : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ALERTS */}
      {tab === 'alerts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Add Alert">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                placeholder="Ticker (e.g. NVDA)"
                value={newAlert.ticker}
                onChange={e => setNewAlert(a => ({ ...a, ticker: e.target.value.toUpperCase() }))}
                style={{ width: 120 }}
              />
              <input
                placeholder="Condition (e.g. delta > 0.4)"
                value={newAlert.condition}
                onChange={e => setNewAlert(a => ({ ...a, condition: e.target.value }))}
                style={{ flex: 1, minWidth: 200 }}
              />
              <input
                placeholder="Threshold"
                value={newAlert.threshold}
                onChange={e => setNewAlert(a => ({ ...a, threshold: e.target.value }))}
                style={{ width: 100 }}
              />
              <button onClick={handleAddAlert} style={{ background: 'var(--accent)', color: '#fff' }}>
                Add
              </button>
            </div>
          </Card>

          <Card title={`Active Alerts (${alerts.length})`}>
            {alerts.length === 0
              ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No alerts configured.</p>
              : alerts.map((a: any, i: number) => (
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
                  <button onClick={() => handleDeleteAlert(a.id)} style={{
                    background: 'none', color: 'var(--red)', fontSize: 16, padding: '2px 8px',
                  }}>×</button>
                </div>
              ))
            }
          </Card>
        </div>
      )}

      {/* SCRIPTS */}
      {tab === 'scripts' && (
        <Card title="Automation Scripts">
          <table>
            <thead><tr>
              <th>Script</th><th>File</th><th>Last Run</th><th style={{ textAlign: 'right' }}>Action</th>
            </tr></thead>
            <tbody>
              {scripts.map((s: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{s.key}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {s.inprocess ? <span style={{ color: 'var(--yellow)' }}>⚙ in-process</span> : s.filename}
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{s.last_run ? new Date(s.last_run).toLocaleString() : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      onClick={() => handleRunScript(s.key)}
                      disabled={running === s.key || s.inprocess}
                      style={{
                        background: 'var(--surface2)',
                        border: '1px solid var(--border2)',
                        color: 'var(--text)',
                        fontSize: 12, padding: '4px 12px',
                      }}
                    >
                      {running === s.key ? '…' : '▶ Run'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* INFRA */}
      {tab === 'infra' && ibkr && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="IBKR Status">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Active Backend', value: ibkr.active_backend },
                { label: 'Account', value: ibkr.web_api?.account },
                { label: 'Authenticated', value: String(ibkr.web_api?.session_status?.authenticated) },
                { label: 'OPRA Subscribed', value: String(ibkr.web_api?.opra_subscribed) },
                { label: 'Gateway URL', value: ibkr.web_api?.gateway_url },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)', minWidth: 140 }}>{r.label}</span>
                  <span className="mono">{r.value ?? '—'}</span>
                </div>
              ))}
            </div>
            <button onClick={handleSync} disabled={syncing} style={{
              background: 'var(--accent)', color: '#fff',
              padding: '6px 20px',
            }}>
              {syncing ? '…' : '↻ Trigger Sync'}
            </button>
          </Card>
        </div>
      )}

      {/* UNIVERSE */}
      {tab === 'universe' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Add Ticker">
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                placeholder="Ticker (e.g. AAPL)"
                value={newTicker}
                onChange={e => setNewTicker(e.target.value.toUpperCase())}
                style={{ width: 140 }}
                onKeyDown={e => e.key === 'Enter' && handleAddTicker()}
              />
              <button onClick={handleAddTicker} disabled={!newTicker.trim()} style={{
                background: 'var(--accent)', color: '#fff',
              }}>Add to Universe</button>
            </div>
          </Card>

          <Card title="Universe">
            {!universe
              ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No universe data.</p>
              : (() => {
                  const tickers: string[] = universe?.tickers ?? universe?.tier1 ?? universe?.universe ?? [];
                  const excluded: string[] = universe?.excluded ?? [];
                  return (
                    <div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                        {tickers.map((t: string, i: number) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'var(--surface2)', border: '1px solid var(--border)',
                            borderRadius: 6, padding: '4px 10px',
                          }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{t}</span>
                            <button
                              onClick={() => handleExcludeTicker(t)}
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
                            {excluded.map((t: string, i: number) => (
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
                  );
                })()
            }
          </Card>
        </div>
      )}
    </Layout>
  );
}
