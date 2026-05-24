# Abrams13F Platform Data Plan

Last updated: 2026-05-17

## Goal

Abrams13F should become a full 13F research platform with:

- a canonical SEC 13F database,
- a long-term historical price layer,
- fast app-facing analytics,
- and user-specific dashboards, folders, tracked funds, and favorites.

The important architecture decision is that these jobs do not all belong in one database.

## Source Of Truth

Neon Postgres is the single source of truth for application state and canonical SEC data.

That means:

- the FastAPI app reads and writes authoritative app records in Neon,
- users, tracked funds, folders, favorites, funds, filings, holdings, sync status, and derived app-facing metrics are authoritative in Neon,
- Supabase is not a data source of truth,
- local SQLite is not a source of truth after migration,
- object storage and Parquet are warehouse/storage layers, not app-state truth,
- derived analytics become app-visible only after they are written back into Neon.

This is recorded as `ADR-001` in `.gsd/DECISIONS.md`.

The price warehouse decision is recorded as `ADR-002` in `.gsd/DECISIONS.md`.

## Service Responsibilities

### Neon Postgres

Neon is the primary application database.

Use Neon for:

- users created inside Abrams13F,
- user tracked funds,
- user fund groups and group members,
- stock favorites,
- canonical funds,
- canonical SEC filings,
- parsed 13F holdings,
- sync status,
- fund quarterly stats,
- derived dashboard/explorer metrics,
- small hot/recent price cache,
- app-facing precomputed performance results.

Do not use the current Neon tier for:

- the full historical daily price warehouse,
- bulk raw SEC filing archives,
- huge downloaded SEC datasets,
- millions of cold rows that the UI does not need directly.

Why:

- Neon is a good cheap Postgres app database.
- Neon Free/low tiers are not designed to be an unlimited warehouse.
- The current local SQLite `prices` table already has about 7.9 million rows, and a full Neon price migration hit the current project size limit.

### Supabase

Supabase is optional.

Use Supabase only for Auth if we choose it for production login:

- sign up,
- sign in,
- sign out,
- password reset,
- JWT/session validation,
- possible OAuth later.

Do not use Supabase for:

- primary Abrams13F database storage,
- SEC filings,
- holdings,
- full price history,
- canonical app data.

Current decision:

- Do not create a new Supabase database project for app data.
- Keep the code able to run without Supabase Auth in development.
- Re-evaluate Supabase Auth vs Neon Auth vs Clerk before production login is finalized.

### Cloudflare R2 Or Similar Object Storage

Object storage is the likely long-term home for large cold datasets.

Use object storage for:

- raw SEC filing downloads,
- SEC bulk archive files,
- full historical daily prices,
- dividends and splits,
- compressed Parquet datasets,
- generated research snapshots,
- backup/export artifacts.

Why:

- Object storage is much cheaper for large cold data.
- Parquet compresses tabular data well.
- We can process large files with batch jobs and write summarized results back into Neon.

### Parquet + DuckDB / Python Batch Jobs

Use Parquet as the bulk analytical file format.

Use DuckDB/Python jobs for:

- reading historical price files,
- joining price data against holdings,
- computing fund performance estimates,
- computing mimic performance series,
- computing ticker ownership/crowding history,
- building quarterly aggregate tables,
- refreshing derived metrics in Neon.

Why:

- These are analytical/batch workloads, not normal app request workloads.
- The UI should not recalculate everything from raw price rows on every request.

### FastAPI Backend

FastAPI remains the app/API layer.

Responsibilities:

- serve the React frontend API,
- read/write Neon app data,
- validate auth/session state,
- run SEC ingestion workflows,
- expose dashboard/fund/explorer endpoints,
- trigger controlled background jobs,
- return precomputed or cached analytics whenever possible.

The backend should avoid:

- doing huge Yahoo/price backfills during normal user requests,
- loading the entire historical price warehouse into memory,
- writing uncontrolled bulk price data into Neon.

### Background Worker

The worker handles scheduled or controlled non-request work.

Responsibilities:

- sync stale funds from SEC,
- calculate missing quarterly stats,
- run controlled ingestion batches,
- refresh derived metrics.

Current safety setting:

- scheduled price backfills are off by default,
- full price sync requires `ENABLE_PRICE_SYNC=1`,
- compact price metric refresh requires `ENABLE_PRICE_METRICS_SYNC=1`,
- compact price metric refresh defaults to every 24 hours via `PRICE_METRICS_REFRESH_HOURS=24`,
- keep `ENABLE_PRICE_SYNC=0` on the current Neon tier.

## Data Layers

### Layer 1: App/User Layer

Lives in Neon.

Examples:

- `users`
- `user_tracked_funds`
- `user_fund_groups`
- `user_fund_group_members`
- `stock_favorites`

### Layer 2: Canonical SEC Layer

Lives in Neon.

Examples:

- `funds`
- `filings`
- `holdings`
- `sync_status`
- `fund_quarterly_stats`

Future expansion:

- complete 13F filer universe,
- amendment-aware filing history,
- CIK/entity metadata,
- fund aliases and manager metadata.

### Layer 3: Price Warehouse

Lives outside Neon by default.

Initial local layout:

```text
backend/data/price_warehouse/
  prices/
    ticker=AAPL/
      prices.parquet
```

Current local warehouse export:

- 7,909,150 usable price rows
- 3,335 tickers
- date range 2013-08-14 to 2026-05-08
- approximately 90 MB of Parquet files on local disk
- R2/S3 upload dry-run: 3,335 files, 90,475,169 bytes, prefix `abrams13f/price_warehouse`

Examples:

- daily OHLC/adjusted close,
- dividends,
- splits,
- benchmark/index prices,
- ticker metadata snapshots.

### Layer 4: Hot Price Cache

Lives in Neon, but stays intentionally small.

Examples:

- active tickers,
- recent windows,
- benchmark series needed by the UI,
- cached data for frequently viewed funds.

### Layer 5: Derived Analytics

Lives in Neon because the app needs it fast.

Examples:

- fund quarterly performance estimates,
- `fund_price_metrics` weighted holding-period returns and price coverage,
- mimic return series,
- crowding/consensus metrics,
- ticker holder counts by period,
- sector exposure history,
- top movers,
- portfolio shift summaries.

## Current Decisions

1. Neon is the primary app and canonical SEC database.
2. Supabase is not used for the primary database.
3. Supabase may be used only for Auth if we choose that path.
4. Full daily prices should not be bulk-loaded into the current Neon tier.
5. Scheduled full price backfills stay disabled unless deliberately enabled.
6. The long-term price layer will use Parquet warehouse files plus derived Neon tables.
7. The whole SEC 13F universe is still the goal, but ingestion should happen in controlled batches after the Neon-backed app is stable.

## Near-Term Plan

1. Keep Neon `prices` as a hot cache, not the full warehouse.
2. Keep `ENABLE_PRICE_SYNC=0` unless deliberately running a controlled price job.
3. Use a daily production worker cadence for compact price metrics refresh, then adjust after observing deployed runtime.
4. Add R2/S3 credentials and upload the Parquet warehouse with `python -m backend.scripts.upload_price_warehouse --prefix abrams13f/price_warehouse --upload`.
5. Expand SEC ingestion in controlled batches.

## Working Mental Model

Neon is the app brain.

Object storage is the warehouse.

Batch jobs are the research engine.

FastAPI is the product API.

React is the research workstation.

Supabase is optional login infrastructure, not the database.
