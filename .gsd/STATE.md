# STATE.md — Project State

> Last updated: 2026-04-30

## Current Position

**Milestone:** v3.0 — Online 13F Platform
**Phase:** Maintenance & Stability
**Status**: 🟢 Charting Stabilized — Resolved price API crashes and restored premium Institutional Explorer UI.

## Last Session Summary

### Discovery Explorer Unification & UX Overhaul
- **Unified Hub:** Merged the Stock Screener and Institutional Explorer into a single "Discovery Explorer" with a high-fidelity tab switcher.
- **Stock Consensus:** Implemented "Stock Consensus" tab showing most popular whale holdings by fund count and aggregate value.
- **Advanced Query Builder:** Refactored fund screener to support row-level AND/OR logic and smart contextual inputs (e.g., sector dropdowns).
- **Fund Tracking Fix:** Implemented `is_tracked` separation to prevent Whale Index syncs from polluting the personal dashboard.
- **Premium UI:** Applied glassmorphism, dark-mode readable dropdowns, and high-fidelity focus glows to all screener inputs.
- **Whale Ingestion:** Started background sync for Top 100 hedge funds to expand the discovery universe.

## Next Steps

1. **Who Holds This? Details:** Implement a modal in the Stock Consensus view to show specific holders for a selected ticker.
2. **PostgreSQL Migration:** Move from SQLite to PostgreSQL to handle the expanding fund universe (Phase 7 tail-end).
3. **Containerization:** Create Dockerfile for backend and frontend serving (Phase 9 initialization).

## Key Files for Context Restoration

- `.planning/phases/07-online-platform/07-CONTEXT.md` — all decisions from discussion
- `.gsd/ROADMAP.md` — v3.0 phases overview
- `.gsd/JOURNAL.md` — session history
