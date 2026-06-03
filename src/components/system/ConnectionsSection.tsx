import { useState } from 'react';
import { getIbkrStatus, testQuantData, getApiHealth, triggerIbkrSync } from '../../lib/api';

// ── Shared UI ─────────────────────────────────────────────────────────────────

function StatusDot({ ok, pending }: { ok: boolean | null; pending: boolean }) {
  if (pending) return (
    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--yellow)', animation: 'pulse 1s infinite', flexShrink: 0 }} />
  );
  if (ok === null) return (
    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--muted)', flexShrink: 0 }} />
  );
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
      background: ok ? 'var(--green)' : 'var(--red)',
      boxShadow: ok ? '0 0 6px var(--green)' : '0 0 4px var(--red)',
    }} />
  );
}

function ResultGrid({ items }: { items: Array<{ label: string; value: string; color?: string; mono?: boolean }> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginTop: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{item.label}</div>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: item.color ?? 'var(--text)',
            fontFamily: item.mono ? 'monospace' : undefined,
          }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function RunButton({ label, pending, onClick }: { label: string; pending: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={pending} style={{
      fontSize: 12, padding: '5px 14px', borderRadius: 5,
      background: 'rgba(99,102,241,0.12)', color: 'var(--accent)',
      border: '1px solid rgba(99,102,241,0.3)',
      opacity: pending ? 0.6 : 1,
    }}>
      {pending ? '…' : `↗ ${label}`}
    </button>
  );
}

// ── IBKR Health Card ─────────────────────────────────────────────────────────

function IbkrCard() {
  const [pending, setPending] = useState(false);
  const [result, setResult]   = useState<any>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  const runTest = async () => {
    setPending(true); setResult(null);
    const t0 = Date.now();
    try {
      const data = await getIbkrStatus();
      setLatency(Date.now() - t0);
      setResult(data);
    } catch (e: any) {
      setLatency(Date.now() - t0);
      setResult({ error: String(e) });
    } finally { setPending(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try { await triggerIbkrSync(); } catch (_) {}
    finally { setSyncing(false); }
  };

  const wa = result?.web_api;
  const ok = wa?.session_status?.authenticated ?? null;

  return (
    <div style={{ border: `1px solid ${ok === true ? 'rgba(34,197,94,0.3)' : ok === false ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <StatusDot ok={ok} pending={pending} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>IBKR Web API</span>
        {latency != null && (
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)', background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>
            {latency}ms
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={handleSync} disabled={syncing} style={{
          fontSize: 11, padding: '4px 10px', borderRadius: 5, marginRight: 6,
          background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border2)',
        }}>{syncing ? '…' : '↻ Sync'}</button>
        <RunButton label="Run Test" pending={pending} onClick={runTest} />
      </div>

      {!result && !pending && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Click Run Test to check IBKR Web API connectivity.</p>
      )}

      {result && !result.error && (
        <ResultGrid items={[
          { label: 'Status',   value: ok ? 'AUTHENTICATED' : 'DISCONNECTED', color: ok ? 'var(--green)' : 'var(--red)' },
          { label: 'Backend',  value: result.active_backend ?? '—', color: 'var(--accent)', mono: true },
          { label: 'Account',  value: wa?.account ?? '—', mono: true },
          { label: 'OPRA',     value: wa?.opra_subscribed === true ? '✓ Subscribed' : wa?.opra_subscribed === false ? '✗ No' : '—', color: wa?.opra_subscribed ? 'var(--green)' : 'var(--muted)' },
        ]} />
      )}

      {result?.error && (
        <div style={{ marginTop: 10, fontSize: 12, fontFamily: 'monospace', color: 'var(--red)', background: 'rgba(239,68,68,0.07)', padding: '8px 10px', borderRadius: 5 }}>
          {result.error}
        </div>
      )}

      {result && !ok && !result.error && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', padding: '8px 12px', borderRadius: 6 }}>
          <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>Not authenticated.</span>{' '}
          Open <a href="https://localhost:5000" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>localhost:5000</a> and log in, then Sync.
        </div>
      )}
    </div>
  );
}

// ── QuantData Card ───────────────────────────────────────────────────────────

function QuantDataCard() {
  const [pending, setPending] = useState(false);
  const [result, setResult]   = useState<{ ok: boolean; message?: string; iv_rank?: number | null; error?: string } | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const runTest = async () => {
    setPending(true); setResult(null);
    const t0 = Date.now();
    try {
      const data = await testQuantData();
      setLatency(Date.now() - t0);
      setResult(data);
      setCheckedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      setLatency(Date.now() - t0);
      setResult({ ok: false, error: String(e) });
    } finally { setPending(false); }
  };

  const ok = result?.ok ?? null;

  return (
    <div style={{ border: `1px solid ${ok === true ? 'rgba(34,197,94,0.3)' : ok === false ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <StatusDot ok={ok} pending={pending} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>QuantData API</span>
        {latency != null && (
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)', background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>
            {latency}ms
          </span>
        )}
        <span style={{ flex: 1 }} />
        <RunButton label="Run Test" pending={pending} onClick={runTest} />
      </div>

      {!result && !pending && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          Click Run Test to verify QuantData credentials (Settings → Security must be configured).
        </p>
      )}

      {result && (
        <>
          <ResultGrid items={[
            { label: 'Status',      value: ok ? 'OK' : 'FAILED', color: ok ? 'var(--green)' : 'var(--red)' },
            { label: 'SPY IV Rank', value: result.iv_rank != null ? result.iv_rank.toFixed(1) : '—', color: 'var(--accent)', mono: true },
          ]} />
          {result.message && (
            <div style={{ marginTop: 10, fontSize: 12, fontFamily: 'monospace', padding: '7px 10px', borderRadius: 5,
              color: ok ? 'var(--green)' : 'var(--red)',
              background: ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.07)',
              border: `1px solid ${ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}>
              {result.message || result.error}
            </div>
          )}
          {checkedAt && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Checked at {checkedAt}</div>
          )}
        </>
      )}
    </div>
  );
}

// ── Backend Health Card ──────────────────────────────────────────────────────

function BackendCard() {
  const [pending, setPending] = useState(false);
  const [result, setResult]   = useState<{ status: string; version?: string; latency?: number } | null>(null);

  const runTest = async () => {
    setPending(true); setResult(null);
    const t0 = Date.now();
    try {
      const data = await getApiHealth();
      setResult({ ...data, latency: Date.now() - t0 });
    } catch (e: any) {
      setResult({ status: 'error', latency: Date.now() - t0 });
    } finally { setPending(false); }
  };

  const ok = result ? result.status !== 'error' : null;

  return (
    <div style={{ border: `1px solid ${ok === true ? 'rgba(34,197,94,0.3)' : ok === false ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <StatusDot ok={ok} pending={pending} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Fortress Backend</span>
        {result?.latency != null && (
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)', background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>
            {result.latency}ms
          </span>
        )}
        {result?.version && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>v{result.version}</span>
        )}
        <span style={{ flex: 1 }} />
        <RunButton label="Run Test" pending={pending} onClick={runTest} />
      </div>
      {!result && !pending && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>REST API at localhost:8081.</p>
      )}
      {result && (
        <div style={{ marginTop: 10, fontSize: 12, color: ok ? 'var(--green)' : 'var(--red)' }}>
          {ok ? `Connected · ${result.status}${result.version ? ` · v${result.version}` : ''}` : 'Connection failed'}
        </div>
      )}
    </div>
  );
}

// ── Exported section ─────────────────────────────────────────────────────────

export function ConnectionsSection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>
        Live ping tests — results are not cached.
      </div>
      <IbkrCard />
      <QuantDataCard />
      <BackendCard />
    </div>
  );
}
