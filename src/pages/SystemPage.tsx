import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { TabBar } from '../components/Tabs';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { StrategyTab } from '../components/system/StrategyTab';
import { InfraSection } from '../components/system/InfraSection';
import { ConnectionsSection } from '../components/system/ConnectionsSection';
import { ScriptsSection } from '../components/system/ScriptsSection';
import {
  getSettings, updateSettings,
  listScripts, runScript, getIbkrStatus, triggerIbkrSync,
  getJournal, addJournalEntry,
  getAlerts, addAlert, deleteAlert,
  fmtDateTime,
  type IbkrStatusData, type AlertData,
} from '../lib/api';
import { AlertsSection } from '../components/system/AlertsSection';

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
  const [scripts, setScripts]   = useState<any[]>([]);
  const [ibkr, setIbkr]         = useState<IbkrStatusData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [running, setRunning]   = useState<string | null>(null);
  const [scriptOutput, setScriptOutput] = useState<Record<string, { ok: boolean; output: string }>>({});
  const [syncing, setSyncing]   = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, sc, i] = await Promise.allSettled([
        getSettings(), listScripts(), getIbkrStatus(),
      ]);
      if (s.status === 'fulfilled')  setSettings(s.value?.config ?? s.value);
      if (sc.status === 'fulfilled') setScripts(sc.value?.scripts ?? []);
      if (i.status === 'fulfilled')  setIbkr(i.value);
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
      // Backend returns {stdout, stderr, exit_code, duration_seconds}
      const ok = (result?.exit_code ?? 0) === 0 && result?.ok !== false;
      const stdout = result?.stdout ?? result?.output ?? result?.message ?? 'Script completed.';
      const stderr = result?.stderr ?? '';
      const duration = result?.duration_seconds;
      const header = duration != null ? `[${duration.toFixed(1)}s]  exit ${result?.exit_code ?? 0}` : '';
      const parts = [header, stdout, stderr ? `--- stderr ---\n${stderr}` : ''].filter(Boolean);
      setScriptOutput(prev => ({ ...prev, [key]: { ok, output: parts.join('\n').trim() } }));
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

  const [settingsSubTab, setSettingsSubTab] = useState<'connections' | 'config'>('connections');

  // Alerts tab state
  const [alerts, setAlerts]       = useState<AlertData[]>([]);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [newAlert, setNewAlert]   = useState({ ticker: '', condition: '', threshold: '' });

  const loadAlerts = useCallback(async () => {
    try {
      const d = await getAlerts();
      setAlerts(d?.alerts ?? []);
      setAlertsLoaded(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (tab === 'alerts' && !alertsLoaded) loadAlerts();
  }, [tab, alertsLoaded, loadAlerts]);

  const handleAddAlert = async () => {
    if (!newAlert.ticker) return;
    try {
      await addAlert({ ticker: newAlert.ticker, condition: newAlert.condition, threshold: newAlert.threshold });
      setNewAlert({ ticker: '', condition: '', threshold: '' });
      await loadAlerts();
    } catch (e: any) { setError(String(e)); }
  };

  const handleDeleteAlert = async (id: string) => {
    try { await deleteAlert(id); await loadAlerts(); }
    catch (e: any) { setError(String(e)); }
  };

  const TABS = [
    { key: 'strategy', label: 'Strategy' },
    { key: 'settings', label: 'Settings' },
    { key: 'scripts',  label: 'Scripts'  },
    { key: 'alerts',   label: 'Alerts'   },
    { key: 'journal',  label: 'Journal'  },
  ];

  // Tab keyboard shortcuts: 1-5
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT','SELECT','TEXTAREA'].includes(target.tagName)) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= TABS.length) setTab(TABS[n - 1].key);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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

      {tab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Sub-tab bar */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4 }}>
            {(['connections', 'config'] as const).map(st => (
              <button key={st} onClick={() => setSettingsSubTab(st)} style={{
                flex: 1, padding: '6px 0', borderRadius: 5, fontSize: 13, fontWeight: settingsSubTab === st ? 600 : 400,
                background: settingsSubTab === st ? 'var(--surface2)' : 'none',
                color: settingsSubTab === st ? 'var(--text)' : 'var(--muted)',
                border: settingsSubTab === st ? '1px solid var(--border2)' : '1px solid transparent',
              }}>{st === 'connections' ? 'Connections' : 'Config'}</button>
            ))}
          </div>

          {/* Connections sub-tab — IBKR gateway + ping tests */}
          {settingsSubTab === 'connections' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <InfraSection ibkr={ibkr} syncing={syncing} onSync={handleSync} />
              <ConnectionsSection />
            </div>
          )}

          {/* Config sub-tab — editable settings */}
          {settingsSubTab === 'config' && settings && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {Object.entries(settings)
                .filter(([section]) => !CLAUDE_ONLY_SECTIONS.has(section) && section !== 'technical')
                .map(([section, values]: any) => {
                  const meta = SECTION_META[section];
                  return (
                    <div key={section} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {meta?.icon && <span style={{ fontSize: 15 }}>{meta.icon}</span>}
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{meta?.title ?? section.toUpperCase()}</span>
                        </div>
                        {meta?.description && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{meta.description}</p>}
                      </div>
                      <div style={{ padding: '16px' }}>
                        <EditableSection section={section} values={values} onSaved={load} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {tab === 'scripts' && (
        <ScriptsSection
          scripts={scripts}
          running={running}
          outputs={scriptOutput}
          onRun={handleRunScript}
        />
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

      {tab === 'journal' && <JournalTab />}
    </Layout>
  );
}

// ── JournalTab ────────────────────────────────────────────────────────────────

function JournalTab() {
  const [entries, setEntries]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [draft, setDraft]       = useState('');
  const [posting, setPosting]   = useState(false);
  const [postErr, setPostErr]   = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await getJournal();
      const raw = d?.entries ?? d?.journal ?? (Array.isArray(d) ? d : []);
      setEntries([...raw].reverse());
    } catch (e: any) {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handlePost = async () => {
    const text = draft.trim();
    if (!text) return;
    setPosting(true); setPostErr(null);
    try {
      await addJournalEntry({ note: text, entry: text });
      setDraft('');
      await load();
    } catch (e: any) {
      setPostErr(String(e));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      {/* New entry */}
      <Card title="New Entry">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost(); }}
            placeholder="Trade note, observation, or decision log… (⌘↵ to post)"
            rows={4}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 13, padding: '10px 12px', boxSizing: 'border-box' }}
          />
          {postErr && <div style={{ color: 'var(--red)', fontSize: 12 }}>{postErr}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handlePost}
              disabled={posting || !draft.trim()}
              style={{
                background: draft.trim() ? 'var(--accent)' : 'var(--surface2)',
                color: draft.trim() ? '#fff' : 'var(--muted)',
                border: 'none',
                padding: '7px 20px', fontWeight: 600, fontSize: 13,
                cursor: draft.trim() ? 'pointer' : 'default',
              }}
            >
              {posting ? 'Posting…' : 'Post Entry'}
            </button>
          </div>
        </div>
      </Card>

      {/* Entry list */}
      <Card title={`Journal${entries.length ? ` — ${entries.length} entries` : ''}`} action={
        <button onClick={load} style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--muted)', fontSize: 11, padding: '3px 10px' }}>
          ↻ Refresh
        </button>
      }>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner size={24} /></div>
        ) : entries.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>No entries yet. Add your first trade note above.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {entries.map((e: any, i: number) => {
              const ts = e.timestamp ?? e.created_at ?? e.date ?? null;
              const rawText = e.note ?? e.entry ?? e.text ?? e.content ?? JSON.stringify(e);

              // Try to detect a serialized trade record stored as a JSON string
              let tradeRecord: any = null;
              if (typeof rawText === 'string' && rawText.trimStart().startsWith('{')) {
                try {
                  const parsed = JSON.parse(rawText);
                  if (parsed?.ticker || parsed?.action || parsed?.description) tradeRecord = parsed;
                } catch {}
              }

              const actionColor = (a: string) => {
                if (!a) return 'var(--muted)';
                if (a === 'OPEN') return 'var(--green)';
                if (a === 'CLOSE' || a === 'SELL') return 'var(--red)';
                if (a === 'ROLL') return 'var(--yellow)';
                return 'var(--accent)';
              };

              return (
                <div key={i} style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: i === 0 ? 'var(--surface2)' : 'var(--surface)',
                  border: `1px solid ${tradeRecord ? 'var(--border2)' : 'var(--border)'}`,
                }}>
                  {ts && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontFamily: 'monospace' }}>
                      {fmtDateTime(ts)}
                    </div>
                  )}
                  {tradeRecord ? (
                    /* Structured trade record display */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        {tradeRecord.action && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                            color: actionColor(tradeRecord.action),
                            background: `${actionColor(tradeRecord.action)}1a`,
                            fontFamily: 'monospace',
                          }}>{tradeRecord.action}</span>
                        )}
                        {tradeRecord.ticker && (
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{tradeRecord.ticker}</span>
                        )}
                        {tradeRecord.strategy && (
                          <span style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'monospace' }}>{tradeRecord.strategy}</span>
                        )}
                        {tradeRecord.description && tradeRecord.description !== `${tradeRecord.action} ${tradeRecord.ticker}` && (
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{tradeRecord.description}</span>
                        )}
                      </div>
                      {(tradeRecord.realized_pnl != null || tradeRecord.debit_credit != null) && (
                        <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                          {tradeRecord.realized_pnl != null && (
                            <span style={{ color: tradeRecord.realized_pnl >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'monospace', fontWeight: 600 }}>
                              P&L {tradeRecord.realized_pnl >= 0 ? '+' : ''}{tradeRecord.realized_pnl.toFixed(2)}
                            </span>
                          )}
                          {tradeRecord.debit_credit != null && (
                            <span style={{ color: 'var(--muted)', fontFamily: 'monospace' }}>
                              {tradeRecord.debit_credit >= 0 ? '+' : ''}{tradeRecord.debit_credit.toFixed(2)} credit
                            </span>
                          )}
                        </div>
                      )}
                      {tradeRecord.notes && (
                        <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.5, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                          {tradeRecord.notes}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{rawText}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
