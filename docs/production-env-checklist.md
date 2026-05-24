# Abrams13F Production Environment Checklist

Use this checklist to configure production services without committing secrets.

Current service map:

- Neon: canonical application database and compact app-facing analytics.
- Render Web Service: FastAPI backend.
- Render Background Worker: SEC ingestion, stats refresh, and optional derived price metrics refresh.
- Vercel: React/Vite frontend.
- Cloudflare R2 or S3-compatible storage: full historical price Parquet warehouse.
- Supabase: optional authentication only.

## 1. Neon

Create or use the existing Neon Postgres project.

Required value:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
```

Use this value in:

- local `.env` when running migrations or local API against Neon,
- Render Web Service,
- Render Background Worker.

Notes:

- Neon is the source of truth for app/user state, canonical funds, filings, holdings, stats, and compact derived analytics.
- Do not bulk-load full daily historical prices into the current Neon tier.

## 2. SEC User-Agent

Required value:

```env
SEC_USER_AGENT=Abrams13F/1.0 your-name-or-company your-email@example.com
```

Use this value in:

- local `.env`,
- Render Web Service,
- Render Background Worker.

Notes:

- Use a real contact string for SEC EDGAR access.
- The production API rejects runtime `/api/config` updates, so this must be configured through environment variables.

## 3. Render Web Service

Set these env vars on the Render backend API service:

```env
ENV=production
DATABASE_URL=<Neon connection string>
SEC_USER_AGENT=<real SEC contact string>
FRONTEND_URL=<Vercel production URL>

SUPABASE_URL=<optional auth URL, blank if auth is not enabled yet>
SUPABASE_ANON_KEY=<optional auth anon key, blank if auth is not enabled yet>

ENABLE_PRICE_SYNC=0
ENABLE_PRICE_METRICS_SYNC=0
PRICE_METRICS_REFRESH_LIMIT=25
PRICE_METRICS_REFRESH_HOURS=24

PRICE_WAREHOUSE_BACKEND=s3
PRICE_WAREHOUSE_PATH=backend/data/price_warehouse
PRICE_WAREHOUSE_BUCKET=<R2/S3 bucket name>
PRICE_WAREHOUSE_ENDPOINT_URL=<R2/S3 endpoint URL>
PRICE_WAREHOUSE_ACCESS_KEY_ID=<R2/S3 access key ID>
PRICE_WAREHOUSE_SECRET_ACCESS_KEY=<R2/S3 secret access key>
PRICE_WAREHOUSE_PREFIX=abrams13f/price_warehouse
```

Recommended Render settings:

- Environment: Docker
- Service type: Web Service
- Start command: use the Dockerfile default

Safety notes:

- Keep `ENABLE_PRICE_SYNC=0` on the current Neon tier.
- Keep `ENABLE_PRICE_METRICS_SYNC=0` until the price warehouse has been uploaded and verified.

Local validation before entering values in Render:

```bash
.venv\Scripts\python.exe -m backend.scripts.validate_production_env render-api
```

## 4. Render Background Worker

Set the same backend env vars as the Render Web Service.

Recommended Render settings:

- Environment: Docker
- Service type: Background Worker
- Command override:

```bash
python -m backend.worker
```

When to enable derived price metrics:

```env
ENABLE_PRICE_METRICS_SYNC=1
```

Only enable this after:

- R2/S3 credentials are configured,
- the Parquet warehouse upload has completed,
- `PRICE_WAREHOUSE_BACKEND=s3`,
- the worker can read from the configured bucket/prefix.

The worker intentionally refuses to schedule price metrics refresh in S3/R2 mode when bucket, endpoint, access key, or secret are missing.

Local validation before entering values in Render:

```bash
.venv\Scripts\python.exe -m backend.scripts.validate_production_env render-worker
```

## 5. Vercel Frontend

Set these env vars on the Vercel project:

```env
VITE_API_URL=<Render backend API URL>
VITE_SUPABASE_URL=<optional auth URL, blank if auth is not enabled yet>
VITE_SUPABASE_ANON_KEY=<optional auth anon key, blank if auth is not enabled yet>
```

Recommended Vercel settings:

- Framework preset: Vite
- Root directory: `ui`
- Build command: `npm run build`

After Vercel deploys, copy the production Vercel URL into Render as `FRONTEND_URL`.

Local validation:

```bash
.venv\Scripts\python.exe -m backend.scripts.validate_production_env vercel
```

## 6. Supabase Auth

Supabase is optional and should be used only for authentication.

If production login is enabled, configure:

Backend:

```env
SUPABASE_URL=<Supabase project URL>
SUPABASE_ANON_KEY=<Supabase anon key>
```

Frontend:

```env
VITE_SUPABASE_URL=<Supabase project URL>
VITE_SUPABASE_ANON_KEY=<Supabase anon key>
```

Notes:

- Do not use Supabase as the application database.
- Do not expose service-role keys to the frontend.
- With `ENV=production`, backend requests require a valid auth token if Supabase Auth is configured.
- If production auth is not configured yet, do not treat the first public deployment as user-ready.

## 7. R2/S3 Price Warehouse

Create a bucket and access key with permissions to upload and read objects under:

```env
PRICE_WAREHOUSE_PREFIX=abrams13f/price_warehouse
```

Required local upload env vars:

```env
PRICE_WAREHOUSE_BUCKET=<R2/S3 bucket name>
PRICE_WAREHOUSE_ENDPOINT_URL=<R2/S3 endpoint URL>
PRICE_WAREHOUSE_ACCESS_KEY_ID=<R2/S3 access key ID>
PRICE_WAREHOUSE_SECRET_ACCESS_KEY=<R2/S3 secret access key>
PRICE_WAREHOUSE_PREFIX=abrams13f/price_warehouse
```

Local validation:

```bash
.venv\Scripts\python.exe -m backend.scripts.validate_production_env warehouse-upload
```

Dry-run upload manifest:

```bash
.venv\Scripts\python.exe -m backend.scripts.upload_price_warehouse --prefix abrams13f/price_warehouse
```

Actual upload:

```bash
.venv\Scripts\python.exe -m backend.scripts.upload_price_warehouse --prefix abrams13f/price_warehouse --upload
```

Expected current local warehouse shape:

- 3,335 Parquet files
- about 90 MB
- object keys under `abrams13f/price_warehouse/prices/...`

## 8. Deployment Order

1. Confirm Neon `DATABASE_URL`.
2. Choose whether Supabase Auth is enabled for the first production deployment.
3. Create R2/S3 bucket and access key.
4. Set local R2/S3 upload env vars.
5. Run the warehouse dry-run.
6. Upload the warehouse.
7. Set Render Web Service env vars.
8. Set Render Worker env vars, keeping `ENABLE_PRICE_METRICS_SYNC=0` at first.
9. Set Vercel env vars.
10. Deploy Render API and Vercel frontend.
11. Update Render `FRONTEND_URL` with the final Vercel URL.
12. Deploy Render worker.
13. Smoke-test the production site.
14. Enable `ENABLE_PRICE_METRICS_SYNC=1` only after worker warehouse reads are verified.

## 9. Production Smoke Test

Verify:

- `GET /api/config` returns configured SEC status.
- Dashboard loads from Vercel through Render.
- Fund summary loads holdings, history, filing range, sector attribution, mimic performance, and price metrics.
- Explorer search returns results.
- Favorites and stock holders routes return results.
- Missing auth behaves as expected for the chosen auth posture.
- Render worker starts without scheduling full price sync.
- Render worker logs either a disabled price-metrics message or a successful configured schedule.
