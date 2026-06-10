# Parapet — Frontend Reference
**v2.4 · Updated 2026-06-10**

---

## What Parapet Is

Parapet is the lean display and approval layer for Fortress. Claude (via MCP) is the primary workflow engine. Parapet = passive monitoring + order approval + settings management. It does not replicate Claude's analytical capabilities.

**Stack:** React 18 · TypeScript · Vite · Wouter · pure CSS (no component library)  
**Port:** 4000 (nginx) · Source: `~/fortress-parapet/src/`  
**Repo:** `citychip/fortress-parapet` (branch: `master`)

---

## Pages (6-page nav, v2.0+)

| Key | Route | Label | Keyboard |
|---|---|---|---|
| `b` | `/` | Briefing | `b` |
| `t` | `/triage` | Triage | `t` |
| `c` | `/candidates` | Candidates | `c` |
| `m` | `/market` | Market | `m` |
| `p` | `/positions` | Positions | `p` |
| `s` | `/system` | System | `s` |

Keyboard shortcuts fire on any keypress outside an input/textarea/select. Handled in `Layout.tsx`.

---

## Page Structure (tabs)

### Briefing `/` — single scroll, no tabs

Full morning dashboard in one page. 30s background poll. Header `action` slot shows `⟳ Sync IBKR` button.

- **Header action:** `⟳ Sync IBKR` button — calls `triggerIbkrSync()`, shows `⟳ Syncing…` while in-flight, then refreshes briefing data
- **Stat bar:** NLV · Available · Excess Liq · Δ · Θ · Vega · VIX · Regime · Pacing
- **Banners:** limited mode, concentration warnings, priority actions
- **Market Intel section** (collapsible, localStorage-persisted): SPY/GEX, DP floors, SPY hedge, regime signals
- **Positions section** (collapsible, localStorage-persisted): full TickerSection cards (PMCC/PCS/IC/STR badges, Δ/Θ/Mkt Val, DTE, IVR pill, alert state)

### Triage `/triage` — ACT badge in sidebar

Roll check + stop-loss evaluation. 5-min background poll. Sidebar shows red ACT badge when actCount > 0.

- ACT stop-loss banner (when actCount > 0)
- **Active Alerts card** (when ACT/WATCH alerts exist): State · Ticker · Condition · Threshold · Message
- Roll summary chips + sortable roll table
- Stop-loss summary chips + table (ACT → WATCH → SAFE, sorted)

### Candidates `/candidates`

IV scan results. 5-min background poll.

- Sortable table: ticker · IVR bar · signal · gate (PROCEED/BLOCKED) · earnings state · capital efficiency · strategy recommendation · **Earn Move**
- Pretrade gate: PROCEED/BLOCKED derived from `getPretrade(ticker)`
- **Earn Move column:** implied move (`±X.X%` in accent color) + avg historical (`avg ±X.X%` in muted). Populated asynchronously via background `Promise.allSettled` after main load — table is usable immediately.

### Market `/market`

| Tab | Content |
|---|---|
| **Analytics** (default) | Per-ticker deep-dive (GEX & Skew chart + Recharts Vol Skew, or IV Ladder view via toggle; universe selector chip bar) **plus**, below a divider, "Universe Signals (QuantData)": connection status · tool capability grid · IV Rank board (load-on-demand) · known-issues callout · "Query via Claude" card |
| **Earnings Calendar** | Sortable ticker → next earnings → DTE → status → expected move / IV crush risk |
| **Universe** | Tier group management (add/remove/exclude tickers) |

