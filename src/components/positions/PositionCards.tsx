// ─── Grouped position cards (shared, Sprint 13 #83) ──────────────────────────
// Extracted from BriefingPage so Briefing and Positions > Overview render the
// same PMCC/IC/BPS/STR cards. Thresholds come from settings (#80), not constants.

import { type ReactNode } from 'react';
import { fmt$ } from '../../lib/api';
import { dte, netOf, fmtStrike, groupTickerLegs } from '../../lib/positions';
import { useThresholds, type Thresholds } from '../../lib/useSettings';

const BADGE: Record<string, { bg: string; color: string }> = {
  PMCC: { bg: 'rgba(99,102,241,0.15)',  color: 'var(--accent)' },
  IC:   { bg: 'rgba(59,130,246,0.15)',  color: 'var(--blue)' },
  BPS:  { bg: 'rgba(34,197,94,0.12)',   color: 'var(--green)' },
  STR:  { bg: 'rgba(245,158,11,0.15)',  color: 'var(--yellow)' },
  STD:  { bg: 'rgba(245,158,11,0.15)',  color: 'var(--yellow)' },
  LEG:  { bg: 'rgba(100,116,139,0.15)', color: 'var(--muted)' },
};

function StratRow({ badge, strike, expiry, legs, alert, th }: {
  badge: string; strike: ReactNode;
  expiry: string | null | undefined; legs: any[]; alert?: boolean; th: Thresholds;
}) {
  const d        = dte(expiry);
  const dteColor = d <= 7 ? 'var(--red)' : d <= 14 ? 'var(--yellow)' : 'var(--muted)';
  const netDelta = netOf(legs, 'current_delta');
  const netTheta = netOf(legs, 'current_theta') * 100;
  const netMv    = netOf(legs, 'market_value');
  const netNlv   = netOf(legs, 'net_liq_pct');
  const { bg, color } = BADGE[badge] ?? BADGE.LEG;
  const shortLegs  = legs.filter(l => (l.qty ?? 0) < 0 && l.sec_type !== 'STK');
  const maxShortDelta = shortLegs.length > 0 ? Math.max(...shortLegs.map(l => Math.abs(l.current_delta ?? 0))) : null;
  const alerts: { msg: string; color: string }[] = [];
  if (maxShortDelta != null) {
    if (maxShortDelta >= th.deltaAct)        alerts.push({ msg: `Δ ${maxShortDelta.toFixed(3)} ≥ ${th.deltaAct} — act`,   color: 'var(--red)'    });
    else if (maxShortDelta >= th.deltaWatch) alerts.push({ msg: `Δ ${maxShortDelta.toFixed(3)} ≥ ${th.deltaWatch} — watch`, color: 'var(--yellow)' });
    if (d > 0 && d <= th.rollDte)            alerts.push({ msg: `${d}d to expiry — roll window`, color: d <= 7 ? 'var(--red)' : 'var(--yellow)' });
  }
  const absDelta = Math.abs(netDelta);
  return (
    <div style={{ borderTop: '1px solid var(--border)', background: alert ? 'rgba(239,68,68,0.03)' : undefined }}>
      <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 120px 72px 64px 80px 52px', alignItems: 'center', gap: 8, padding: '9px 16px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: bg, color, textAlign: 'center', letterSpacing: '0.04em' }}>{badge}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{strike}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {expiry ?? '—'}
          {expiry && <span style={{ color: dteColor, marginLeft: 5, fontWeight: d <= 14 ? 600 : 400 }}>{d}d</span>}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right', color: (maxShortDelta ?? absDelta) >= th.deltaAct ? 'var(--red)' : (maxShortDelta ?? absDelta) >= th.deltaWatch ? 'var(--yellow)' : netDelta > 0 ? 'var(--green)' : netDelta < 0 ? 'var(--red)' : 'var(--muted)' }}>
          {netDelta > 0 ? '+' : ''}{netDelta.toFixed(3)}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, textAlign: 'right', color: netTheta >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {netTheta >= 0 ? '+' : ''}${Math.abs(netTheta).toFixed(0)}/d
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right', color: netMv >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt$(netMv, 0)}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, textAlign: 'right', color: 'var(--muted)' }}>{netNlv > 0 ? '+' : ''}{netNlv.toFixed(1)}%</span>
      </div>
      {alerts.length > 0 && (
        <div style={{ padding: '0 16px 8px 80px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {alerts.map((a, i) => <span key={i} style={{ fontSize: 11, color: a.color, fontFamily: 'monospace' }}>⚑ {a.msg}</span>)}
        </div>
      )}
    </div>
  );
}

