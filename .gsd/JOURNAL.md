# JOURNAL.md — Development Journal

> Session summaries and notable events.

---

## 2026-01-22 — Project Initialization

**Session Goal:** Initialize GSD methodology for existing codebase

**Accomplished:**
- Ran `/map` to analyze existing codebase
- Created ARCHITECTURE.md and STACK.md
- Ran `/new-project` for deep questioning
- Created SPEC.md with production readiness goals
- Created ROADMAP.md with 6 phases

**Key Decisions:**
- Prioritizing data accuracy fix (Giverny bug) first
- All technical debt items in scope
- Target: cloud-ready with PostgreSQL and multi-user support


---

## 2026-01-24 — Push Initialization

**Session Goal:** Push initialization changes to remote repository

**Accomplished:**
- Staged `.agent`, `.gemini`, and `list_routes.py`
- Finalized first state of GSD methodology files
- Pushed all local commits to origin/main

## 2026-02-17 — Activity, Holdings & SEC Stability

**Session Goal:** Verify Egerton data accuracy, implement UI enhancements, and resolve SEC 403 errors.

**Accomplished:**
- **Fixed SEC 403 Forbidden error:** Enabled `.env` loading in `main.py` and implemented a mandatory 100ms rate-limiting delay in `SECClient`.
- Confirmed Egerton Capital's Q3 2025 data (24 holdings) is 100% accurate against SEC sources.
- Implemented **Granular Activity Filters** (Buy, Add, Reduce, Sell) in a dropdown menu.
- Implemented **Rows Per Page Selector** for the Holdings table (25, 50, 100, All).
- Updated GSD state files (`STATE.md`, `JOURNAL.md`).

**Key Decisions:**
- Hardcoded a 100ms delay in the low-level `SECClient` to guarantee compliance with SEC guidelines across all service layers.
- Forced `.env` loading at the very entry point of the backend to prevent configuration gaps.


---

## 2026-02-17 — v3.0 Online 13F Platform (Milestone Discussion)

**Session Goal:** Define the vision and scope for transforming Abrams13F into a public web app.

**Accomplished:**
- Closed out v2.0 milestone (remaining items deferred/absorbed)
- Researched competitor platforms (aum13f.com, dataroma.com, whalewisdom.com)
- Discussed all 4 gray areas: Data Pipeline, Navigation/Explore, Fund Detail, Pre-computation
- Created `07-CONTEXT.md` with all decisions
- Resolved 1000x scaling mismatch in Portfolio Composition chart (514 rows migrated across BlueSpruce, Third Point, BAUPOST, etc.)
- Updated `parser.py` to correctly multiply SEC value tag (thousands) by 1000 for standard dollar storage
- Fixed Coverage Range text to auto-update immediately after fund refresh without page reload
- Rewrote `ROADMAP.md` with v3.0 Phases 7-10

**Key Decisions:**
- SEC EDGAR quarterly bulk data sets for ingestion (not one-at-a-time CIK calls)
- All filers >$100M AUM (~5,000-8,000 funds), starting with top 100
- Explore page + Stock Screener as new discovery layer
- Fund detail pages kept as-is
- Full pre-computation engine for instant page loads (<100ms target)
- PostgreSQL migration required for scale

---

## 2026-03-22 — Discovery Hub & Premium UI Overhaul

**Session Goal:** Unify fund and stock discovery into a professional "Institutional Hub" and resolve data pollution.

**Accomplished:**
- **Unified Discovery Explorer:** Created a single destination at `/explorer` with a high-fidelity tab switcher for Institutions vs. Stock Consensus.
- **Stock Consensus (Reverse Lookup):** Built a ranking engine to show the most popular stocks across the institutional universe, including aggregate value and average weights.
- **Advanced Query Engine:** Refactored the fund screener to support row-level AND/OR logic and smart contextual inputs (dropdowns for sectors, formatted numeric units).
- **Fund Tracking Separation:** Implemented `is_tracked` field in database to keep the "Whale Index" (Top 2,000 funds) separate from the user's personal dashboard.
- **Premium UX Overhaul:** Applied a high-end dark theme with glassmorphism, readable dropdown menus, and interactive focus states for all screener parameters.
- **Whale Ingestion Expansion:** Started background sync for Top 100 hedge funds to populate the new discovery universe.

**Key Decisions:**
- Merged separate screener pages into one unified Hub to reduce navigation friction and simplify the sidebar.
- Defaulted all Whale Index syncs to `is_tracked=0` to ensure the personal dashboard remains clean unless a fund is explicitly "followed".
- Used native dropdowns with explicit dark-mode styling to fix browser-default white backgrounds that made text illegible.

