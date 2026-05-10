# STATE.md — Project State

> Last updated: 2026-05-10 19:46

## Current Phase: Phase 6: Update Sidebar And Folder Logic
**Status**: 🟢 In Progress

### Project Health
- **Database**: Supabase (Production) - ✅ Stable (2.8M prices, 123K holdings)
- **Background Engine**: `worker.py` - ✅ Ready (Infrastructure for entire universe is built)
- **Data Universe**: Curated "Whale" list (~34 funds) - 🟡 Bulk Ingestion Deferred

## Completed This Session

### Phase 1: Separate Platform Data From User Data ✅
- Created `users`, `user_tracked_funds`, `user_fund_groups`, `user_fund_group_members` tables
- Removed global `funds.is_tracked` column from schema
- Updated all queries in `database.py`, `orchestrator.py`, and `main.py` to use user-scoped tables
- Migration logic auto-creates default user (id=1) and copies legacy tracked data
- Frontend contract preserved: `is_tracked` computed dynamically per-user

### Phase 2: Move Fully To Postgres (Supabase) ✅
- Supabase Postgres pooler connected and verified
- Alembic migration system initialized with initial cloud schema migration
- Performance indexes added for user-scoped queries
- Legacy `fund_groups` data migrated to `user_fund_groups` (3 groups, 21 members)
- Full smoke test passed: get_funds, get_groups, fund_info, dashboard_summary all working

### Phase 5 & 8: Authentication & UI Stabilization ✅
- Implemented `fetchWithAuth` shared utility for Supabase token injection
- Secured all 15+ UI components (Dashboard, Explorer, Search, etc.) with Bearer tokens
- Resolved "Blank Screen" crash by adding defensive array guards to all `.map()` calls
- Fixed application boot sequence: `authLoading` -> `SplashScreen` -> `Login` or `Dashboard`
- Standardized error boundaries to prevent malformed API responses from breaking the UI

### Phase 5 & 7: Search & Explorer User-Scoping ✅
- Refactored `search_all` and `search_explorer` to be user-scoped and return tracking status
- Implemented CIK normalization in `InstitutionalExplorer` to fix tracking toggle bugs
- Added visual feedback (updating states) to tracking buttons in the UI
- Ensured JIT user creation in auth layer to maintain database integrity

## Next Steps

1. **Phase 3:** Build a background SEC ingestion pipeline (independent of user actions)
2. **Phase 3:** Pre-calculate `fund_quarterly_stats` automatically after ingestion
3. **Phase 4:** Decouple "Track Fund" from SEC downloads — tracking = bookmark only
4. **Phase 5:** Scope Global Overview to current user's tracked funds

## Key Files for Context Restoration

- `backend/services/database.py` — Core data layer with user-scoped schema
- `backend/services/orchestrator.py` — SEC fund sync engine (is_tracked removed)
- `backend/main.py` — API endpoints (track/untrack use user_tracked_funds)
- `backend/migrations/` — Alembic migration infrastructure
- `.gsd/ROADMAP.md` — v4.0 cloud transition phases
