# Phase 7: Online 13F Platform - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

## Phase Boundary

Transform Abrams13F from a locally-hosted personal tool into a public-facing web application with a pre-loaded database of all SEC 13F filers (>$100M AUM) and an explore/screener experience. The goal is speed and instant data access on par with aum13f.com and dataroma.com.

This is a new milestone (v3.0) that replaces the previous v2.0 Phases 5-6 (Cloud Infrastructure and Multi-User Auth). The v2.0 milestone is closed out — remaining items (data accuracy fix, tech debt, tests, performance) are deferred or absorbed into this work.

## Implementation Decisions

### Fund Universe & Data Pipeline
- **Source:** SEC EDGAR directly — no third-party APIs needed
- **Bulk ingestion:** Use SEC's official quarterly 13F data sets (ZIP files from sec.gov/data-research/sec-markets-data/form-13f-data-sets)
  - Pre-flattened CSVs extracted from XML filings, available since 2013
  - One ZIP per quarter containing ALL 13F filers
  - ~48 ZIPs for initial historical load (2013–present)
- **Scope:** All filers with >$100M AUM (~5,000-8,000 funds). Start with top 100 curated funds for MVP, then scale to full universe
- **Ongoing updates:** After each quarterly SEC filing deadline, download the new data set
- **Between quarters:** Monitor EDGAR full-text search for amendments (13F-HR/A)
- **Existing orchestrator:** Current `SECClient` + `Orchestrator` handles one-at-a-time CIK lookups — this will be supplemented (not replaced) with the bulk ingestion pipeline

### Navigation & Discovery Experience
- **Explore page** (`/explore`): Full-width, browsable, filterable table of ALL funds in the database
  - Search bar at top with instant typeahead (fund name, manager name, or ticker held)
  - Filter bar with pill-style toggles: Fund Type, AUM Range, Last Filing, Concentration
  - Results table with sortable columns: Fund Name | AUM | # Holdings | Top Holding | QoQ Change | Last Filed
  - Clicking a fund → navigates to existing fund detail view (`/fund/{cik}/summary`)
- **Stock Screener** (`/explore/stocks`): Reverse lookup — "who holds this stock?"
  - Search for ticker → table of funds holding it with: Fund Name | Shares | Value | % of Portfolio | Change | Quarter
  - Filters: Min AUM, Min Position Size, Only New Positions, Only Exits
- **Navigation restructure:**
  - Header: `[Logo] [My Portfolio] [Explore] [About]`
  - Current GlobalDashboard becomes "My Portfolio" (personal watchlist)
  - Explore is the new discovery layer

### Fund Detail Pages
- **Decision:** Keep current design exactly as-is
- Pages: Summary, Holdings Table, Portfolio Chart, Activity View, Mimic Performance
- No UI redesign needed — existing dark theme with blue accents, sidebar navigation

### Performance & Pre-computation
- **Decision:** Full pre-computation engine (Option A)
- **Summary Engine** runs immediately after data ingestion:
  - Pre-compute trade activity labels (NEW, EXIT, ↑ Bought, ↓ Sold) for each quarter
  - Pre-compute total AUM, concentration scores, sector allocation
  - Pre-compute QoQ deltas for the Explore page
  - Store results in summary/aggregate tables in the database
- **Target:** Explore page and Fund detail pages load in <100ms
- **Trade-off accepted:** Larger database size and longer sync time in exchange for instant page loads

### Claude's Discretion
- Explore page visual design (layout, styling, micro-interactions) — should match existing dark theme aesthetic
- Stock screener filter UX details
- Database schema for summary/aggregate tables
- Caching strategy for API responses
- Deployment platform choice (Railway, Render, Vercel, etc.)

## Specific Ideas

- User referenced **aum13f.com** and **dataroma.com** as benchmarks for speed and instant feel
- User referenced **whalewisdom.com** as a feature-rich example (screener, heatmap, backtester) but scope for this phase is simpler
- The "My Portfolio" concept preserves the personal tracking workflow the user already has

## Deferred Ideas

- **Backtester** (like WhaleWisdom) — future phase
- **Heat Map** visualization — future phase
- **Combined Holdings** across multiple funds — future phase
- **Developer API** — future phase
- **Premium/paid tier** — future phase
- **Authentication/multi-user accounts** — future phase (originally v2.0 Phase 6)
- **Mobile-responsive design** — future phase

---

*Phase: 07-online-platform*
*Context gathered: 2026-02-17*
