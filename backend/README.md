# Abrams13F Backend

The backend is a FastAPI service that fetches SEC EDGAR filings, parses 13F information tables, stores canonical fund/filing/holding data, and serves analytics to the React frontend.

## Database Mode

`DatabaseManager` supports Postgres when `DATABASE_URL` is set and SQLite when it is absent. Neon Postgres is the primary shared database. SQLite remains useful for local source data, tests, and offline development.

Full daily prices are intentionally not part of the default Neon migration yet. The production-safe path is to keep canonical SEC data in Postgres and choose a separate strategy for the multi-million-row price layer.

Scheduled price backfills are disabled unless `ENABLE_PRICE_SYNC=1` is set.

## Main Services

- `orchestrator.py`: coordinates SEC fetch, parse, save, sync status, and quarterly metric refresh.
- `database.py`: database abstraction for Postgres and SQLite-compatible operations.
- `parser.py`: parses 13F XML information tables and applies value-scaling checks.
- `sec_client.py`: SEC EDGAR HTTP client with user-agent and rate-limit handling.
- `cusip_mapper.py`: resolves CUSIPs to tickers where possible.
- `whale_index.py`: calculates fund quarterly metrics for Institutional Explorer.
- `mimic_performance.py`: simulates copycat returns using cached prices and filing-implied fallback prices.
- `auth.py`: validates Supabase Auth JWTs when configured, with local dev fallback outside production.

## Core Tables

- `funds`
- `filings`
- `holdings`
- `fund_quarterly_stats`
- `sync_status`
- `users`
- `user_tracked_funds`
- `stock_favorites`
- `prices` for hot/cache price data only, not full historical bulk loads on the current Neon tier.

## Running Locally

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Set `DATABASE_URL` for Neon. Leave `SUPABASE_URL` and `SUPABASE_ANON_KEY` blank for local dev-auth.

## Tests

```bash
python -m pytest backend/tests -q
```
