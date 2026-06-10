# Fortress — Session Handoff
**2026-06-10 | For: Next Cowork session**

---

## Documentation (start here)

| Doc | What's in it |
|---|---|
| `docs/SYSTEM.md` | Architecture, services, deploy commands, GitHub repos, IBKR auth |
| `docs/PORTFOLIO.md` | Current positions, pending actions, strategy rules, universe, LEAP watch list |
| `docs/WORKFLOW.md` | Daily startup, entry/roll/stop workflows, key Claude commands |
| `docs/PARAPET.md` | Component map, API layer, sprint log, design principles |

---

## Immediate Priorities (next session)

**Priority 0 — iBeam auth (do first, every session)**
iBeam is headless — it authenticates automatically. Check Parapet → System → Settings → Connections.
- If IBKR ● green → you're done
- If IBKR ● red → click **Reconnect** button (new, Jun 8) → wait ~35s → auto-syncs on success

**Priority 1 — AAPL LEAP entry window**
WWDC was June 8. No sell-the-news dip to $300–305 materialised today. Default entry: **June 12 — after PPI print**.
Target: Jan28 250C, Δ ~0.87, ~$86/contract. Run pretrade check first.
⚠️ Two binary events this week: CPI (May) Wednesday Jun 10 at 8:30am AND PPI (May) Thursday Jun 12 (both High impact). Do NOT enter before PPI — SPY Jun12 vol skew shows 17.15% ATM IV with skew_10d +6.19 (steep tail puts), meaning real IV crush risk post-prints. Entering before PPI means buying inflated premium that could crush 10-15% even if AAPL moves your way. Wait until after both prints, then enter.
AAPL confirmed as only Tech name in bullish leadership (OptionsPlay). Last week's momentum plays: Jun05 $310C +50%, Jun12 $315C +10.29% — empirical validation.

**Priority 2 — MSFT Jun18 BPS expires Jun 18**
Short Jun18 380P/370P ×1 — near worthless, Δ ~-0.04. Let expire. No action.

**Priority 3 — AMD Jun26 PCS expires Jun 26**
Jun26 380P/375P ×1 — far OTM, Δ ~-0.067. Let expire. No action.

**Priority 4 — NVDA roll still open**
Aug21 250C Δ 0.211 — safe. The Jun2 roll order `2572e40c` to Sep19 265C is likely expired. Re-stage only if delta rises above 0.35.

**Priority 5 — Stop-loss ACT signals (monitor, no mechanical trigger)**
MSFT ($410 vs SMA floor $445), META ($588 vs SMA floor $648), V ($320 vs SMA floor $322). All short strikes well OTM — no required action. V is borderline ($1.35 below floor). Monitor.

**Priority 6 — MSFT de-risking (can accelerate — Dutch Box 3)**
93% NLV. No new PMCC entries. Original goal: below 50% by Dec 2026.
Dutch Box 3 tax law applies: NO capital gains tax on realized gains. Tax is calculated on total portfolio value at January 1 (peildatum) each year as a deemed return (~6.17% × 36% = ~2.2% annually). Selling a MSFT LEAP and reinvesting creates zero additional tax friction vs. holding. The Dec 2026 target can be accelerated — pace should be driven by market conditions and entry opportunities in rotation sectors, not tax concerns. Confirm specifics with a belastingadviseur re Box 3 vs Box 1 classification of options activity.

**Priority 7 — OAuth Stage 2**
Tested June 8 — still "Invalid signature / consumer key not fully activated". Still waiting on IBKR.

---

## What Happened This Session (Jun 10 — Parapet Sprint 12)

Sprint 12 — 5 fixes to Parapet, deployed and verified live, pushed as commit `f900231`:

- **#73 QuantData IV Rank table** — documented the upstream `iv_rank` bug (identical values per ticker when `expiration_date` is passed) as a "Known issue" callout in `MarketPage.tsx`. Not fixable from Parapet — needs an upstream quantdata-mcp fix.
- **#74 Exposure tab β-wtd delta target** — fixed units mismatch in `PositionsPage.tsx`: target was 0.35 (a per-position option-delta number), should be **320** (portfolio β-weighted delta, matching System > Strategy "β-wtd target"). Now shows e.g. "658.20 ... target 320 β-Δ · +338.2 off".
- **#75 Vol Skew chart x-axis** — `AnalyticsCharts.tsx` switched to `type="number"` XAxis with `domain={['dataMin','dataMax']}` + `tickCount={8}` and `connectNulls` on Lines. Was rendering one-tick-per-point and crushing the chart; now spans the real strike range (e.g. AVGO $150–$720) with readable ticks.
- **#76 Journal/Scripts timestamps** — new `fmtDateTime()` helper in `api.ts` (`YYYY-MM-DD HH:MM:SS`, locale-independent), wired into System > Journal and System > Scripts "Last run".
- **#77 Market tab merge** — folded the separate "QuantData" tab into "Analytics" as a "Universe Signals (QuantData)" section below the per-ticker GEX/Skew/Ladder view. Market is now 3 tabs: Analytics, Earnings Calendar, Universe.
- Also added `src/components/system/ScriptsSection.tsx` to `deploy_parapet.sh`'s FILES array (was missing, so Scripts changes weren't being synced to WSL on deploy).

Docs updated: `PARAPET_SPRINT.md` (new "Sprint 12 (complete)" section), `docs/PARAPET.md` (bumped to v2.4, Market tab table + Component Map + Sprint Log updated to reflect 3-tab Market page).

Investigated a suspected `\api\...` backslash path bug in `api.ts` carried over from a prior session — **false alarm**, paths in `api.ts` (lines ~218-225, ~336-340) use correct forward slashes. No change needed.

Remaining backlog: two upstream quantdata-mcp issues (`iv_rank` identical values per ticker; `exposure_by_strike`/`volatility_skew` returning empty during market hours) — both already surfaced in-app via "Known issues" callouts, not actionable from Parapet.

---

## What Happened This Session (Jun 8 — third context)

### Parapet v2.0 — 6 new features implemented

All implemented in a single session pass. Files changed:

**`fortress-parapet/src/lib/api.ts`** — 6 new exports:
- `getTimeOfDay()` → `GET /api/run/time_of_day`
- `getRollAll()` → `GET /api/manage/roll_all`
- `getStopLossAll()` → `GET /api/manage/stop_loss_all`
- `getPretradeAll()` → `GET /api/manage/pretrade_all`
- `getGex(ticker)` → `GET /api/options/gex/{ticker}`
- `getVolSkew(ticker)` → `GET /api/options/vol-skew/{ticker}`

**`fortress-parapet/src/components/Layout.tsx`** — Market status chip in header
- Fetches `getTimeOfDay()` on mount; shows `● Open` (green) / `○ Pre` (amber) / `○ Closed` (muted)
- Chip appears in every page header between timestamp and action slot

**`fortress-parapet/src/pages/CandidatesPage.tsx`** — 2 new columns
- **Pretrade**: PROCEED (green) / BLOCKED (red) — from `getPretradeAll()`, loaded in background after candidates fetch
- **Eff%**: capital efficiency for positions that exist (from `getCapitalEff()`, `by_position` array); `—` for new candidates with no existing position. Green ≥15%, yellow ≥8%, red <8%.

**`fortress-parapet/src/pages/PortfolioPage.tsx`** — Triage tab + P&L history
- New **Triage** tab (second position in tab bar): calls `getRollAll()` + `getStopLossAll()` in parallel on mount. Shows summary chips + sortable tables for both roll urgency and stop-loss verdict. Stop-loss table sorted ACT → WATCH → SAFE.
- **P&L → History** section added to bottom of P&L tab: fetches `getPnlHistory()`. Empty state shows graceful message; when data exists shows cumulative P&L SVG line chart (green above zero, red below).

**`fortress-parapet/src/pages/MarketPage.tsx`** — Options Analytics tab
- New **Options Analytics** tab (second in tab bar, before Earnings Calendar)
- Ticker selector chips from universe; auto-loads on tab entry
- **GEX chart**: horizontal bar chart per strike coloured green (positive GEX) / red (negative GEX). KV chips for Net GEX, Call Wall, Put Wall, Flip Level. Spot strike highlighted.
- **Vol Skew chart**: SVG line chart with call IV (green), put IV (red), mid IV (blue) by strike. KV chips for ATM IV, skew slope, spot.

