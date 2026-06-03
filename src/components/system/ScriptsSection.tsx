import Card from '../Card';

// ── Script metadata ───────────────────────────────────────────────────────────

type Timing = 'Morning' | 'Intraday' | 'Evening' | 'Other';

const SCRIPT_META: Record<string, { name: string; timing: Timing; description: string }> = {
  max_pain:         { name: 'Max Pain',          timing: 'Morning',   description: 'Calculates max pain level for all tickers with open options positions. Run before candidate scan.' },
  iv_crush:         { name: 'IV Crush',           timing: 'Morning',   description: 'IV crush candidate scanner — generates ranked entry list for the Candidates page.' },
  entry_scoring:    { name: 'Entry Scoring',      timing: 'Morning',   description: 'Scores all Tier 1 candidates for entry quality using IV rank, regime, and concentration.' },
  whale_flow:       { name: 'Whale Flow',         timing: 'Intraday',  description: 'Detects large unusual options activity (whale trades) across the universe.' },
  dark_pool_alert:  { name: 'Dark Pool Alert',    timing: 'Intraday',  description: 'Scans for significant dark pool prints that may signal institutional positioning.' },
  position_monitor: { name: 'Position Monitor',   timing: 'Intraday',  description: 'Checks delta drift and stop-loss signals for all open positions.' },
  eod_review:       { name: 'EOD Review',         timing: 'Evening',   description: 'End-of-day portfolio review: delta exposure, concentration, DTE warnings, P&L summary.' },
  premarket:        { name: 'Premarket',          timing: 'Other',     description: 'Runs the premarket workflow script.' },
  daily:            { name: 'Daily',              timing: 'Other',     description: 'Runs the daily workflow script.' },
  gex_oi:           { name: 'GEX / OI',          timing: 'Other',     description: 'Generates GEX and open interest report for all universe tickers.' },
  alert_eval:       { name: 'Alert Eval',         timing: 'Other',     description: 'Evaluates all active alerts against current market data.' },
};

const TIMING_COLORS: Record<Timing, { bg: string; color: string; border: string }> = {
  Morning:  { bg: 'rgba(245,158,11,0.1)',   color: 'var(--yellow)', border: 'rgba(245,158,11,0.25)' },
  Intraday: { bg: 'rgba(59,130,246,0.1)',   color: 'var(--blue)',   border: 'rgba(59,130,246,0.25)' },
  Evening:  { bg: 'rgba(99,102,241,0.1)',   color: 'var(--accent)', border: 'rgba(99,102,241,0.25)' },
  Other:    { bg: 'rgba(100,116,139,0.1)',  color: 'var(--muted)',  border: 'rgba(100,116,139,0.25)' },
};

const TIMING_ORDER: Timing[] = ['Morning', 'Intraday', 'Evening', 'Other'];

// ── Props ─────────────────────────────────────────────────────────────────────

interface ScriptOutput { ok: boolean; output: string }

interface Props {
  scripts: any[];
  running: string | null;
  outputs: Record<string, ScriptOutput>;
  onRun: (key: string) => void;
}

// ── Script row ────────────────────────────────────────────────────────────────

function ScriptRow({ script, running, output, onRun }: {
  script: any;
  running: string | null;
  output?: ScriptOutput;
  onRun: (key: string) => void;
}) {
  const meta = SCRIPT_META[script.key];
  const timing = meta?.timing ?? 'Other';
  const tc = TIMING_COLORS[timing];
  const isRunning = running === script.key;
  const inProcess = !!script.inprocess;

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '12px 16px',
        background: inProcess ? 'rgba(245,158,11,0.03)' : undefined,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{meta?.name ?? script.key}</span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
              background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`,
            }}>{timing}</span>
            {inProcess && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(245,158,11,0.12)', color: 'var(--yellow)', border: '1px solid rgba(245,158,11,0.3)' }}>
                ⚙ in-process
              </span>
            )}
          </div>
          {meta?.description && (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>{meta.description}</p>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{script.filename}</span>
            {script.last_run && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Last: {new Date(script.last_run).toLocaleString()}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => onRun(script.key)}
          disabled={isRunning || inProcess}
          style={{
            fontSize: 12, padding: '5px 16px', borderRadius: 5, whiteSpace: 'nowrap', flexShrink: 0,
            background: isRunning ? 'var(--surface2)' : 'rgba(99,102,241,0.12)',
            color: isRunning ? 'var(--muted)' : 'var(--accent)',
            border: `1px solid ${isRunning ? 'var(--border2)' : 'rgba(99,102,241,0.3)'}`,
            opacity: inProcess ? 0.5 : 1,
          }}
        >
          {isRunning ? '⟳ Running…' : '▶ Run'}
        </button>
      </div>

      {/* Output panel */}
      {output && (
        <div style={{
          margin: '0 16px 12px',
          borderRadius: 6, overflow: 'hidden',
          border: `1px solid ${output.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
        }}>
          <div style={{
            padding: '4px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
            background: output.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            color: output.ok ? 'var(--green)' : 'var(--red)',
            borderBottom: `1px solid ${output.ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
          }}>
            {output.ok ? '✓ Output' : '✗ Error'}
          </div>
          <pre style={{
            margin: 0, padding: '10px 12px',
            fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap',
            color: output.ok ? 'var(--text)' : 'var(--red)',
            background: 'var(--surface)',
            maxHeight: 240, overflowY: 'auto',
          }}>
            {output.output || '(no output)'}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ScriptsSection({ scripts, running, outputs, onRun }: Props) {
  // Group scripts
  const grouped = new Map<Timing, any[]>(TIMING_ORDER.map(t => [t, []]));
  const ordered: string[] = ['max_pain', 'iv_crush', 'entry_scoring', 'whale_flow', 'dark_pool_alert', 'position_monitor', 'eod_review', 'premarket', 'daily', 'gex_oi', 'alert_eval'];

  // Put known scripts in defined order, unknown at end of Other
  const sorted = [
    ...ordered.filter(k => scripts.find(s => s.key === k)),
    ...scripts.filter(s => !ordered.includes(s.key)).map(s => s.key),
  ].map(k => scripts.find(s => s.key === k)).filter(Boolean) as any[];

  for (const s of sorted) {
    const timing = SCRIPT_META[s.key]?.timing ?? 'Other';
    grouped.get(timing)!.push(s);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {TIMING_ORDER.map(timing => {
        const group = grouped.get(timing)!;
        if (group.length === 0) return null;
        const tc = TIMING_COLORS[timing];
        return (
          <div key={timing} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {/* Group header */}
            <div style={{
              padding: '8px 16px',
              background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: tc.color }}>
                {timing} Scripts
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {timing === 'Morning'  && '— Run before 10:00 AM ET'}
                {timing === 'Intraday' && '— Run during market hours'}
                {timing === 'Evening'  && '— Run after market close'}
              </span>
              <span style={{
                marginLeft: 'auto', fontSize: 10, padding: '1px 7px', borderRadius: 10,
                background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`,
              }}>{group.length}</span>
            </div>

            {/* Scripts */}
            {group.map(s => (
              <ScriptRow
                key={s.key}
                script={s}
                running={running}
                output={outputs[s.key]}
                onRun={onRun}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
