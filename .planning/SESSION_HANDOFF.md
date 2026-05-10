# Session Handoff — Cloud Architecture (Supabase)

> **Date:** 2026-05-10
> **Status:** 🟡 MIGRATING TO SUPABASE

## 🎯 What was achieved
We completely refactored the Abrams13F project to utilize a cloud-first, multi-tenant database schema hosted on **Supabase**. We originally started with Neon, but pivoted to Supabase to leverage its robust session pooler (`aws-1` endpoint) and built-in features.

### 1. Schema Refactor (Phase 1)
- Separated global canonical data (`funds`, `filings`, `holdings`) from user-scoped data.
- Created `user_tracked_funds`, `user_fund_groups`, and `user_fund_group_members`.
- Removed global `is_tracked` columns.

### 2. Cloud Migration (Phase 2)
- Initialized Alembic for schema migrations.
- Established connection to Supabase via Session Pooler (port 6543, `aws-1-us-east-1` host).
- Created a background streaming script (`scratch/migrate_neon_to_supabase.py`) to safely transfer all data from the previous database into Supabase.

## 📌 Next Steps
- **Phase 3 Infrastructure**: `worker.py` is ready for automated syncs.
- **Decision**: Deferred the "Entire Universe" bulk ingestion to avoid database bloat until Phase 4 (Tracking Logic) is verified.
- **Current Action**: Start **Phase 4: Change Tracking Semantics** to update the tracking API to use the `user_tracked_funds` table.

## 🔑 Key Files
- `backend/services/database.py` — Now utilizes PostgreSQL `ThreadedConnectionPool`.
- `backend/.env` & `.env` — Contains Supabase pooler credentials.
- `.gsd/ROADMAP.md` — Contains the definitive task list.