export function TickerSection({ ticker, legs, ivr, iv, th, exDivRisk }: {
  ticker: string; legs: any[]; ivr?: number | null; iv?: number | null; th: Thresholds;
  exDivRisk?: { severity: string; note?: string | null } | null;
}) {
  const groups     = groupTickerLegs(legs);
  const netDelta   = netOf(legs, 'current_delta');
  const netNlv     = netOf(legs, 'net_liq_pct');
  const nearestDte = Math.min(...legs.map(l => dte(l.expiry)).filter(d => d > 0).concat([Infinity]));
  const hasAlert   = legs.some(l => l.delta_state === 'critical' || l.delta_state === 'watch');
  const isStock    = legs.every(l => l.sec_type === 'STK' || l.sec_type === 'STOCK');
  return (
    <div style={{ border: `1px solid ${hasAlert ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 52 }}>{ticker}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{legs.length} leg{legs.length !== 1 ? 's' : ''}</span>
        {hasAlert && <span style={{ fontSize: 11, color: 'var(--yellow)', fontWeight: 600 }}>⚠ alert</span>}
        {/* Sprint 15.4 — ex-div assignment-risk chip on the short-call ticker */}
        {exDivRisk && (
          <span title={exDivRisk.note ?? 'Ex-div assignment risk on a short call — roll up/out before ex-div'}
            style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
              background: exDivRisk.severity === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)',
              color: exDivRisk.severity === 'high' ? 'var(--red)' : 'var(--yellow)' }}>
            ⚠ EX-DIV
          </span>
        )}
        {nearestDte !== Infinity && (
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: nearestDte <= 7 ? 'rgba(239,68,68,0.15)' : nearestDte <= 14 ? 'rgba(245,158,11,0.12)' : 'rgba(100,116,139,0.08)', color: nearestDte <= 7 ? 'var(--red)' : nearestDte <= 14 ? 'var(--yellow)' : 'var(--muted)', fontWeight: nearestDte <= 14 ? 600 : 400 }}>{nearestDte}d</span>
        )}
        {iv != null && <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>IV {iv.toFixed(1)}%</span>}
        {ivr != null && (
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: ivr >= 50 ? 'rgba(34,197,94,0.1)' : ivr >= 25 ? 'rgba(245,158,11,0.08)' : 'rgba(100,116,139,0.08)', color: ivr >= 50 ? 'var(--green)' : ivr >= 25 ? 'var(--yellow)' : 'var(--muted)', fontWeight: 600 }}>IVR {ivr.toFixed(0)}</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 72, textAlign: 'right' }}>Δ net</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 64, textAlign: 'right' }}>Θ/day</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 80, textAlign: 'right' }}>Mkt Val</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 52, textAlign: 'right' }}>NLV%</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, minWidth: 72, textAlign: 'right', color: Math.abs(netDelta) > th.deltaWatch ? 'var(--yellow)' : 'var(--text)' }}>
          {netDelta > 0 ? '+' : ''}{netDelta.toFixed(3)}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, minWidth: 52, textAlign: 'right', fontWeight: Math.abs(netNlv) > 50 ? 700 : 400, color: Math.abs(netNlv) > 50 ? 'var(--red)' : Math.abs(netNlv) > 20 ? 'var(--yellow)' : 'var(--muted)' }}>
          {netNlv > 0 ? '+' : ''}{netNlv.toFixed(1)}%
          {Math.abs(netNlv) > 50 && <span style={{ marginLeft: 4, fontSize: 10 }}>🔒</span>}
        </span>
      </div>
      {isStock ? (
        <div style={{ padding: '9px 16px', fontSize: 13, color: 'var(--muted)' }}>
          Stock position · {legs[0]?.qty ?? '?'} shares · {fmt$(legs[0]?.market_value, 0)}
        </div>
      ) : (
        groups.map((g, i) => {
          if (g.type === 'PMCC') return (
            <StratRow key={i} badge="PMCC" th={th}
              strike={<><span style={{ color: 'var(--green)' }}>{fmtStrike(g.leap)} LEAP</span><span style={{ color: 'var(--muted)' }}> → </span><span style={{ color: 'var(--red)' }}>{fmtStrike(g.sc)}</span></>}
              expiry={g.sc.expiry} legs={[g.leap, g.sc]} />
          );
          if (g.type === 'IC') return (
            <StratRow key={i} badge="IC" th={th}
              strike={<span style={{ color: 'var(--muted)' }}>{fmtStrike(g.lp)}/{fmtStrike(g.sp)}P · {fmtStrike(g.sc)}/{fmtStrike(g.lc)}C</span>}
              expiry={g.sc.expiry} legs={[g.sc, g.lc, g.sp, g.lp]} />
          );
          if (g.type === 'BPS') {
            const width = g.sp.strike - g.lp.strike;
            const isItm = g.sp.current_delta != null && Math.abs(g.sp.current_delta) > 0.5;
            return (
              <StratRow key={i} badge="BPS" th={th}
                strike={<><span style={{ color: 'var(--red)' }}>{fmtStrike(g.sp)}</span><span style={{ color: 'var(--muted)' }}> / {fmtStrike(g.lp)}</span>{width > 0 && <span style={{ color: 'var(--muted)', fontSize: 11 }}> ({width}w)</span>}{isItm && <span style={{ color: 'var(--red)', fontWeight: 700, marginLeft: 8, fontSize: 11 }}>⚠ ITM</span>}</>}
                expiry={g.sp.expiry} legs={[g.sp, g.lp]} alert={isItm} />
            );
          }
          if (g.type === 'STR') {
            const isStraddle = g.sc.strike === g.sp.strike;
            return (
              <StratRow key={i} badge={isStraddle ? 'STD' : 'STR'} th={th}
                strike={<><span style={{ color: 'var(--red)' }}>{fmtStrike(g.sp)}</span><span style={{ color: 'var(--muted)' }}> / </span><span style={{ color: 'var(--red)' }}>{fmtStrike(g.sc)}</span></>}
                expiry={g.sc.expiry} legs={[g.sc, g.sp]} />
            );
          }
          const leg = g.leg;
          return (
            <StratRow key={i} badge="LEG" th={th}
              strike={<><span style={{ color: leg.leg_direction === 'short' ? 'var(--red)' : 'var(--green)', fontSize: 10 }}>{leg.leg_direction === 'short' ? 'SHORT' : 'LONG'} </span><span>{fmtStrike(leg)}</span></>}
              expiry={leg.expiry} legs={[leg]} />
          );
        })
      )}
    </div>
  );
}

export function PositionsCardList({ positions, ivrMap, ivMap, settings, exDivMap }: {
  positions: any[]; ivrMap?: Map<string, number | null>; ivMap?: Map<string, number | null>; settings?: any;
  exDivMap?: Map<string, { severity: string; note?: string | null }>;
}) {
  const th = useThresholds();
  const byTicker = new Map<string, any[]>();
  for (const leg of positions) {
    const t = leg.ticker ?? '?';
    byTicker.set(t, [...(byTicker.get(t) ?? []), leg]);
  }
  const tickerGroups = [...byTicker.entries()]
    .map(([t, ls]) => ({ ticker: t, legs: ls, nlv: netOf(ls, 'net_liq_pct') }))
    .sort((a, b) => Math.abs(b.nlv) - Math.abs(a.nlv));

  const critical = tickerGroups.filter(g => g.legs.some(l => dte(l.expiry) > 0 && dte(l.expiry) <= 7));
  const warning  = tickerGroups.filter(g => !critical.includes(g) && g.legs.some(l => dte(l.expiry) > 0 && dte(l.expiry) <= 14));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {critical.length > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--red)', fontWeight: 700 }}>⚠ Expiring soon (≤7d):</span>
          {critical.map(g => {
            const d = Math.min(...g.legs.map(l => dte(l.expiry)).filter(x => x > 0));
            return <span key={g.ticker} style={{ fontFamily: 'monospace', fontSize: 12, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: 'var(--red)', fontWeight: 600 }}>{g.ticker} {d}d</span>;
          })}
        </div>
      )}
      {warning.length > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>Near expiry (≤14d):</span>
          {warning.map(g => {
            const d = Math.min(...g.legs.map(l => dte(l.expiry)).filter(x => x > 0));
            return <span key={g.ticker} style={{ fontFamily: 'monospace', fontSize: 12, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: 'var(--yellow)', fontWeight: 600 }}>{g.ticker} {d}d</span>;
          })}
        </div>
      )}
      {tickerGroups.map(g => (
        <TickerSection key={g.ticker} ticker={g.ticker} legs={g.legs} ivr={ivrMap?.get(g.ticker)} iv={ivMap?.get(g.ticker)} th={th} exDivRisk={exDivMap?.get(g.ticker)} />
      ))}
      {settings && (() => {
        const a = settings.alerts ?? {};
        const s = settings.strategy ?? {};
        const items = [
          a.delta_watch_threshold != null && `Δ watch ≥ ${a.delta_watch_threshold}`,
          a.delta_act_threshold   != null && `Δ act ≥ ${a.delta_act_threshold}`,
          s.max_concentration_pct != null && `Max name ${s.max_concentration_pct}% NL`,
          s.sector_concentration_max_pct != null && `Max sector ${s.sector_concentration_max_pct}%`,
          s.ivr_min_entry         != null && `IVR min ${s.ivr_min_entry}`,
          s.dte_roll_threshold    != null && `Roll ≤ ${s.dte_roll_threshold}d`,
        ].filter(Boolean);
        if (!items.length) return null;
        return (
          <div style={{ marginTop: 12, padding: '8px 14px', borderRadius: 6, background: 'var(--surface2)', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {items.map((item, i) => <span key={i} style={{ fontFamily: 'monospace' }}>{item as string}</span>)}
          </div>
        );
      })()}
    </div>
  );
}
