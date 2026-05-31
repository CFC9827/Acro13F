# Abrams13F

Abrams13F is a 13F research app for tracking institutional portfolios, filings, holdings, and fund-level performance estimates. The long-term shape is a shared canonical SEC and market-data layer with user-scoped dashboards, tracked funds, favorites, and research workflows on top.

## Current Direction

- **Database**: Neon Postgres is the primary database for canonical SEC/application data.
- **Auth**: Supabase Auth is optional. Local development can run with a built-in dev user when Supabase Auth env vars are absent.
- **Prices**: Full daily prices are not currently stored in Neon. The local SQLite source has millions of rows, and a full import exceeded the current Neon project size cap. Price-heavy work should use a deliberate storage/tier decision before bulk loading.
- **SEC data**: Funds, filings, holdings, sync status, and fund quarterly stats are Postgres-backed.

## Features

- Automated SEC EDGAR 13F-HR and 13F-HR/A sync.
- Fund dashboard with AUM, positions, big movers, crowding signals, and portfolio shifts.
- Fund detail pages with holdings, position history, sector attribution, and filing range.
- Mimic performance simulation using cached prices where available and filing-implied prices as a fallback.
- Institutional Explorer for screening the 13F universe by AUM, concentration, turnover, sector exposure, and market-cap DNA.
- User-scoped tracked funds and stock favorites.

## Technology Stack

### Backend

- Python 3.10+
- FastAPI
- Neon Postgres via `psycopg2`
- SQLite compatibility for local/test data
- SEC EDGAR client, XML parsing, CUSIP/ticker mapping, and price utilities

### Frontend

- React 18
- Vite + TypeScript
- Recharts
- Lucide React
- CSS Modules

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to the Neon connection string.
2. Set `SEC_USER_AGENT` to a real contact string.
3. Leave Supabase Auth variables blank for local development, or set them if you are testing production auth.

### Backend

```bash
pip install -r requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd ui
npm install
npm run dev
```

## Data Migration

Use `migrate_to_postgres.py` to copy canonical data from the local SQLite source into Neon:

```bash
python migrate_to_postgres.py
```

The migration intentionally skips the full `prices` table. Keep daily prices in a separate storage plan until the app is on a database tier or external cache designed for that volume.

Scheduled refresh jobs leave price backfills off by default. Set `ENABLE_PRICE_SYNC=1` only after choosing a database tier or price-storage design that can handle the volume.

## Platform Data Plan

The current ownership plan is documented in `docs/platform-data-plan.md`:

- Neon is the app and canonical SEC database.
- Supabase is optional auth only.
- Full historical prices and raw SEC archives should move to cheaper bulk storage.
- Derived analytics are written back into Neon for fast app use.

## Tests

```bash
python -m pytest backend/tests -q
cd ui
npm run build
```

## Project Structure

```text
backend/                 FastAPI app, services, tests, refresh jobs
backend/data/tracker.db  Local SQLite source/cache, ignored by git
ui/                      React/Vite frontend
migrate_to_postgres.py   SQLite-to-Postgres migration utility
DEPLOY.md                Neon-first deployment notes
```
