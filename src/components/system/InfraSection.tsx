import { useState, useEffect, useRef } from 'react';
import Card from '../Card';
import { ibkrReconnect, getIbkrStatus, type IbkrStatusData } from '../../lib/api';

interface Props {
  ibkr: IbkrStatusData | null;
  syncing: boolean;
  onSync: () => void;
}

function StatusDot({ ok, pulse }: { ok: boolean | undefined; pulse?: boolean }) {
  const color = ok === true ? 'var(--green)' : ok === false ? 'var(--red)' : 'var(--muted)';
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color,
      boxShadow: ok === true ? `0 0 6px var(--green)` : ok === false ? `0 0 4px var(--red)` : undefined,
      animation: pulse ? 'pulse 1.5s infinite' : undefined,
      flexShrink: 0,
    }} />
  );
}

type ReconnectState = 'idle' | 'restarting' | 'waiting' | 'success' | 'failed';

export function InfraSection({ ibkr, syncing, onSync }: Props) {
  const [oauthExpanded, setOauthExpanded]   = useState(false);
  const [reconnectState, setReconnectState] = useState<ReconnectState>('idle');
  const [reconnectMsg, setReconnectMsg]     = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleReconnect = async () => {
    if (reconnectState !== 'idle' && reconnectState !== 'failed' && reconnectState !== 'success') return;
    setReconnectState('restarting');
    setReconnectMsg('Restarting iBeam…');
    try {
      await ibkrReconnect();
    } catch {
      // Backend may return before iBeam is up — that's ok, we poll regardless
    }
    setReconnectState('waiting');
    setReconnectMsg('Waiting for authentication…');
    let elapsed = 0;
    const POLL_INTERVAL = 3000;
    const TIMEOUT = 60000;
    pollRef.current = setInterval(async () => {
      elapsed += POLL_INTERVAL;
      try {
        const status = await getIbkrStatus();
        if (status?.web_api?.session_status?.authenticated) {
          clearInterval(pollRef.current!);
          setReconnectState('success');
          setReconnectMsg('Connected ✓');
          setTimeout(() => { setReconnectState('idle'); setReconnectMsg(''); onSync(); }, 2000);
          return;
        }
      } catch { /* keep polling */ }
      if (elapsed >= TIMEOUT) {
        clearInterval(pollRef.current!);
        setReconnectState('failed');
        setReconnectMsg('Timed out — check iBeam logs');
      } else {
        setReconnectMsg(`Waiting for authentication… ${elapsed / 1000}s`);
      }
    }, POLL_INTERVAL);
  };

  const reconnectLabel = {
    idle: '⟳ Reconnect',
    restarting: 'Restarting…',
    waiting: reconnectMsg,
    success: '✓ Connected',
    failed: '✗ Retry',
  }[reconnectState];

  const reconnectColor = {
    idle: 'var(--yellow)',
    restarting: 'var(--muted)',
    waiting: 'var(--muted)',
    success: 'var(--green)',
    failed: 'var(--red)',
  }[reconnectState];

  const isReconnecting = reconnectState === 'restarting' || reconnectState === 'waiting';

  const wa = ibkr?.web_api;
  const authenticated = wa?.session_status?.authenticated;
  const connected     = wa?.session_status?.connected;
  const authMode      = ibkr?.active_backend ?? 'ibeam';
  const isOauth       = authMode === 'oauth';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* IBKR Connection Card */}
      <div style={{ border: `1px solid ${authenticated ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 10, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px', background: 'var(--surface2)',
          display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid var(--border)',
        }}>
          <StatusDot ok={authenticated} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>IBKR Connection</span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace', fontWeight: 600,
            background: isOauth ? 'rgba(99,102,241,0.12)' : 'rgba(59,130,246,0.12)',
            color: isOauth ? 'var(--accent)' : 'var(--blue)',
            border: `1px solid ${isOauth ? 'rgba(99,102,241,0.25)' : 'rgba(59,130,246,0.25)'}`,
          }}>{isOauth ? 'OAuth 1.0a' : 'iBeam'}</span>
          <span style={{ flex: 1 }} />
          {!authenticated && (
            <button onClick={handleReconnect} disabled={isReconnecting} style={{
              background: 'none', color: reconnectColor,
              border: `1px solid ${reconnectColor}`,
              padding: '5px 14px', fontWeight: 600, fontSize: 12,
              minWidth: 140, textAlign: 'center',
            }}>
              {reconnectLabel}
            </button>
          )}
          <button onClick={onSync} disabled={syncing} style={{
            background: 'var(--accent)', color: '#fff', padding: '5px 16px', fontWeight: 600, fontSize: 12,
          }}>
            {syncing ? '…' : '↻ Sync'}
          </button>
        </div>

        {/* Status grid */}
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Status',       value: authenticated ? 'Authenticated' : 'Disconnected', color: authenticated ? 'var(--green)' : 'var(--red)', mono: false },
              { label: 'Session',      value: connected === true ? 'Connected' : connected === false ? 'Disconnected' : '—', color: connected === true ? 'var(--green)' : 'var(--muted)', mono: false },
              { label: 'Account',      value: wa?.account ?? '—', color: 'var(--text)', mono: true },
              { label: 'OPRA',         value: wa?.opra_subscribed === true ? '✓ Subscribed' : wa?.opra_subscribed === false ? '✗ Not subscribed' : '—', color: wa?.opra_subscribed === true ? 'var(--green)' : 'var(--muted)', mono: false },
              { label: 'Auth Mode',    value: authMode, color: 'var(--accent)', mono: true },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: r.color, fontFamily: r.mono ? 'monospace' : undefined }}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>

          {/* Error message */}
          {wa?.error && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace',
              color: 'var(--red)', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
            }}>
              {wa.error}
            </div>
          )}

          {/* Auth instructions if disconnected */}
          {!authenticated && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginTop: 10,
              background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
              fontSize: 12, color: 'var(--muted)',
            }}>
              <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>Not authenticated.</span>
              {!isOauth
                ? <> Open <a href="https://localhost:5000" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>localhost:5000</a> in your browser and log in with IBKR credentials, then sync.</>
                : <> OAuth 1.0a is active — consumer key SHARMILAH. Test after weekend IBKR server restart.</>
              }
            </div>
          )}
        </div>
      </div>

      {/* OAuth detail (collapsed by default) */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <button
          onClick={() => setOauthExpanded(e => !e)}
          style={{
            width: '100%', padding: '12px 16px', background: 'var(--surface2)',
            display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>OAuth 1.0a Status</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>Consumer key SHARMILAH — pending IBKR weekend activation</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{oauthExpanded ? '▲' : '▼'}</span>
        </button>
        {oauthExpanded && (
          <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
            {[
              { label: 'Implementation', value: 'Complete ✓', color: 'var(--green)' },
              { label: 'Consumer key', value: 'SHARMILAH', color: 'var(--accent)', mono: true },
              { label: 'Blocker', value: 'IBKR activates keys on weekend server restarts', color: 'var(--yellow)' },
              { label: 'Access token', value: 'a363e79f963436353b11', color: 'var(--muted)', mono: true },
              { label: 'Key files', value: '/home/ubuntu/ibkr-oauth/', color: 'var(--muted)', mono: true },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)', minWidth: 130 }}>{r.label}</span>
                <span style={{ color: r.color, fontFamily: (r as any).mono ? 'monospace' : undefined }}>{r.value}</span>
              </div>
            ))}
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
              To test: switch to OAuth mode via toggle → Trigger Sync → check logs for "LST validated OK ✓" + "ssodh/init: 200".
            </p>
          </div>
        )}
      </div>

      {/* System status */}
      <Card title="Backend Status">
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'IBKR Web API', ok: authenticated },
            { label: 'OPRA',         ok: wa?.opra_subscribed },
            { label: 'Backend',      ok: ibkr !== null },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusDot ok={s.ok} />
              <span style={{ fontSize: 13, color: s.ok ? 'var(--text)' : 'var(--muted)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}
