// ─── Analytics charts (GEX / Vol Skew) ───────────────────────────────────────
// Split into its own chunk so Recharts (~688KB) is only loaded when the
// Market > Analytics tab is actually viewed (Sprint 11: lazy-load Recharts).

import Card from './Card';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

function fmtGex(v: number): string {
  if (v == null) return '—';
  const abs = Math.abs(v);
  const sign = v >= 0 ? '+' : '-';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function KVChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 14px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}

export function GexChart({ data, ticker }: { data: any; ticker: string }) {
  // data: {spot, total_gex, strikes: [{strike, net_gex, call_gex, put_gex}]}
  const strikes: any[] = data.strikes ?? [];
  if (!strikes.length) return (
    <Card title={`${ticker} GEX`}>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>No GEX data.</p>
    </Card>
  );

  const spot = data.spot ?? 0;
  const maxAbs = Math.max(...strikes.map(s => Math.abs(s.net_gex ?? 0)), 1);

  // Key levels
  const callWall = data.call_wall ?? strikes.reduce((a: any, s: any) => (s.call_gex ?? 0) > (a?.call_gex ?? 0) ? s : a, strikes[0]);
  const putWall  = data.put_wall  ?? strikes.reduce((a: any, s: any) => (s.put_gex ?? 0) < (a?.put_gex ?? 0) ? s : a, strikes[0]);

  return (
    <Card title={`${ticker} Gamma Exposure — Spot $${spot.toFixed(0)}`}>
      {(data.call_wall || data.put_wall || data.total_gex != null) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          {data.total_gex != null && (
            <KVChip label="Net GEX" value={fmtGex(data.total_gex)} color={data.total_gex >= 0 ? 'var(--green)' : 'var(--red)'} />
          )}
          {callWall?.strike && <KVChip label="Call Wall" value={`$${callWall.strike}`} color="var(--green)" />}
          {putWall?.strike  && <KVChip label="Put Wall"  value={`$${putWall.strike}`}  color="var(--red)"   />}
          {data.flip_level  && <KVChip label="Flip"      value={`$${data.flip_level}`} color="var(--muted)" />}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {strikes.slice(-30).map((s: any, i: number) => {
          const net = s.net_gex ?? 0;
          const pct = (Math.abs(net) / maxAbs) * 100;
          const isPos = net >= 0;
          const isSpot = Math.abs((s.strike ?? 0) - spot) < (spot * 0.005);
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: isSpot ? 'rgba(99,102,241,0.06)' : undefined,
              borderRadius: 3, padding: '1px 4px',
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, minWidth: 48, color: isSpot ? 'var(--accent)' : 'var(--muted)', fontWeight: isSpot ? 700 : 400 }}>
                {s.strike}
              </span>
              <div style={{ flex: 1, height: 12, display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: `${pct}%`, height: 8, borderRadius: 2,
                  background: isPos ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)',
                  minWidth: pct > 0 ? 1 : 0,
                }} />
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: isPos ? 'var(--green)' : 'var(--red)', minWidth: 60, textAlign: 'right' }}>
                {fmtGex(net)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function VolSkewChart({ data, ticker }: { data: any; ticker: string }) {
  // data: {spot_price, atm_iv (already %), skew_25d, expiry, strikes: [{strike, call_iv, put_iv, mid_iv}]}
  const strikes: any[] = data.strikes ?? [];
  const spot = data.spot_price ?? data.spot ?? 0;
  const atmIv = data.atm_iv ?? null;
  const skewSlope = data.skew_25d ?? null;

  const validPts = strikes
    .filter((s: any) => (s.mid_iv ?? s.call_iv ?? s.put_iv) != null)
    .sort((a: any, b: any) => a.strike - b.strike)
    .map((s: any) => ({
      strike: s.strike,
      callIv: s.call_iv ?? null,
      putIv:  s.put_iv  ?? null,
      midIv:  s.mid_iv  ?? (s.call_iv != null && s.put_iv != null ? (s.call_iv + s.put_iv) / 2 : null),
    }));

  if (!validPts.length) return (
    <Card title={`${ticker} Vol Skew${data.expiry ? ` — ${data.expiry}` : ''}`}>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>No skew data.</p>
    </Card>
  );

  const hasCall = validPts.some((p: any) => p.callIv != null);
  const hasPut  = validPts.some((p: any) => p.putIv  != null);
  const hasMid  = validPts.some((p: any) => p.midIv  != null);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 4, fontFamily: 'monospace' }}>${label}</div>
        {payload.map((p: any) => (
          <div key={p.name} style={{ color: p.color }}>{p.name}: {p.value?.toFixed(1)}%</div>
        ))}
      </div>
    );
  };

  return (
    <Card title={`${ticker} Vol Skew${data.expiry ? ` — ${data.expiry}` : ''}`}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {atmIv != null && <KVChip label="ATM IV" value={`${atmIv.toFixed(1)}%`} color="var(--accent)" />}
        {skewSlope != null && <KVChip label="25d Skew" value={`${skewSlope > 0 ? '+' : ''}${skewSlope.toFixed(1)}pp`} color={skewSlope > 0 ? 'var(--red)' : 'var(--muted)'} />}
        {spot > 0 && <KVChip label="Spot" value={`$${spot.toFixed(0)}`} color="var(--muted)" />}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={validPts} margin={{ top: 8, right: 16, bottom: 8, left: 40 }}>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
          <XAxis
            dataKey="strike"
            type="number"
            domain={['dataMin', 'dataMax']}
            allowDecimals={false}
            tickCount={8}
            tickFormatter={(v: number) => `$${v}`}
            tick={{ fill: 'var(--muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            tick={{ fill: 'var(--muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={38}
          />
          <Tooltip content={<CustomTooltip />} />
          {spot > 0 && (
            <ReferenceLine x={spot} stroke="var(--accent)" strokeDasharray="4 3" strokeOpacity={0.8} label={{ value: `$${spot.toFixed(0)}`, fill: 'var(--accent)', fontSize: 10, position: 'top' }} />
          )}
          {hasCall && <Line type="monotone" dataKey="callIv" name="Call IV" stroke="rgba(34,197,94,0.85)" strokeWidth={2} dot={false} />}
          {hasPut  && <Line type="monotone" dataKey="putIv"  name="Put IV"  stroke="rgba(239,68,68,0.85)" strokeWidth={2} dot={false} />}
          {hasMid  && <Line type="monotone" dataKey="midIv"  name="Mid IV"  stroke="#38bdf8"              strokeWidth={2} dot={false} />}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function VolSkewSvg({ puts, calls, spot }: { puts: any[]; calls: any[]; spot: number }) {
  const all = [...puts, ...calls];
  if (!all.length) return null;

  // Merge puts + calls into unified strike array for Recharts
  const strikeMap = new Map<number, { strike: number; putIv?: number; callIv?: number }>();
  for (const r of puts.sort((a, b) => a.strike - b.strike)) {
    strikeMap.set(r.strike, { strike: r.strike, putIv: r.iv });
  }
  for (const r of calls.sort((a, b) => a.strike - b.strike)) {
    const existing = strikeMap.get(r.strike) ?? { strike: r.strike };
    strikeMap.set(r.strike, { ...existing, callIv: r.iv });
  }
  const chartData = Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);

  const atmPut  = puts.length  ? [...puts].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0] : null;
  const atmCall = calls.length ? [...calls].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0] : null;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 4, fontFamily: 'monospace' }}>${label}</div>
        {payload.map((p: any) => (
          <div key={p.name} style={{ color: p.color }}>{p.name}: {p.value?.toFixed(1)}%</div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'rgba(239,68,68,0.9)' }}>■ Put IV</span>
        <span style={{ fontSize: 11, color: 'rgba(34,197,94,0.9)' }}>■ Call IV</span>
        {atmPut  && <span style={{ fontSize: 11, color: 'var(--muted)' }}>ATM Put {atmPut.iv.toFixed(1)}%</span>}
        {atmCall && <span style={{ fontSize: 11, color: 'var(--muted)' }}>ATM Call {atmCall.iv.toFixed(1)}%</span>}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 40 }}>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
          <XAxis
            dataKey="strike"
            type="number"
            domain={['dataMin', 'dataMax']}
            allowDecimals={false}
            tickCount={8}
            tickFormatter={(v: number) => `$${v}`}
            tick={{ fill: 'var(--muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            tick={{ fill: 'var(--muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={38}
          />
          <Tooltip content={<CustomTooltip />} />
          {spot > 0 && (
            <ReferenceLine x={spot} stroke="var(--accent)" strokeDasharray="4 3" strokeOpacity={0.8} label={{ value: `$${spot.toFixed(0)}`, fill: 'var(--accent)', fontSize: 10, position: 'top' }} />
          )}
          <Line type="monotone" dataKey="putIv"  name="Put IV"  stroke="rgba(239,68,68,0.85)" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="callIv" name="Call IV" stroke="rgba(34,197,94,0.85)" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}
