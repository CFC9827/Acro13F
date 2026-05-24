# DECISIONS.md — Architecture Decision Records

> Document significant technical decisions and their rationale.

## ADR Template

```
## ADR-XXX: [Title]
**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded

### Context
[What is the issue we're addressing?]

### Decision
[What did we decide?]

### Consequences
[What are the positive/negative outcomes?]
```

---

## ADR-001: Neon Is The Canonical Source Of Truth
**Date:** 2026-05-17
**Status:** Accepted

### Context

Abrams13F is moving from a local SQLite app into a cloud, multi-user 13F research platform. During the transition, data may exist in several places:

- the original local SQLite database,
- Neon Postgres,
- optional Supabase Auth,
- future object storage for raw SEC files and full price history,
- future Parquet/DuckDB analytical datasets.

Without an explicit source-of-truth rule, the project could accidentally split app state and canonical SEC data across multiple systems.

### Decision

Neon Postgres is the single canonical source of truth for the Abrams13F application database.

Neon owns:

- user records created inside Abrams13F,
- tracked funds, folders, and favorites,
- canonical funds,
- canonical SEC filings,
- parsed 13F holdings,
- sync status,
- fund quarterly stats,
- app-facing derived analytics,
- intentionally small hot price cache rows.

Supabase is not a data source of truth. It may be used only for Auth if selected for production login.

Local SQLite is not a source of truth after migration. It is a source dataset, local cache, test fixture, or recovery/reference artifact.

Object storage and Parquet datasets are warehouse/storage layers, not the source of truth for app state. They may contain raw SEC files, full price history, and bulk analytical data, but app-visible canonical records and derived outputs are promoted into Neon.

### Consequences

Positive outcomes:

- There is one authoritative database for app behavior.
- User state and canonical SEC state are not split across Supabase, SQLite, and Neon.
- Bulk price/SEC archives can use cheaper storage without confusing application writes.
- Frontend and API endpoints can treat Neon-backed FastAPI responses as authoritative.

Tradeoffs:

- Batch jobs must clearly promote derived results from object storage into Neon.
- Any future storage layer needs a documented sync/promote path.
- Full historical prices require separate warehouse design instead of a simple bulk insert into Neon.

---

## ADR-002: Store Full Historical Prices In A Warehouse, Not Neon
**Date:** 2026-05-17
**Status:** Accepted

### Context

Abrams13F needs a long-term historical price layer for:

- fund performance estimates,
- mimic portfolio simulation,
- benchmark comparisons,
- ticker ownership/crowding analysis,
- future full-universe SEC research.

The local SQLite source already has about 7.9 million price rows across 3,335 tickers. A full load into the current Neon project hit the project size limit after a partial migration. As the SEC universe expands, the raw price layer will grow faster than the app database.

### Decision

Full historical daily prices will live outside Neon in a price warehouse.

The first implementation should use:

- local Parquet files for development,
- an R2/S3-compatible object-storage layout for production,
- DuckDB/Python batch jobs to query and transform the Parquet data,
- compact derived outputs written back into Neon.

Neon remains the source of truth for app-visible state and derived app-facing results. The Neon `prices` table is a hot cache only, not the full historical warehouse.

### Consequences

Positive outcomes:

- Neon stays small enough for app and canonical SEC data.
- Historical prices can scale cheaply as a bulk analytical dataset.
- Expensive price joins happen in batch jobs, not in user requests.
- The UI can use compact derived tables instead of recalculating from raw daily prices.

Tradeoffs:

- We need a warehouse ingestion/query layer instead of one Postgres table.
- Batch jobs must promote derived outputs into Neon before the app treats them as authoritative.
- Local development needs a small sample Parquet dataset and tests for the warehouse reader.