> Sprint 12 (#77) merged the former separate "Analytics" and "QuantData" tabs into one "Analytics" tab — per-ticker chart on top, universe-wide IV Rank board below. Market is now a 3-tab page; in-page shortcuts are `1`–`3`.

### Positions `/positions`

Analytics for open positions. 5-min background poll.

| Tab | Content |
|---|---|
| **P&L** (default) | Unrealised P&L bar chart + total/return stats + realised history |
| **Exposure** | Sector notional table + beta-weighted delta by ticker |
| **Forward P&L** | SVG curve per ticker/expiry, IV crush toggle (1.0×/0.6×) |
| **Limits** | Per-ticker position limits: Spot · Max Profit · Max Loss · Net Premium + breakevens with % from spot |
| **Legs** | Sortable raw legs table with alert badge column + ticker filter input |
| **Trade Report** | Live `get_trade_report`: stop-loss alerts · exit candidates · entry candidates ranked by IV rank |

### System `/system`

| Tab | Content |
|---|---|
| **Strategy** | Strategy doc (Claude-managed, display only) |
| **Settings** | Sub-tabs: **Connections** (IBKR gateway + sync + OAuth + ping tests) · **Config** (editable settings forms) |
| **Scripts** | Grouped scripts (Morning/Intraday/Evening/Other) + stdout panel |
| **Alerts** | Active alerts list with delete · Add Alert form (ticker / condition / threshold) |
| **Journal** | Reverse-chronological trade notes · textarea + Post button (⌘↵ shortcut) |

---

## Sidebar Badges

| Nav item | Badge | Poll interval | Source |
|---|---|---|---|
| Triage | 🔴 Red — ACT count | 5 min | `getStopLossAll()` → `summary.act + summary.act_immediately` |
| System | 🟡 Amber — pending orders | 2 min | `getPendingOrders()` → `orders.length + pending.length` |

---

## Component Map

```
src/
├── App.tsx                    Routes (6 pages + legacy /orders)
├── main.tsx                   Entry point + ErrorBoundary
├── lib/api.ts                 All API calls + types + 30s GET cache
├── styles/global.css          CSS custom properties, base styles
├── components/
│   ├── Layout.tsx             Page shell (sidebar + header + refresh + keyboard shortcuts + action slot)
│   ├── Sidebar.tsx            6-item nav with dual badge system (ACT red + orders amber)
│   ├── Card.tsx               Surface container
│   ├── StatRow.tsx            Horizontal stat tiles
│   ├── Tabs.tsx               TabBar component
│   ├── Sortable.tsx           useSortable hook + SortTh
│   ├── Spinner.tsx            Loading indicator
│   ├── ErrorBanner.tsx        Error display with retry
│   ├── ErrorBoundary.tsx      React render error containment
│   └── system/
│       ├── StrategyTab.tsx    Strategy display (CLAUDE_ONLY_SECTIONS enforced)
│       ├── AlertsSection.tsx  Alert CRUD (now wired into System > Alerts tab)
│       ├── InfraSection.tsx   IBKR status + sync + OAuth detail
│       ├── ScriptsSection.tsx Grouped scripts + stdout panel
│       ├── ConnectionsSection.tsx Ping tests + QuantData capabilities panel
│       └── UniverseSection.tsx    Tier groups, remove/exclude/restore
└── pages/
    ├── BriefingPage.tsx       Single-scroll: stat bar + market intel + positions (collapsible) + Sync IBKR button
    ├── Layout.tsx             Page shell — narrow viewport: hamburger + sidebar overlay (useNarrow hook, bp=900px)
    ├── TriagePage.tsx         Roll check + stop-loss triage with ACT banner
    ├── CandidatesPage.tsx     IV scan + gate badges + strategy column + Earn Move column
    ├── MarketPage.tsx         Analytics (per-ticker GEX/Skew/Ladder + Universe Signals/QuantData) + Earnings Calendar + Universe
    ├── PositionsPage.tsx      P&L + Exposure + Forward P&L + Limits + Legs + Trade Report
    ├── SystemPage.tsx         Strategy + Settings + Scripts + Alerts + Journal
    └── OrdersPage.tsx         (legacy route /orders — still accessible)
```

---

## API Layer (`src/lib/api.ts`)

**Module-level GET cache:** 30-second TTL. Write operations (POST/DELETE/PATCH) invalidate the full cache.

**Core types:** `BriefingData` · `IbkrStatusData` · `PositionData` · `PnLData` · `OrderData` · `AlertData` · `CandidateRow` · `IvRankData` · `ForwardPnlData`

**Key endpoints:**

| Function | Endpoint |
|---|---|
| `getBriefing()` | `GET /api/briefing` |
| `getPositions()` | `GET /api/positions` |
| `getCandidates()` | `GET /api/candidates` |
| `getIvRank(ticker)` | `GET /api/qd/iv-rank/{ticker}` |
| `getPendingOrders()` | `GET /api/orders/pending` |
| `approveOrder(id)` | `POST /api/orders/pending/{id}/approve` |
| `getSettings()` | `GET /api/settings` |
| `getForwardPnl(...)` | `GET /api/options/forward-pnl` |
| `getPositionLimits(ticker, legs)` | `GET /api/options/position-limits?ticker=&legs=` |
| `getJournal()` | `GET /api/journal` |
| `addJournalEntry(body)` | `POST /api/journal` |
| `getAlerts()` | `GET /api/alerts` |
| `addAlert(body)` | `POST /api/alerts` |
| `deleteAlert(id)` | `DELETE /api/alerts/{id}` |
| `getUniverse()` | `GET /api/universe` |
| `getSpyHedge()` | `GET /api/manage/spy_hedge_coverage` |
| `getDpFloorsGex(ticker)` | `GET /api/chart/{ticker}/levels` |
| `getRollAll()` | `GET /api/manage/roll_all` |
| `getStopLossAll()` | `GET /api/manage/stop_loss_all` |
| `getGex(ticker)` | `GET /api/options/gex/{ticker}` |
| `getVolSkew(ticker)` | `GET /api/options/vol-skew/{ticker}` |
| `getVolAnalytics(ticker)` | `GET /api/options/vol-analytics?ticker={ticker}` |
| `getTradeReport()` | `GET /api/manage/trade_report` |
| `getEarningsVolatility(ticker)` | `GET /api/market/earnings-volatility/{ticker}` |
| `getMarketIntel()` | `GET /api/market-intelligence` |
| `getPcsExposure()` | `GET /api/portfolio/pcs-exposure` |
| `triggerIbkrSync()` | `POST /api/ibkr/sync` |

---

## Auto-Refresh Intervals

| Page / component | Interval | Notes |
|---|---|---|
| Briefing | 30s | Silent background poll |
| Triage | 5 min | Silent |
| Candidates | 5 min | Silent |
| Market | 5 min | Silent |
| Positions | 5 min | Silent |
| Sidebar IBKR dot | 30s | Independent poll |
| Sidebar ACT badge | 5 min | `getStopLossAll()` |
| Sidebar orders badge | 2 min | `getPendingOrders()` |
| Market Vol Analytics | On demand | Load on ticker select |
| Positions Trade Report | On demand | Loads on tab activate |
| Positions Limits | On demand | Loads on ticker select |
| Alerts | On demand | Loads on tab activate |
| Journal | On demand | Loads on tab activate |
| Candidates Earn Move | Background | `Promise.allSettled` after main load |

---

## Positions Rendering (BriefingPage + PositionsPage)

`groupTickerLegs()` groups raw legs client-side:

1. **IC** — short call + long call (above) + short put + long put (below)
2. **PMCC** — long LEAP call (DTE > 90) + short call (higher strike)
3. **BPS** — short put + long put (lower strike)
4. **STR** — short call + short put (same expiry)
5. **LEG** — unpaired remainder

`augmentLeg()` / `parseLocalSymbol()` parses expiry/strike/right from IBKR `local_symbol` when the backend leaves them null.

---

## Collapsible Briefing Sections

State persisted to `localStorage` under key `'briefing_collapsed'` as `{ intel: boolean, positions: boolean }`.

`SectionHeader` component: chevron button (▼ rotates -90° when collapsed) + uppercase label + optional extra string. Conditional rendering (not CSS display toggle) to avoid React key conflicts.

---

## P&L Computation

Client-side in `PositionsPage.tsx` → `PnlTab`:
- Short leg: `pnl = costBasis + marketValue`
- Long leg: `pnl = marketValue - costBasis`
- `costBasis = avg_cost × |qty|`

---

## Sprint Log

### v2.4 — 2026-06-10 (current)
Sprint 12 — fixes + Market consolidation:
- **#73 QuantData IV Rank table**: documented upstream `iv_rank` bug (identical values per ticker when `expiration_date` passed) as a "Known issue" callout — not fixable in Parapet
- **#74 Exposure tab β-wtd delta vs target**: fixed units mismatch — target changed from 0.35 (per-position option-delta) to 320 (portfolio β-wtd delta, matches System > Strategy "β-wtd target")
- **#75 Vol Skew chart x-axis**: switched to `type="number"` with `domain={['dataMin','dataMax']}` + `tickCount={8}` (was crushed one-tick-per-point); added `connectNulls` to bridge put/call gap near spot
- **#76 Journal/Scripts timestamps**: new `fmtDateTime()` helper (`YYYY-MM-DD HH:MM:SS`) replaces locale-dependent `toLocaleString()` — `api.ts`, `SystemPage.tsx`, `components/system/ScriptsSection.tsx`
- **#77 Market tab merge**: folded "QuantData" tab into "Analytics" as a "Universe Signals (QuantData)" section below the per-ticker view; Market is now 3 tabs (Analytics, Earnings Calendar, Universe)
- Added `src/components/system/ScriptsSection.tsx` to `deploy_parapet.sh` FILES array (was missing)

### v2.3 — 2026-06-09
Sprint 7 — UX polish:
- **#46 Legs tab filter** in Positions: ticker substring filter input, shows N of M count, ✕ Clear button
- **#47 Mobile sidebar** in Layout: `useNarrow(900)` hook, hamburger button, fixed-overlay sidebar with slide transition, backdrop closes on click, auto-closes on navigation
- **#48 Active alerts on Triage**: `getAlerts()` fetched in parallel with roll/stop-loss; ACT+WATCH alerts shown in table card between ACT banner and Roll Check

### v2.2 — 2026-06-09
Sprint 6 — portfolio depth + Alerts CRUD:
- **#42 IBKR sync button** on Briefing header: `⟳ Sync IBKR` → `triggerIbkrSync()` + silent refresh
- **#43 Position Limits tab** in Positions: ticker chip selector, KV cards (Spot/Max Profit/Max Loss/Net Premium), breakevens with % from spot; `api.ts`: added `getPositionLimits(ticker, legs)` → `/api/options/position-limits`
- **#44 Alerts tab** in System: wires existing `AlertsSection` component as lazy-loaded tab; add/delete handlers; tab order: Strategy · Settings · Scripts · **Alerts** · Journal
- **#45 Earnings volatility column** on Candidates: `Earn Move` column with implied (`±X.X%`) + avg historical (`avg ±X.X%`); background `Promise.allSettled` fetch, non-blocking; `api.ts`: added `getEarningsVolatility(ticker)` → `/api/market/earnings-volatility/{ticker}`

### v2.1 — 2026-06-09
Sprint 5 — data coverage:
- **#39 Journal tab** in System page: reverse-chronological entry list + textarea + Post button (⌘↵)
- **#40 Vol Analytics tab** in Market page: ticker selector, ATM IV ladder table, term slope chip, full put/call skew SVG
- **#41 Trade Report tab** in Positions page: macro/regime header, stop-loss alerts table, exit candidates, entry candidates ranked by IV rank
- `api.ts`: added `getVolAnalytics()` → `/api/options/vol-analytics?ticker=` and `getTradeReport()` → `/api/manage/trade_report`
- `deploy_parapet.sh`: added `SystemPage.tsx` to FILES array

### v2.0 — 2026-06-09
Sprint 3 nav restructure + Sprint 4 polish:

**Nav restructure:**
- 6-page sidebar replaces tab-heavy Overview/Portfolio/Orders layout
- `BriefingPage.tsx` — single scroll, absorbs Overview stat bar + market intel + positions
- `TriagePage.tsx` — standalone page promoted from Portfolio tab; ACT badge in sidebar
- `PositionsPage.tsx` — Portfolio renamed Positions, Triage tab removed
- `MarketPage.tsx` — Market Intel tab removed, Universe tab added
- `OrdersPage.tsx` — legacy route `/orders` preserved but removed from sidebar
- `Sidebar.tsx` — dual badge system: red ACT (Triage) + amber orders count (System)
- `App.tsx` — updated routes

**Sprint 4:**
- `#36` Pending orders amber badge on System nav item (2-min poll)
- `#37` Collapsible Market Intel + Positions sections on Briefing (localStorage-persisted)
- `#38` Keyboard shortcuts: `b/t/c/m/p/s` across all pages (Layout.tsx keydown listener)

### v1.9.1 — 2026-06-08
- Fix: `getSpyHedge` and `getDpFloorsGex` URL paths corrected in `api.ts`

### v1.9 — 2026-06-08
- IBKR reconnect button in `InfraSection.tsx` with live polling

### v1.8 — 2026-06-03
Sprint 2:
- Major page restructure (Overview/Portfolio/Orders/System)
- IVR pill per active position
- Entry gate badge on Market tab
- Vega added to stat bar

### v1.7 — 2026-06-03
- Forward P&L tab with SVG curve + IV crush toggle
- `augmentLeg()` / `parseLocalSymbol()`

### v1.6 — 2026-06-03
- Candidates page: IV scan, gate badges, sortable
- System → Settings live connection tests, scripts panel, Universe management

### v1.4 — 2026-06-03
- Candidates page with IVR bar + gate badges
- Portfolio P&L client-side computation

### v1.1–v1.3 — 2026-06-02
- Parapet v1 baseline, auto-refresh, API GET cache, ErrorBoundary

---

## Design Principles

1. **No component library.** CSS custom properties only.
2. **Three dependencies: react, react-dom, wouter.**
3. **Claude is the brain.** Parapet displays; Claude decides.
4. **500ms builds.** Complexity that extends build time is complexity that slows iteration.
5. **Lazy-load secondary tabs.** Journal, Trade Report, Vol Analytics, Alerts, Limits load on first click.
6. **Responsive.** Sidebar overlays on viewports < 900px; no horizontal scroll on page content.

## What NOT to build in Parapet

Superseded by Claude MCP:
- Trade Builder, Scenario Planner, Persona Editor, Strategy Sandbox, AI Chat Box
- Morning Brief workflow page, Conditional Alerts system, Full charting/analysis page

**`CLAUDE_ONLY_SECTIONS` is a feature, not a bug.**
Strategy parameters (delta targets, profit targets, roll rules) are locked from direct UI editing. Parapet displays; Claude edits via MCP with explicit confirmation.
