# STATE.md — Project State

> Last updated: 2026-03-22

## Current Position

**Milestone:** v3.0 — Online 13F Platform
**Phase:** 8 (Explore & Screener)
**Status:** 🟡 In Progress — Institutional Explorer UI implemented, Whale Ingestor implemented, Search API active.

## Last Session Summary

### Institutional Explorer & Fund Separation
- **Fund Tracking Separation:** Implemented `is_tracked` column to separate user-selected funds from the "Whale Index" universe.
- **Clean Dashboard:** Refactored `/api/funds` to only return tracked funds for the sidebar and global overview.
- **Track/Download Action:** Added "Track Fund" button in Institutional Explorer to move funds from the indexed universe into the personal dashboard.
- **Whale Ingestor:** Finalized bulk sync of top 2,000 funds while keeping them in the "indexed-only" state by default.

## Next Steps

1. **Verify Dashboard Load:** Resolve "failed to load dashboard" error (likely backend connection issue).
2. **Reverse Lookup:** Implement Stock Screener (`/explore/stocks`) to find which funds hold a specific ticker.
3. **PostgreSQL Migration:** Migrate from SQLite to PostgreSQL for production scalability.

## Key Files for Context Restoration

- `.planning/phases/07-online-platform/07-CONTEXT.md` — all decisions from discussion
- `.gsd/ROADMAP.md` — v3.0 phases overview
- `.gsd/JOURNAL.md` — session history
