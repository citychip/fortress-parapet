import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { TabBar } from '../components/Tabs';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import {
  getSettings, updateSettings, getAlerts, addAlert, deleteAlert,
  listScripts, runScript, getIbkrStatus, triggerIbkrSync,
  getUniverse, addTicker, excludeTicker,
} from '../lib/api';

// Fields that should be masked in display
const SENSITIVE_KEYS = new Set(['token','key','secret','password','auth_token','api_key','quantdata_auth_token','quantdata_api_key']);
// Strategy section is Claude-only
const CLAUDE_ONLY_SECTIONS = new Set(['strategy']);

function isSensitive(k: string) {
  return SENSITIVE_KEYS.has(k) || k.toLowerCase().includes('token') || k.toLowerCase().includes('secret');
}

function formatValue(v: any): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function EditableSection({ section, values, onSaved }: { section: string; values: any; onSaved: () => void }) {
  const [draft, setDraft]     = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, formatValue(v)]))
  );
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const dirty = Object.entries(draft).some(([k, v]) => v !== formatValue(values[k]));

  const handleSave = async () => {
    setSaving(true); setErr(null);
    try {
      // coerce types back
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(draft)) {
        const orig = values[k];
        if (typeof orig === 'boolean') payload[k] = v === 'true';
        else if (typeof orig === 'number') payload[k] = Number(v);
        else if (Array.isArray(orig)) payload[k] = v.split(',').map(s => s.trim()).filter(Boolean);
        else payload[k] = v === '' ? null : v;
      }
      await updateSettings(section, payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (e: any) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 16 }}>
        {Object.entries(draft).map(([k, v]) => {
          const orig = values[k];
          const sensitive = isSensitive(k);
          const isRevealed = revealed.has(k);
          return (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {typeof orig === 'boolean' ? (
                  <select value={v} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} style={{ flex: 1 }}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={sensitive && !isRevealed ? 'password' : 'text'}
                    value={v}
                    onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}
                    style={{ flex: 1, fontSize: 12 }}
                  />
                )}
                {sensitive && (
                  <button onClick={() => setRevealed(r => { const n = new Set(r); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--muted)', padding: '4px 8px', fontSize: 11 }}>
                    {isRevealed ? 'hide' : 'show'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={handleSave} disabled={saving || !dirty} style={{
          background: dirty ? 'var(--accent)' : 'var(--surface2)',
          color: dirty ? '#fff' : 'var(--muted)',
          border: dirty ? 'none' : '1px solid var(--border2)',
          padding: '6px 20px', fontWeight: 600,
        }}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
        </button>
        {dirty && (
          <button onClick={() => setDraft(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, formatValue(v)])))}
            style={{ background: 'none', color: 'var(--muted)', border: '1px solid var(--border2)', padding: '6px 14px' }}>
            Reset
          </button>
        )}
        {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>Changes saved</span>}
      </div>
    </div>
  );
}

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
          {Object.entries(settings).map(([section, values]: any) => {
            const claudeOnly = CLAUDE_ONLY_SECTIONS.has(section);
            return (
              <Card
                key={section}
                title={section.toUpperCase()}
                action={claudeOnly
                  ? <span style={{ fontSize: 11, color: 'var(--accent)', padding: '2px 8px', background: 'rgba(99,102,241,0.1)', borderRadius: 4 }}>Edit via Claude</span>
                  : undefined
                }
              >
                {claudeOnly ? (
                  <div>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
                      Strategy thresholds have portfolio-wide implications. Ask Claude to change them — e.g. "set ivr_min_entry to 15" or "update delta roll threshold to 0.40".
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                      {Object.entries(values).map(([k, v]: any) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                          <span style={{ color: 'var(--muted)' }}>{k}</span>
                          <span className="mono" style={{ color: 'var(--text)', textAlign: 'right' }}>
                            {Array.isArray(v) ? v.join(', ') : v == null ? '—' : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EditableSection section={section} values={values} onSaved={load} />
                )}
              </Card>
            );
          })}
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
                  // Handle both string[] and object[] (extract ticker field)
                  const raw: any[] = universe?.tickers ?? universe?.tier1 ?? universe?.universe ?? [];
                  const tickers: string[] = raw.map((t: any) => typeof t === 'string' ? t : (t?.ticker ?? t?.symbol ?? String(t)));
                  const rawExcl: any[] = universe?.excluded ?? [];
                  const excluded: string[] = rawExcl.map((t: any) => typeof t === 'string' ? t : (t?.ticker ?? t?.symbol ?? String(t)));
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
