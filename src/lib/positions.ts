// ─── Position grouping & leg parsing (shared) ────────────────────────────────
// Sprint 13 (#83): extracted from BriefingPage/PositionsPage so PMCC/IC/BPS/STR
// detection and IBKR local_symbol parsing have exactly one implementation.

export const dte = (expiry: string | null | undefined): number =>
  expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : 0;

export const netOf = (legs: any[], field: string): number =>
  legs.reduce((s: number, l: any) => s + (l[field] ?? 0), 0);

export const fmtStrike = (l: any): string | null =>
  l?.strike && l.strike !== 0 ? `$${l.strike}${l.right ?? ''}` : null;

export function parseLocalSymbol(localSymbol: string | null | undefined): {
  expiry: string | null; right: string | null; strike: number | null;
} {
  const empty = { expiry: null, right: null, strike: null };
  if (!localSymbol) return empty;
  const m = localSymbol.match(/\[\S+\s+(\d{6})([CP])(\d{8})/);
  if (!m) return empty;
  const [, yymmdd, right, strikeStr] = m;
  const expiry = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
  const strike = parseInt(strikeStr, 10) / 1000;
  return { expiry, right, strike };
}

export function augmentLeg(p: any): any {
  if (p.expiry && p.strike && p.right) return p;
  const parsed = parseLocalSymbol(p.local_symbol);
  return {
    ...p,
    expiry: p.expiry ?? parsed.expiry,
    strike: (p.strike && p.strike !== 0) ? p.strike : (parsed.strike ?? p.strike),
    right:  p.right ?? parsed.right,
  };
}

export type StratGroup =
  | { type: 'PMCC'; leap: any; sc: any }
  | { type: 'IC';   sc: any; lc: any; sp: any; lp: any }
  | { type: 'BPS';  sp: any; lp: any }
  | { type: 'STR';  sc: any; sp: any }
  | { type: 'LEG';  leg: any };

export function groupTickerLegs(legs: any[]): StratGroup[] {
  const taken = new Set<any>();
  const free  = (l: any) => !taken.has(l);
  const take  = (...ls: any[]) => ls.forEach(l => taken.add(l));
  const result: StratGroup[] = [];
  const sc = legs.filter(l => free(l) && l.leg_direction === 'short' && l.right === 'C');
  const lc = legs.filter(l => free(l) && l.leg_direction === 'long'  && l.right === 'C');
  const sp = legs.filter(l => free(l) && l.leg_direction === 'short' && l.right === 'P');
  const lp = legs.filter(l => free(l) && l.leg_direction === 'long'  && l.right === 'P');
  // Iron Condor
  for (const shortCall of [...sc]) {
    if (!free(shortCall)) continue;
    for (const shortPut of sp.filter(free)) {
      const longCall = lc.filter(free).find(l => l.strike > shortCall.strike);
      const longPut  = lp.filter(free).find(l => l.strike < shortPut.strike);
      if (longCall && longPut) { take(shortCall, shortPut, longCall, longPut); result.push({ type: 'IC', sc: shortCall, lc: longCall, sp: shortPut, lp: longPut }); break; }
    }
  }
  // PMCC
  for (const leap of lc.filter(free).filter(l => dte(l.expiry) > 90 && (l.strike ?? 0) > 0)) {
    const shortCall = sc.filter(free).find(s => (s.strike ?? 0) > (leap.strike ?? 0));
    if (shortCall) { take(leap, shortCall); result.push({ type: 'PMCC', leap, sc: shortCall }); }
  }
  // Put spreads
  for (const shortPut of sp.filter(free)) {
    const longPut = lp.filter(free).find(l => l.strike < shortPut.strike);
    if (longPut) { take(shortPut, longPut); result.push({ type: 'BPS', sp: shortPut, lp: longPut }); }
  }
  // Strangles
  for (const shortCall of sc.filter(free)) {
    if (!shortCall.expiry) continue;
    const shortPut = sp.filter(free).find(l => l.expiry && l.expiry === shortCall.expiry);
    if (shortPut) { take(shortCall, shortPut); result.push({ type: 'STR', sc: shortCall, sp: shortPut }); }
  }
  for (const leg of legs.filter(free)) result.push({ type: 'LEG', leg });
  return result;
}
