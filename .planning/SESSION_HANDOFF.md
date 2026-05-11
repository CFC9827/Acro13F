# Session Handoff: Abrams13F Cloud Transition

## Current Status
- **Phase 9 (Cloud Deployment Architecture)**: ✅ COMPLETE.
  - Backend hardened (CORS, Env Vars).
  - Frontend production-ready (VITE_API_URL).
  - Dockerized (Dockerfile & docker-compose).
  - Deployment guide created (DEPLOY.md).
- **Phase 10 (Migration Path)**: 🟡 PLANNED.
  - Implementation plan created and awaiting user approval.
  - Goal: Migrate local SQLite to Supabase Postgres.

## Critical Technical Context
- **CORS**: `main.py` now expects `FRONTEND_URL` and `ENV=production` for lockdown.
- **Frontend**: All API calls use `fetchWithAuth` from `utils/api.ts` which handles the base URL.
- **Migration**: `migrate_to_postgres.py` needs a refactor to handle the new user-scoped tables before execution.
- **SQLite Schema**: `users` and `user_tracked_funds` use UUID strings. `user_fund_groups` and `user_fund_group_members` are currently empty but have schema defined.

## Immediate Next Steps
1. Get approval for [Phase 10 Plan](file:///C:/Users/abram/.gemini/antigravity/brain/109f8a7b-d1a9-4e88-ab66-e118576c078d/implementation_plan.md).
2. Refactor `migrate_to_postgres.py` to include all multi-tenant tables.
3. Run migration and verify row parity using a new `verify_cloud_data.py`.

## Key Files
- `backend/main.py`: Production config logic.
- `ui/src/utils/api.ts`: API base URL logic.
- `DEPLOY.md`: The cloud deployment recipe.
- `migrate_to_postgres.py`: The upcoming migration engine.