⚠️ **ACTION REQUIRED: Rebuild and redeploy Parapet** (`npm run build` in `fortress-parapet/`).

---

## What Happened This Session (Jun 8 — evening, continued, second context)

### Backend deploy — all endpoints confirmed live

**All three yfinance routes now deployed and confirmed working on VPS** (`root@76.13.138.194`):

| Endpoint | Status | Sample |
|---|---|---|
| `GET /api/options/gex/SPY` | ✓ live | spot=739.22, call_wall=739, put_wall=740, flip=739 |
| `GET /api/options/vol-skew/SPY` | ✓ live | atm_iv=0.77%, skew_25d=0.34, skew_10d=0.41 |
| `GET /api/options/liquidity/SPY` | ✓ live | grade=B, atm_spread=0.4%, advisory=False |
| `GET /api/options/strategy_metrics?ticker=SPY` | ✓ live | regime=neutral, ivr=50.0, rec=PCS |

VPS token: `07f03fb6e664859ac5e8113eaf1102ac43a3cb785c5` (env var in systemd unit, NOT the file at `.fortress_api_token`)

**Root cause of context-switch confusion:** VPS `options_analytics.py` had been corrupted (duplicate liquidity stub, missing GEX/skew routes, no module header). Fixed by SCP-ing the clean workspace version to VPS, confirming registration in `app/main.py` lines 138-139.

### MCP v4.4.0 — 2 new tools written

File: `fortress_mcp_v430.py` in workspace (despite filename, now contains v4.4.0 with 67 tools)

**⚠️ ACTION REQUIRED: Copy to active location manually:**
```
From: C:\Users\cityc.000\OneDrive\_Stocks26\2606Fortress\fortress_mcp_v430.py
To:   C:\Users\cityc.000\fortress_mcp\fortress_mcp.py
Then: Restart Claude Desktop
```

New tools added (above Entry point block):
- `get_strategy_metrics(ticker, mode="new", target_dte=45)` → `GET /api/options/strategy_metrics`
- `check_liquidity(ticker, expiry=None, moneyness_range=0.15)` → `GET /api/options/liquidity/{ticker}`

### Parapet — "Rec" strategy column added to Candidates tab

Files modified:
- `fortress-parapet/src/lib/api.ts` — added `StrategyMetrics` interface + `getStrategyMetrics()` function
- `fortress-parapet/src/pages/CandidatesPage.tsx` — added `StrategyBadge` component; parallel fetch of strategy metrics for all `can_trade` rows after candidates load; "Rec" column in table

⚠️ **ACTION REQUIRED: Rebuild and redeploy Parapet** (if running local dev server it updates automatically; otherwise `npm run build`).

### Strategy document — v3.9.0

File: `01_Portfolio_Strategy_v3_9.md` (source of truth updated in-place at `01_Portfolio_Strategy_v3_8.md`, copy saved as v3.9)

Key additions: §2.F–H (CSP, IC, CC strategies); §2.5 strategy selection framework (regime gate → yield comparison); §4 two-tier bid-ask threshold (5% advisory, 10% hard block); workflow step 3 updated; tool stack updated to v4.4.0; QuantData qd_get_volatility_skew and qd_get_exposure_by_strike marked broken.

---

## What Happened This Session (Jun 10 — Sprint 11)

### Parapet v2.3 — Sprint 11 (earnings vol calendar, NLV delta, auto-refresh, bundle split)

**1 new file, 3 files updated:**

