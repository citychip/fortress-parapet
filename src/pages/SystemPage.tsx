import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { TabBar } from '../components/Tabs';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { StrategyTab } from '../components/system/StrategyTab';
import { AlertsSection } from '../components/system/AlertsSection';
import { InfraSection } from '../components/system/InfraSection';
import { UniverseSection } from '../components/system/UniverseSection';
import {
  getSettings, updateSettings, getAlerts, addAlert, deleteAlert,
  listScripts, runScript, getIbkrStatus, triggerIbkrSync,
  getUniverse,
  type AlertData, type IbkrStatusData,
} from '../lib/api';

// ── Shared helpers ────────────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set(['token','key','secret','password','auth_token','api_key','quantdata_auth_token','quantdata_api_key']);
const CLAUDE_ONLY_SECTIONS = new Set(['strategy']);

// Section descriptions shown in Settings tab
const SECTION_META: Record<string, { title: string; description: string; icon: string }> = {
  trader_profile: { title: 'Trader Profile', description: 'Persona, active strategies, risk tolerance, and primary objective.', icon: '👤' },
  security:       { title: 'Security & API', description: 'API token, QuantData credentials, and authentication keys. Fields are masked — click show to reveal.', icon: '🔐' },
  alerts:         { title: 'Alert Thresholds', description: 'Delta, DTE, and pacing thresholds that drive automated alerts and stop-loss signals.', icon: '🔔' },
  ibkr:           { title: 'IBKR Settings', description: 'Interactive Brokers connection settings. Auth mode is toggled via Infrastructure tab.', icon: '🏦' },
  system:         { title: 'System', description: 'Data refresh intervals, staleness thresholds, and operational parameters.', icon: '⚙' },
};

function isSensitive(k: string) {
  return SENSITIVE_KEYS.has(k) || k.toLowerCase().includes('token') || k.toLowerCase().includes('secret');
}

function formatValue(v: any): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

// ── EditableSection ───────────────────────────────────────────────────────────

function EditableSection({ section, values, onSaved }: { section: string; values: any; onSaved: () => void }) {
  const [draft, setDraft]   = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, formatValue(v)]))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const dirty = Object.entries(draft).some(([k, v]) => v !== formatValue(values[k]));

  const handleSave = async () => {
    setSaving(true); setErr(null);
    try {
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
                  <button
                    onClick={() => setRevealed(r => { const n = new Set(r); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--muted)', padding: '4px 8px', fontSize: 11 }}
                  >
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
          <button
            onClick={() => setDraft(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, formatValue(v)])))}
            style={{ background: 'none', color: 'var(--muted)', border: '1px solid var(--border2)', padding: '6px 14px' }}
          >
            Reset
          </button>
        )}
        {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>Changes saved</span>}
      </div>
    </div>
  );
}

// ── SystemPage ────────────────────────────────────────────────────────────────

export default function SystemPage() {
  const [tab, setTab]           = useState('settings');
  const [settings, setSettings] = useState<any>(null);
  const [alerts, setAlerts]     = useState<AlertData[]>([]);
  const [scripts, setScripts]   = useState<any[]>([]);
  const [ibkr, setIbkr]         = useState<IbkrStatusData | null>(null);
  const [universe, setUniverse] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [running, setRunning]     = useState<string | null>(null);
  const [scriptOutput, setScriptOutput] = useState<Record<string, { ok: boolean; output: string }>>({});
  const [syncing, setSyncing]     = useState(false);
  const [newAlert, setNewAlert]   = useState({ ticker: '', condition: '', threshold: '' });
  const [updatedAt, setUpdatedAt]   = useState<string | null>(null);

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
    try {
      const result = await runScript(key);
      const output = result?.output ?? result?.message ?? result?.result ?? 'Script completed.';
      const ok = result?.ok !== false;
      setScriptOutput(prev => ({ ...prev, [key]: { ok, output: String(output).slice(0, 800) } }));
    }
    catch (e: any) {
      setScriptOutput(prev => ({ ...prev, [key]: { ok: false, output: String(e) } }));
    }
    finally { setRunning(null); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try { await triggerIbkrSync(); }
    catch (e: any) { setError(String(e)); }
    finally { setSyncing(false); }
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
    { key: 'strategy', label: 'Strategy' },
    { key: 'settings', label: 'Settings' },
    { key: 'alerts',   label: 'Alerts' },
    { key: 'scripts',  label: 'Scripts' },
    { key: 'infra',    label: 'Infrastructure' },
    { key: 'universe', label: 'Universe' },
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

      {tab === 'strategy' && settings?.strategy && (
        <StrategyTab s={settings.strategy} trader={settings.trader_profile} />
      )}

      {tab === 'settings' && settings && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(settings)
            .filter(([section]) => !CLAUDE_ONLY_SECTIONS.has(section))
            .map(([section, values]: any) => {
              const meta = SECTION_META[section];
              return (
                <div key={section} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  {/* Section header */}
                  <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {meta?.icon && <span style={{ fontSize: 15 }}>{meta.icon}</span>}
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{meta?.title ?? section.toUpperCase()}</span>
                    </div>
                    {meta?.description && (
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{meta.description}</p>
                    )}
                  </div>
                  <div style={{ padding: '16px' }}>
                    <EditableSection section={section} values={values} onSaved={load} />
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {tab === 'alerts' && (
        <AlertsSection
          alerts={alerts}
          newAlert={newAlert}
          onNewAlertChange={setNewAlert}
          onAdd={handleAddAlert}
          onDelete={handleDeleteAlert}
        />
      )}

      {tab === 'scripts' && (
        <Card title="Automation Scripts">
          <table>
            <thead><tr>
              <th>Script</th><th>File</th><th>Last Run</th><th style={{ textAlign: 'right' }}>Action</th>
            </tr></thead>
            <tbody>
              {scripts.map((s: any, i: number) => {
                const out = scriptOutput[s.key];
                return (
                  <>
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
                          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 12, padding: '4px 12px' }}
                        >
                          {running === s.key ? '…' : '▶ Run'}
                        </button>
                      </td>
                    </tr>
                    {out && (
                      <tr key={`${i}-out`}>
                        <td colSpan={4} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                          <pre style={{
                            fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap',
                            color: out.ok ? 'var(--green)' : 'var(--red)',
                            background: out.ok ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
                            padding: '8px 10px', borderRadius: 5, margin: 0,
                            border: `1px solid ${out.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                          }}>
                            {out.output}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'infra' && (
        <InfraSection ibkr={ibkr} syncing={syncing} onSync={handleSync} />
      )}

      {tab === 'universe' && (
        <UniverseSection universe={universe} onRefresh={load} />
      )}
    </Layout>
  );
}
