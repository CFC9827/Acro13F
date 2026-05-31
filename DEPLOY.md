# Abrams13F Deployment Guide

This guide covers the current cloud shape for Abrams13F:

- **Neon Postgres** for canonical application data.
- **Render** for the backend API and scheduled refresh cron job.
- **Vercel** for the Vite frontend.
- **R2/S3-compatible object storage** for the full historical price warehouse.
- **Supabase Auth is optional**. Use it only if you want production login/signup now; it is no longer the primary database.

## Prerequisites

1. **Neon account** with a Postgres 17 project.
2. **Render account** for the backend API and scheduled refresh cron job.
3. **Vercel account** for the frontend UI.
4. **SEC User-Agent** string, e.g. `Name (email)`, for EDGAR access.
5. **R2/S3-compatible bucket** for historical price Parquet files.
6. Optional: **Supabase project for Auth only**.

## 1. Database Setup (Neon)

1. Create a Neon project using Postgres 17.
2. Copy the pooled or direct Postgres connection string.
3. Set it as:
   ```env
   DATABASE_URL=postgresql://...
   ```
4. Run the migration from a trusted local machine:
   ```bash
   python migrate_to_postgres.py
   ```

The migration intentionally skips the full `prices` table. The local SQLite source currently has millions of daily price rows, and a full load exceeded a 512 MB Neon project limit during testing. Keep prices out of the default migration until the storage strategy is chosen.

## 2. Optional Auth Setup

For local development, no Supabase Auth is required. If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are absent, the frontend uses a default dev user, and the backend allows the same dev user when `ENV` is not `production`.

For production, configure real Supabase Auth or another auth layer. With `ENV=production`, missing or unconfigured Supabase Auth is rejected.

Required env vars when using Supabase Auth:

```env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Never expose a service-role key to the frontend.

## 3. Backend Deployment (Render)

Create a Render **Web Service**:

- **Environment**: Docker
- **Plan**: Starter or higher
- **Environment variables**:
  ```env
  ENV=production
  DATABASE_URL=<Neon connection string>
  SEC_USER_AGENT=<your SEC User-Agent>
  FRONTEND_URL=<your Vercel URL>
  SUPABASE_URL=<optional auth URL>
  SUPABASE_ANON_KEY=<optional auth anon key>
  DASHBOARD_SUMMARY_CACHE_TTL_SECONDS=300
  ENABLE_PRICE_SYNC=0
  ENABLE_PRICE_METRICS_SYNC=0
  PRICE_METRICS_REFRESH_LIMIT=25
  PRICE_METRICS_REFRESH_HOURS=24
  PRICE_WAREHOUSE_BACKEND=s3
  PRICE_WAREHOUSE_PATH=backend/data/price_warehouse
  PRICE_WAREHOUSE_BUCKET=<R2/S3 bucket>
  PRICE_WAREHOUSE_ENDPOINT_URL=<R2/S3 endpoint>
  PRICE_WAREHOUSE_ACCESS_KEY_ID=<R2/S3 access key>
  PRICE_WAREHOUSE_SECRET_ACCESS_KEY=<R2/S3 secret>
  PRICE_WAREHOUSE_PREFIX=abrams13f/price_warehouse
  ```

Deploy the service.

## 4. Scheduled Refresh Deployment (Render)

Create a Render **Cron Job** from the same repo:

- **Environment**: Docker
- **Schedule**: `0 */12 * * *` to run every 12 hours in UTC.
- **Command**:
  ```bash
  python -m backend.worker_once
  ```
- Use the same backend environment variables.
- Recommended fund refresh settings:
  ```env
  FUND_REFRESH_STALE_HOURS=12
  FUND_REFRESH_LIMIT=25
  FUND_REFRESH_TRACKED_ONLY=1
  ```
- `FUND_REFRESH_TRACKED_ONLY=1` keeps the scheduled refresh focused on user-tracked funds. Leave broad corpus ingestion for a separate controlled batch job.
- Keep `ENABLE_PRICE_SYNC=0` on the current Neon tier.
- Set `ENABLE_PRICE_METRICS_SYNC=1` only after the price warehouse files are available to the worker environment.
- With R2 or S3-compatible storage, set `PRICE_WAREHOUSE_BACKEND=s3`. The local backend is only for development and local batch jobs.

The cron job runs one bounded refresh pass and exits. For a manual test, trigger a run from the Render cron job page and watch for `Starting one-shot fund refresh...` in the logs.

This job is intentionally separate from the API service so user requests keep using the existing web process while refresh work runs elsewhere. Refresh batches are bounded by `FUND_REFRESH_LIMIT`, run tracked funds sequentially, and failed funds receive a stale-window cooldown before retry so one bad CIK cannot monopolize every scheduled run.

## 5. Frontend Deployment (Vercel)

Create a Vercel project:

- **Framework preset**: Vite
- **Root directory**: `ui`
- **Environment variables**:
  ```env
  VITE_API_URL=<Render API URL>
  VITE_SUPABASE_URL=<optional auth URL>
  VITE_SUPABASE_ANON_KEY=<optional auth anon key>
  ```

Deploy, then copy the Vercel URL into Render as `FRONTEND_URL`.

## 6. Local Testing

Backend:
```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Frontend:
```bash
cd ui
npm run dev -- --host 127.0.0.1
```

Verification:
```bash
python -m pytest backend/tests -q -p no:cacheprovider
cd ui && npm run build
```

## 7. Price Warehouse

Price-heavy views now avoid synchronous Yahoo backfills during a user request. `mimic-performance` uses cached DB prices when present and falls back to filing-implied prices when missing.

The worker's scheduled price backfill is disabled unless `ENABLE_PRICE_SYNC=1` is set. Keep this off on the current Neon size tier.

Full daily prices should live outside Neon in Parquet files. For production, upload the local warehouse to R2/S3-compatible storage:

```bash
python -m backend.scripts.upload_price_warehouse --prefix abrams13f/price_warehouse --upload
```

Dry-run first by omitting `--upload`:

```bash
python -m backend.scripts.upload_price_warehouse --prefix abrams13f/price_warehouse
```

Current local dry-run shape:

- 3,335 Parquet files
- about 90 MB
- object prefix `abrams13f/price_warehouse`

Compact app-facing outputs, such as `fund_price_metrics`, are written back into Neon by batch jobs.