| Change | File | Detail |
|---|---|---|
| Earnings volatility calendar | `MarketPage.tsx` | Earnings Calendar table gains "Expected Move" and "IV Crush Risk" columns. Background fetch of `getEarningsVolatility(ticker)` per calendar ticker; `crushRisk()` flags PRIME CRUSH (≥5pp implied−avg, red) / ELEVATED (≥2pp, yellow) / NORMAL (green). |
| Briefing NLV Δ vs yesterday | `BriefingPage.tsx` | New `nlv_history` localStorage map (date → net liq, 30-day rolling). Stat bar gains "NLV Δ (1d)" showing `$Δ (±%Δ)` vs the most recent prior-day snapshot, green/red by sign. |
| Triage auto-refresh | `TriagePage.tsx` | Replaced 5-min poll with 60s poll, paused when tab hidden (`document.visibilityState`), plus immediate refresh on tab refocus. New `⟳ Auto 60s` / `⏸ Paused` toggle in page header, persisted via `triage_auto_refresh` localStorage key. |
| Lazy-load Recharts | `MarketPage.tsx`, `components/AnalyticsCharts.tsx` (new) | `GexChart`, `VolSkewChart`, `VolSkewSvg` extracted into a new file and loaded via `React.lazy()` + `Suspense`. Recharts (~688KB) no longer ships in MarketPage's main chunk — only loaded when the Analytics GEX/Skew view renders. |
| Deploy script | `deploy_parapet.sh` | Now also syncs `src/components/AnalyticsCharts.tsx` |

**Parapet state:** v2.3 · Sprint 11 complete · pending deploy (run `deploy_parapet.sh` from WSL)

---

## What Happened This Session (Jun 9 — Sprint 10)

### Parapet v2.2 — Sprint 10 (Recharts, Exposure tab, PoP calc)

**3 files upgraded, 1 new dependency (Recharts v3):**

| Change | File | Detail |
|---|---|---|
| Recharts v3 added | `package.json` | `"recharts": "^3.0.0"` — replaces 770 modules (was 864 on v2) |
| Vol skew charts → Recharts | `MarketPage.tsx` | `VolSkewChart` + `VolSkewSvg` replaced with `LineChart`/`ResponsiveContainer`. Interactive tooltips, spot price `ReferenceLine`, clean axis ticks. Removed SVG coordinate math (~80 lines → ~40). |
| Exposure tab rebuilt | `PositionsPage.tsx` | New `ExposureTab` component. Summary row: β-weighted delta vs 0.35 target + visual progress bar + stacked sector mix bar. Sector breakdown: visual horizontal bars per sector (8 OKLCH colors). Delta contribution: bar chart per ticker, green/red by direction. |
| Black-Scholes PoP | `CandidatesPage.tsx` | `normCDF` + `calcPoP` + `calc1SD` pure-JS functions added. Stage Trade form now shows vol context strip: expected 1-SD move (±$ and ±%) + ATM PoP %, updates live as DTE changes. |
| Deploy script | `deploy_parapet.sh` | Now syncs `package.json` and runs `npm install` before build |

**Parapet state:** v2.2 · Sprint 10 complete · deployed Jun 9 · Recharts v3.x

---

## What Happened This Session (Jun 9 — morning)

### Parapet v2.1 — Sprint 9 (6 features) + IV rank caching

**Sprint 9 features — all shipped:**

| # | Feature | Files |
|---|---|---|
| #53 | Horizontal scroll on Triage active-alerts table | TriagePage.tsx |
| #54 | In-page tab keyboard shortcuts (1–N keys) | MarketPage.tsx, PositionsPage.tsx, SystemPage.tsx |
| #55 | P&L summary strip on Briefing (total/unrealized/realized + winner/loser) | BriefingPage.tsx |
| #56 | QuantData live IV rank signal board (auto-loads, sort toggle) | MarketPage.tsx |
| #57 | Roll P&L column in Triage roll table (via `evaluateRoll()` background fetch) | TriagePage.tsx, api.ts |
| #58 | Stage trade inline mini-form on Candidates expandable row | CandidatesPage.tsx, api.ts |

**IV rank localStorage caching (bonus fix):**
- `saveCachedIvr(ticker, data)` saves to `ivr_cache:TICKER` whenever live `iv_rank` is non-null
- `loadCachedIvr(ticker)` reads cache as fallback when live is null (outside market hours)
- Table merges live + cached: cached rows render at 75% opacity with a small `M/DD HH:MM` timestamp
- Sort uses cached IVR when live is null — table remains useful after hours
- File: `MarketPage.tsx` (`IvRankSection` component)

