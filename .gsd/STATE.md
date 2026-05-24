# STATE.md - Project State

> Last updated: 2026-05-24

## Current State
- **Current Phase**: Phase 11: Production Polish & Scalability
- **Status**: Neon-backed UAT in progress
- **Last Milestone**: Cloud Data Migration Complete (Phase 10)
- **Database**: Neon Postgres 17.8 - stable slim migration (29 funds, 911 filings, 823 quarterly stats, 78,577 holdings)
- **Background Engine**: `worker.py` - ready (infrastructure for broader SEC universe is built)
- **Data Universe**: Curated whale list - bulk ingestion deferred
- **Multi-Tenancy**: Complete (user data is isolated through user-scoped tables)
- **UI Consistency**: Complete (manual SEC triggers removed from the frontend; background-sync model adopted)

## Completed Recently

### Phase 6: Update Sidebar and Folder Logic
- Hardened group management endpoints with user ownership checks.
- Refactored Sidebar to support collapsible folders and nested fund lists.
- Implemented drag-and-drop for folder organization and removal.

### Phase 7: Update The UI Behavior
- Removed manual "Refresh Data" / "Add Fund" buttons in `App.tsx`.
- Updated empty states in `FundSummary` and `PortfolioChart`.
- Purged dead sync code and handlers from the frontend.
- Verified UI consistency with background-sync-only architecture.

### Phase 9: Cloud Deployment Architecture
- Hardened backend CORS and configuration for production.
- Containerized application with Docker API and Worker.
- Prepared frontend for production API URLs via environment variables.
- Created `DEPLOY.md`.

### Phase 10: Cloud Data Migration
- Migrated the primary Postgres target from Supabase to Neon after Supabase Free entered read-only mode.
- Ran `migrate_to_postgres.py` against Neon Postgres 17.8.
- Verified row-count parity for the slim migration:
  - `funds`: 29
  - `filings`: 911
  - `sync_status`: 42
  - `fund_quarterly_stats`: 823
  - `users`: 1
  - `user_tracked_funds`: 29
  - `holdings`: 78,577
- `prices` remains intentionally unmigrated pending the long-term price-history storage strategy.

### Phase 11: Price-Heavy View Stabilization
- Confirmed local SQLite has 7,909,152 `prices` rows across 3,335 tickers.
- Attempted full Neon `prices` migration; Neon hit its current 512 MB project limit after ~3.1M rows, so full price storage in the current Neon tier is not viable.
- Cleared the partial Neon price load to restore database write health.
- Changed `mimic-performance` to avoid synchronous Yahoo backfills during requests. It now uses cached DB prices when present and falls back to filing-implied prices for missing symbols.
- Live `/api/funds/0001358706/mimic-performance` now returns 200 in ~4.6 seconds instead of timing out.
- Disabled scheduled worker price backfills by default. Full Yahoo price sync now requires `ENABLE_PRICE_SYNC=1`.
- Added Postgres pooled-connection retry/discard handling after UAT exposed a transient Neon connection abort on first request.
- Completed a Neon-backed API smoke sweep: config, funds, dashboard summary/performance, fund info, holdings, history, filing range, sector attribution, mimic performance, favorites, AAPL holders, and explorer search all returned 200.
- Verification: backend tests pass (`11 passed`), frontend production build passes with the existing bundle-size warning.
- Recorded ADR-001: Neon is the single canonical source of truth for app state and canonical SEC data. Supabase is optional auth only; SQLite/object storage/Parquet are not app-state truth.
- Completed frontend/browser UAT against the Neon-backed API. Dashboard, fund summary, holdings, activity, mimic, and explorer routes all render required content with no console errors or failed requests.
- Fixed UAT issues:
  - `GlobalDashboard` performance comparison now reads `session` from `useAuth`.
  - `HoldingsTable` no longer imports the Lucide `Map` icon as `Map`, which had shadowed JavaScript's built-in `Map`.
  - `ActivityView` period groups now use keyed fragments.
