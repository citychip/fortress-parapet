// ─── useSettings — single source of truth for strategy thresholds (#80) ──────
// Module-level cached (like the api.ts GET cache). Components read the SAME
// thresholds Claude manages via MCP instead of hardcoding 0.42/0.35/21/320.

import { useEffect, useState } from 'react';
import { getSettings } from './api';

let _config: any | null = null;
let _promise: Promise<any> | null = null;

function fetchConfig(): Promise<any> {
  if (!_promise) {
    _promise = getSettings()
      .then(v => { _config = v?.config ?? v ?? {}; return _config; })
      .catch(() => { _promise = null; return null; });
  }
  return _promise;
}

/** Returns settings config object (or null while loading). */
export function useSettings(): any | null {
  const [cfg, setCfg] = useState<any | null>(_config);
  useEffect(() => {
    if (_config) return;
    let live = true;
    fetchConfig().then(c => { if (live && c) setCfg(c); });
    return () => { live = false; };
  }, []);
  return cfg;
}

export interface Thresholds {
  deltaWatch: number;   // short-leg delta watch level
  deltaAct: number;     // short-leg delta act level
  rollDte: number;      // roll window (days to expiry)
  betaTarget: number;   // portfolio β-weighted delta target
  ivrMin: number;       // min IVR for new entries
}

const DEFAULTS: Thresholds = { deltaWatch: 0.35, deltaAct: 0.42, rollDte: 21, betaTarget: 320, ivrMin: 25 };

/** Thresholds with safe fallbacks while settings load. */
export function thresholdsOf(cfg: any | null): Thresholds {
  const a = cfg?.alerts ?? {};
  const s = cfg?.strategy ?? {};
  return {
    deltaWatch: a.delta_watch_threshold ?? DEFAULTS.deltaWatch,
    deltaAct:   a.delta_act_threshold   ?? DEFAULTS.deltaAct,
    rollDte:    s.dte_roll_threshold    ?? DEFAULTS.rollDte,
    betaTarget: s.beta_weighted_delta_target ?? s.bwd_target ?? DEFAULTS.betaTarget,
    ivrMin:     s.ivr_min_entry         ?? DEFAULTS.ivrMin,
  };
}

export function useThresholds(): Thresholds {
  return thresholdsOf(useSettings());
}