**IV units bug also fixed this session:**
- Backend returns IV as percentage values (e.g., `39.05` = 39.05%), not decimals
- Removed spurious `* 100` multiplier in `MarketPage.tsx` and `ConnectionsSection.tsx`

**Parapet state:** v2.1 · deployed at `http://localhost:4000`

---

## What Happened This Session (Jun 9 — earlier)

### MCP + Parapet — backlog items completed

**MCP: `force_decline_order` + `expire_stale_orders` added (fortress_mcp.py v4.2.1)**
Two new write tools exposed via MCP — previously REST-only:
- `force_decline_order(order_id)` → `DELETE /api/orders/pending/{id}/force`
- `expire_stale_orders()` → `POST /api/orders/expire-stale`
Both use existing `_delete`/`_post` helpers and `_writes_check()`. Confirmed live in Claude.

**Parapet v1.9.1: SPY Hedge Coverage + DP Floors wired up**
Bug: `api.ts` had wrong URL paths for both endpoints. Fixed:
- `getSpyHedge`: `/api/spy-hedge-coverage` → `/api/manage/spy_hedge_coverage`
- `getDpFloorsGex`: `/api/dp-floors-and-gex/{ticker}` → `/api/chart/{ticker}/levels`
UI code was already built — two-line fix. Both cards confirmed rendering live data in Overview → Market tab. Committed as Parapet v1.9.1.

---

## What Happened This Session (Jun 8 — evening, continued)

### Research analysis — two weekly reports reviewed

**OptionsPlay Weekly (Jun 8):**
- Regime: Neutral (0/+5, down from +5). Entire AI/semi/mega-cap complex in Early Breakdown.
- AAPL: only Tech name in confirmed bullish leadership. Green light for LEAP entry.
- NVDA: explicitly Early Breakdown. Fortress SAFE signal (above SMA $188) diverges — monitor.
- V: ACT signal (barely below SMA) but financials are #1 bullish sector — probable false alarm.
- Top sector rotation: financials, healthcare, industrials (XLF entered confirmed bullish first time this cycle).
- Top ideas to watch: ELV, GE, PNC, CSX, MAR, SPG.

**Trading Analyst Weekly (Jun 8):**
- Corroborates OptionsPlay: Nasdaq -4.68%, VIX closed Friday at 21.50 (highest since March).
- Fear & Greed Index: 42 (fear). Market breadth negative NYSE and Nasdaq.
- Adds: PPI (May) Thursday Jun 12 is also High-impact — two back-to-back inflation prints.
- AAPL empirical validation: Jun05 $310C +50%, Jun12 $315C +10.29% both won last week.
- FOMC Jun 16-17: Kevin Warsh's first meeting. Expected hold, but higher-for-longer confirmed.
- Pre-market Jun 9 snapshot: S&P -2.64%, Nasdaq -4.18%, VIX 19.0 (down from 21.51 — orderly selloff, not panic).

### Universe additions — 5 new tickers added to tier1

Added via `add_universe_ticker` based on OptionsPlay rotation thesis:

| Ticker | Sector | Rationale |
|---|---|---|
| ELV | Healthcare | Confirmed bullish, OptionsPlay top idea |
| GE | Industrials | Early Breakout, aerospace/defense |
| PNC | Financials | Early Breakout, XLF bullish leadership |
| CSX | Industrials | Early Breakout, transports |
| MAR | Consumer/Travel | OptionsPlay top idea, resilient travel demand |

Universe now 22 tickers in tier1 (up from 17).

### Dutch tax law — de-risking calculus revised

Portfolio is taxed under Dutch Box 3 (Sparen en Beleggen). Key implication: **there is no capital gains tax event when selling MSFT LEAPs**. Tax is assessed annually on January 1 (peildatum) on total net asset value at a deemed return rate (~6.17% on investments × 36% tax = ~2.2% of portfolio value per year). Selling and reinvesting creates no additional tax friction vs. holding concentrated MSFT. The US-style "don't sell, defer the gain" logic does not apply under Dutch law. De-risking pace can be driven purely by market conditions and entry opportunities. Confirm Box 3 vs Box 1 classification with a belastingadviseur given frequency of options activity.