- Reduced dashboard/fund-detail background fan-out. `GlobalDashboard` no longer fetches every highlighted fund history during initial dashboard render; Swoop Opportunities are now loaded on demand, capped to the top 6 highlighted funds, and fetched in parallel.
- Browser measurement after optimization: dashboard initial render used 0 `/history` requests and loaded required content in ~7.3s with no console errors; direct fund summary used only the selected fund's history request.
- Recorded ADR-002: full historical prices live in a Parquet warehouse outside Neon; Neon `prices` remains a hot cache and derived app-facing metrics are promoted back into Neon.
- Added `docs/superpowers/plans/2026-05-17-price-warehouse.md` with the implementation plan for `PriceWarehouse`, export scripts, sync guards, and derived metric helpers.
- Implemented the first local Parquet price warehouse layer:
  - `backend/services/price_warehouse.py` writes and reads per-ticker Parquet files with DuckDB.
  - `backend/scripts/export_prices_to_warehouse.py` exports existing DB price cache rows into warehouse files.
  - `backend/scripts/build_price_derived_metrics.py` starts the batch-derived metrics boundary with a tested return helper.
  - `backend/services/prices.py` now keeps normal app requests cache-only unless `ENABLE_PRICE_SYNC=1`.
- Exported the local SQLite price cache into `backend/data/price_warehouse`:
  - 7,909,150 usable price rows
  - 3,335 tickers
  - date range 2013-08-14 to 2026-05-08
  - generated Parquet files are ignored by Git and are not part of app-state truth.
- Added the first warehouse-derived metrics promotion path:
  - `fund_price_metrics` stores compact app-facing returns and coverage in Neon/Postgres.
  - Alembic migration `20260517_price_metrics` creates the production table.
  - `build_price_derived_metrics.py` reads Parquet prices, computes weighted holding-period returns, and writes compact metric rows through `DatabaseManager`.
  - A local pilot batch processed 25 recent filings and produced 24 upserted fund/period metric rows with average price coverage of about 96.0%.
- Applied the metrics path to Neon:
  - stamped Alembic at `20260517_price_metrics` after confirming the existing Neon schema was already present,
  - ran a Neon-backed pilot for 25 recent filings,
  - verified 24 `fund_price_metrics` rows in Neon with average price coverage of about 96.0%.
- Exposed compact price metrics to the product:
  - added `GET /api/funds/{cik}/price-metrics`,
  - added `DatabaseManager.get_fund_price_metrics`,
  - `FundSummary` now shows the newest Neon-promoted warehouse price return when available, with price coverage in the tile tooltip,
  - falls back to the existing local QoQ TWR heuristic when no compact metric exists.
- Added a controlled worker refresh path for compact price metrics:
  - `ENABLE_PRICE_METRICS_SYNC=1` schedules `sync_price_metrics_task`,
  - `PRICE_METRICS_REFRESH_LIMIT` controls the number of recent filings per run,
  - `PRICE_METRICS_REFRESH_HOURS` controls cadence and defaults to 24 hours,
  - raw Yahoo price backfills remain separately gated behind `ENABLE_PRICE_SYNC=1`.
- Expanded the Neon-backed price metrics pilot:
  - `build_price_derived_metrics.py --limit 100` completed in about 18 seconds,
  - Neon now has 98 unique `fund_price_metrics` fund/period rows,
  - average price coverage is about 95.3%, with minimum coverage at 60.0%.
- Completed the full current-filings price metrics run:
  - `build_price_derived_metrics.py --limit 1000` covered the current 911 Neon filings in about 224 seconds,
  - 869 unique fund/period pairs were produced before cleanup,
  - filings with no ticker holdings are now skipped by the batch,
  - Neon currently has 867 non-empty `fund_price_metrics` rows,
  - average price coverage is about 93.9%, with minimum non-empty coverage at 48.4%.
- Prepared the price warehouse for R2/S3-compatible storage:
  - added `backend/scripts/upload_price_warehouse.py`,
  - added `boto3` to requirements,
  - dry-run manifest found 3,335 Parquet files totaling 90,475,169 bytes,
  - planned object prefix is `abrams13f/price_warehouse`,
  - no upload has been attempted because R2/S3 credentials are not configured yet.
