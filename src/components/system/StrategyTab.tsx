import Card from '../Card';

export function StrategyTab({ s, trader }: { s: any; trader?: any }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 13, color: 'var(--muted)', flex: 1 }}>
          Strategy thresholds are managed by Claude — e.g. <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>"set ivr_min_entry to 20"</span> or <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>"update delta roll threshold to 0.40"</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, padding: '3px 10px', background: 'rgba(99,102,241,0.15)', borderRadius: 4 }}>Edit via Claude</span>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <Card title="Delta Management" style={{ flex: 1 }}>
          <StrategyRule label="Entry target" value={`${s.target_delta_low ?? '?'} – ${s.target_delta_high ?? '?'}`} unit="Δ" color="var(--green)" />
          <StrategyRule label="Watch" value={s.delta_watch_threshold ?? '0.35'} unit="Δ" color="var(--yellow)" />
          <StrategyRule label="Roll trigger" value={s.delta_critical_threshold} unit="Δ" color="var(--red)" />
          <StrategyRule label="β-wtd target" value="320" unit="β-Δ" />
        </Card>
        <Card title="Entry Gates" style={{ flex: 1 }}>
          <StrategyRule label="IVR minimum" value={s.ivr_min_entry ?? 25} unit="IVR" color="var(--blue)" />
          <StrategyRule label="IVR prime" value={s.ivr_high_threshold ?? 50} unit="IVR" color="var(--accent)" />
          <StrategyRule label="Earnings blackout" value={s.leap_earnings_blackout_days ?? 21} unit="days" />
          <StrategyRule label="DTE roll trigger" value={s.dte_roll_threshold ?? 21} unit="days" />
          <StrategyRule label="Execute after" value="10:00 AM ET" />
        </Card>
        <Card title="Pacing & Sizing" style={{ flex: 1 }}>
          <StrategyRule label="Max entries/week" value={s.entries_per_week_max ?? 5} />
          <StrategyRule label="Max positions" value={s.max_positions ?? 20} />
          <StrategyRule label="Max concentration" value={`${s.max_concentration_pct ?? 20}%`} color="var(--yellow)" />
          <StrategyRule label="Conc hard limit" value={`${s.high_conc_threshold_pct ?? 50}%`} color="var(--red)" />
          <StrategyRule label="Max long option" value={`${s.max_long_option_pct_nlv ?? 5}% NLV`} />
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <Card title="P&L Rules" style={{ flex: 1 }}>
          <StrategyRule label="Profit target" value={`${s.profit_target_pct ?? 80}%`} unit="max credit" color="var(--green)" />
          <StrategyRule label="Stop loss" value={`${s.stop_loss_drawdown_pct ?? 100}%`} unit="drawdown" color="var(--red)" />
          <StrategyRule label="SMA200 buffer" value={`${((s.stop_loss_sma200_buffer ?? 0.02) * 100).toFixed(0)}%`} unit="below SMA" />
          <StrategyRule label="LEAPs profit take" value={`${s.leaps_profit_take_pct ?? 50}%`} />
        </Card>
        <Card title="Credit Minimums" style={{ flex: 1 }}>
          <StrategyRule label="PMCC" value={`$${s.min_credit_pmcc ?? 0.3}`} />
          <StrategyRule label="CSP" value={`$${s.min_credit_csp ?? 0.5}`} />
          <StrategyRule label="PCS" value={`$${s.min_credit_pcs ?? 0.5}`} />
          <StrategyRule label="Iron Condor" value={`$${s.min_credit_iron_condor ?? 1.0}`} />
          <StrategyRule label="Strangle" value={`$${s.min_credit_strangle ?? 1.5}`} />
        </Card>
        <Card title="VIX Regime" style={{ flex: 1 }}>
          <StrategyRule label="Normal" value={`< ${s.vix_low ?? 15}`} color="var(--green)" />
          <StrategyRule label="Elevated" value={`${s.vix_low ?? 15} – ${s.vix_high ?? 25}`} color="var(--yellow)" />
          <StrategyRule label="High" value={`> ${s.vix_high ?? 25}`} color="var(--red)" />
          <StrategyRule label="Extreme" value={`> ${s.vix_extreme ?? 35}`} color="var(--red)" />
          <StrategyRule label="SPY hedge band" value={`$${s.spy_hedge_min_usd ?? 20000}–$${s.spy_hedge_max_usd ?? 33000}`} />
        </Card>
      </div>

      {trader?.active_strategies && (
        <Card title="Active Strategies">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {String(trader.active_strategies).split(',').map((st: string) => st.trim()).filter(Boolean).map((st: string, i: number) => (
              <span key={i} style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
                color: 'var(--accent)',
              }}>{st}</span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function StrategyRule({ label, value, unit, color }: { label: string; value: any; unit?: string; color?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color ?? 'var(--text)', fontFamily: 'monospace' }}>
        {String(value ?? '—')} {unit && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{unit}</span>}
      </span>
    </div>
  );
}