### Portfolio scenario model built

3/6/9/12-month NLV forecasts across bear/base/bull scenarios:

| Scenario | 3m | 6m | 9m | 12m | MSFT assumption |
|---|---|---|---|---|---|
| Bull | $100k | $116k | $130k | $145k | $410 → $525 |
| Base | $88k | $100k | $110k | $122k | $410 → $470 |
| Bear | $72k | $71k | $75k | $83k | $410 → $390 |

Key insight: theta ($68/day = $24,480/year) provides a positive return floor in all scenarios. Bear case ends positive over 12 months purely on theta accumulation. MSFT delta (~$400 P&L per $1 move) is the dominant variable.

---

## What Happened This Session (Jun 8 — evening)

### MCP tooling stack completed — all 5 confirmed live

Built and installed plugins for FRED and Massive, bringing the full tooling stack online.

**Root cause found (config file):** The `claude_desktop_config.json` in the Fortress folder is a reference copy only. Claude Desktop reads its real config from `C:\Users\cityc.000\AppData\Roaming\Claude\claude_desktop_config.json`, which only contains fortress-dashboard and quantdata. FMP, FRED, and Massive connect exclusively via the plugin system — no config file changes needed for those.

**Plugin fixes applied:**
- Both fred.plugin and massive.plugin rebuilt (v1.1.0) with corrected WSL invocation: `wsl -e /usr/bin/env KEY=value binary` — this embeds the API key directly in the command, bypassing the WSL env var passthrough issue that was preventing the servers from starting.
- fred.plugin additionally uses `/usr/bin/node` explicitly (the JS binary can't be exec'd directly without node in PATH).
- mcp_massive installed in WSL from GitHub: `uv tool install "mcp_massive @ git+https://github.com/massive-com/mcp_massive@v0.10.0"` — not on PyPI, must use git source.

**MCP stack — confirmed live:**

| Tool | Source | Status |
|---|---|---|
| fortress-dashboard | AppData config (Python stdio) + Plugin | ✅ |
| quantdata | AppData config (WSL stdio) | ✅ |
| fmp | Plugin (HTTP URL) | ✅ |
| fred | Plugin (WSL stdio via node) | ✅ — T10Y2Y +0.38% tested |
| massive | Plugin (WSL stdio) | ✅ — SPY $737.55 tested |

**API keys in use (treat as compromised — were shared in chat, regenerate when convenient):**
- FMP: `IlAAFEDrsofoV5epZgLeDknQcYQAMYBB`
- FRED: `cf61f7f52e710e816190e2ec317569d3`
- Massive: `GOrg0WHt1_XYppuHn2kpBpFBt0WVBZXh`

**WORKFLOW.md updated to v2.0** (earlier session): added MCP Tooling Stack table, FMP pre-entry step, FRED and Massive use cases, common issues rows.

---

## What Happened This Session (Jun 8 — day)

### OAuth test — still pending
Ran `test_ibkr_oauth.py`. Stage 1 (LST) works, Stage 2 still "Invalid signature". IBKR hasn't activated the consumer key yet.

### Portfolio check (live IBKR data)
NLV $78,125 (down ~$5.6k from Jun 4 — MSFT at $410, below 200-SMA). All positions safe, no roll triggers. 3 stop-loss ACT signals: MSFT, META, V (all below 200-SMA, no mechanical trigger). Full details in PORTFOLIO.md.

### Stale order queue cleared
3 Jun 4 roll orders (2× MSFT, 1× GOOGL) were stuck in `submitted` status. Force-declined via new `/api/orders/pending/{id}/force` endpoint. Queue is now clean.

### Parapet v1.9 shipped — commit `eb01391` + Jun 8 additions

**Reconnect button (new):**
- `InfraSection.tsx` — Reconnect button appears when IBKR is disconnected
- Calls `POST /api/ibkr/reconnect` → restarts cp-gateway → polls status every 3s (up to 60s) → auto-syncs on success
- Hidden when already connected