- Continued Phase 11 deployment-readiness hardening:
  - added a backend logger so `/api/funds/{cik}/mimic-performance` error handling no longer references an undefined `logger`,
  - disabled runtime `/api/config` mutation in production,
  - added regression coverage for the production config guard,
  - updated `docker-compose.yml` with current price warehouse and price metrics environment variables,
  - updated `DEPLOY.md` to reflect the chosen R2/S3-compatible Parquet warehouse path.
  - created a workspace-local `.venv` for backend verification,
  - backend tests pass: `32 passed`,
  - frontend production build passes with the existing bundle-size warning.
- Closed a production warehouse gap:
  - `PriceWarehouse` can now read ticker Parquet files from R2/S3-compatible storage when `PRICE_WAREHOUSE_BACKEND=s3` or `r2`,
  - local warehouse reads/writes remain the default for development,
  - worker price-metrics refresh now refuses to enable S3/R2 mode unless bucket, endpoint, access key, and secret are configured,
  - production deployment docs now instruct `PRICE_WAREHOUSE_BACKEND=s3`,
  - backend tests pass: `34 passed`,
  - frontend production build still passes with the existing bundle-size warning.
- Added a production environment checklist:
  - `docs/production-env-checklist.md` maps Neon, Render API, Render worker, Vercel, R2/S3, and optional Supabase Auth environment variables,
  - checklist was verified against code-referenced env names,
  - backend tests pass: `34 passed`,
  - frontend production build still passes with the existing bundle-size warning.
- Added production environment validation:
  - `backend/scripts/validate_production_env.py` validates required env vars for Render API, Render worker, Vercel, and warehouse upload targets,
  - `docs/production-env-checklist.md` includes the validator commands,
  - warehouse upload dry-run verified 3,335 files totaling 90,475,169 bytes under `abrams13f/price_warehouse`,
  - backend tests pass: `39 passed`,
  - frontend production build still passes with the existing bundle-size warning.
- Uploaded the price warehouse to Cloudflare R2:
  - bucket: `abrams13f-price-warehouse`,
  - uploaded 3,335 Parquet files under `abrams13f/price_warehouse`,
  - verified `PriceWarehouse` can read uploaded AAPL rows from R2,
  - adjusted local test warehouse behavior so explicit temp roots default to local even when `.env` uses `PRICE_WAREHOUSE_BACKEND=s3`,
  - backend tests pass: `39 passed`,
  - frontend production build still passes with the existing bundle-size warning.
- Rotated R2 credentials after accidental local terminal exposure:
  - local `.env` validates for `warehouse-upload`,
  - verified the rotated credentials can read uploaded AAPL rows from R2.
- Published deployment branch:
  - preserved old remote as `old-origin` (`CFC9827/13F.git`),
  - set `origin` to `https://github.com/CFC9827/Acro13F.git`,
  - pushed `codex-cloud-deployment-readiness` to the new `Acro13F` repository.

## Next Steps

1. **Phase 11:** Review Render/Vercel production envs and keep `ENABLE_PRICE_SYNC=0` on the current Neon tier.
2. **Phase 11:** Deploy API/worker/frontend after env review.
3. **Phase 11:** Run production smoke tests.
4. **Phase 3:** Run `BulkIngestor` for the broader SEC universe once cloud environment stability is confirmed.

## Key Files for Context Restoration

- `backend/services/database.py` - core data layer with user-scoped schema.
- `backend/main.py` - API endpoints for user-scoped tracking and folders.
- `ui/src/App.tsx` - main Sidebar and Folder state management.
- `migrate_to_postgres.py` - local SQLite to Postgres migration script.
- `docs/platform-data-plan.md` - service/data ownership plan for Neon, Supabase, bulk storage, prices, and SEC data.
- `.gsd/ROADMAP.md` - v4.0 cloud transition phases.