**Order lifecycle fixes (backend):**
- `DELETE /api/orders/pending/{id}/force` — force-cancel any order regardless of status
- `POST /api/orders/expire-stale` — bulk-expire all stale DAY `submitted` orders (call at EOD)
- Fixed `place_order()` in `ibkr_web/orders.py` — now loops through multiple IBKR confirmation rounds instead of getting stuck after one

### iBeam clarification
cp-gateway uses iBeam headless (Selenium-based auto-login). Auth mode `web_api`. OAuth (ibind) is a separate pending activation. The Reconnect button restarts cp-gateway and works correctly for iBeam.

---

## Account Snapshot (2026-06-08 ~16:00 UTC)

| | |
|---|---|
| Net Liq | **$78,125** |
| Available | $24,771 |
| Excess Liq | $29,626 |
| Portfolio Δ | +558 raw / +381.7 beta-weighted |
| Θ/day | +$68.0 |
| Vega | 517.1 |
| VIX | 18.34 |
| Regime | **Bearish** |
| Pacing | 0/5 this week |

### Unrealized P&L by ticker
| Ticker | P&L |
|---|---|
| MSFT | ~+$72,590 |
| AMZN | ~+$7,773 |
| GOOGL | ~+$9,937 |
| NVDA | ~+$6,825 |
| AMD | ~-$28 |
| V | ~-$315 |
| META | ~-$412 |
| OST | ~+$75 |

---

## Open Items / Sprint 11

- AAPL LEAP — entry after CPI (Jun 10) + PPI (Jun 12) — do NOT enter before both prints clear
- NVDA roll re-stage — when delta > 0.35
- MSFT de-risking plan — ongoing (no capital gains tax under Dutch Box 3, pace by market conditions)
- MSFT unhedged LEAPs — add covered call legs when conditions allow
- OAuth Stage 2 — still pending IBKR activation
- Unusual Whales trial — $50/week, evaluate if needed (GEX covered by yfinance, IV rank covered by QuantData)
- **Sprint 11** — complete (see above); Sprint 12 backlog TBD

---

## Parapet State

- **Current version:** v2.3 · Sprint 11 complete · pending deploy
- **Repo:** `citychip/fortress-parapet` (branch: `master`)
- **Live at:** `http://localhost:4000`

---

## System Status (2026-06-08)

- Backend `fortress-dashboard-v4`: running on WSL, port 8081
- IBKR CP Gateway `cp-gateway`: Docker, iBeam headless, authenticated
- OAuth Stage 1: working · Stage 2: pending IBKR activation
- QuantData: JWT configured at `~/.quantdata-mcp/config.json`
- MCP server: `C:\Users\cityc.000\fortress_mcp\fortress_mcp.py` (Windows)
- MCP write tools require `FORTRESS_MCP_ALLOW_WRITES=1` in Claude Desktop config

### Key commands
```bash
# Backend status
sudo systemctl status fortress-dashboard-v4
journalctl -u fortress-dashboard-v4 -n 50 --no-pager

# Restart backend
sudo systemctl restart fortress-dashboard-v4

# IBKR gateway
docker restart cp-gateway

# Parapet deploy
rsync -a "/mnt/c/Users/cityc.000/OneDrive/_Stocks26/2606Fortress/fortress-parapet/src/" \
      ~/fortress-parapet/src/ && bash ~/fortress-parapet/scripts/deploy.sh

# Parapet commit
cd ~/fortress-parapet
git add -A
git commit -m "feat: Parapet vX.X — description"
git push origin master

# Force-decline a stuck order
curl -s -X DELETE "http://localhost:8081/api/orders/pending/{ID}/force" \
  -H "Authorization: Bearer 07f03fb6e664859ac5e8113eaf1102ac43a3cb785c581af756671072b426db21"

# Expire all stale DAY orders (run at EOD)
curl -s -X POST "http://localhost:8081/api/orders/expire-stale" \
  -H "Authorization: Bearer 07f03fb6e664859ac5e8113eaf1102ac43a3cb785c581af756671072b426db21"
```

### GitHub PAT
Stored in WSL `~/.git-credentials` — do not paste in docs.
