# Price Warehouse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first price warehouse layer so full historical prices live outside Neon while derived app-facing results are promoted back into Neon.

**Architecture:** Neon remains the single source of truth for app state, canonical SEC records, and derived app-facing metrics. Raw full historical prices live in Parquet files locally for development and in R2/S3-compatible object storage for production. Batch jobs read Parquet with DuckDB/Python, compute compact outputs, and write those outputs into Neon.

**Tech Stack:** Python, FastAPI services, Neon Postgres, Parquet, DuckDB, pyarrow/pandas, optional R2/S3-compatible object storage.

---

## File Structure

- Create: `backend/services/price_warehouse.py`
  - Owns local Parquet path conventions, ticker normalization, read/write helpers, and date-window queries.
- Create: `backend/tests/test_price_warehouse.py`
  - Tests Parquet write/read behavior against a temporary local warehouse.
- Create: `backend/scripts/export_prices_to_warehouse.py`
  - Exports current local/Neon `prices` rows into partitioned Parquet files.
- Create: `backend/scripts/build_price_derived_metrics.py`
  - Later batch job for reading warehouse prices, joining against holdings, and writing compact derived outputs into Neon.
- Modify: `requirements.txt`
  - Add `duckdb` and `pyarrow`.
- Modify: `docs/platform-data-plan.md`
  - Mark ADR-002 and define the first physical file layout.
- Modify: `.env.example`
  - Add local and future cloud warehouse configuration keys.

## Warehouse Layout

Local development path:

```text
backend/data/price_warehouse/
  prices/
    ticker=AAPL/
      prices.parquet
    ticker=MSFT/
      prices.parquet
```

Each Parquet row:

```text
ticker: string
date: date/string in YYYY-MM-DD format
close: float
dividends: float
source: string
updated_at: string
```

The first version should keep one Parquet file per ticker. This is simple, easy to test, and good enough for the current scale. We can later add year partitions if files become too large.

## Environment Variables

Add:

```env
PRICE_WAREHOUSE_BACKEND=local
PRICE_WAREHOUSE_PATH=backend/data/price_warehouse

# Future object storage settings.
PRICE_WAREHOUSE_BUCKET=
PRICE_WAREHOUSE_ENDPOINT_URL=
PRICE_WAREHOUSE_ACCESS_KEY_ID=
PRICE_WAREHOUSE_SECRET_ACCESS_KEY=
```

## Task 1: Add Local Price Warehouse Service

**Files:**
- Create: `backend/services/price_warehouse.py`
- Test: `backend/tests/test_price_warehouse.py`
- Modify: `requirements.txt`

- [x] **Step 1: Add dependencies**

Add these lines to `requirements.txt`:

```text
duckdb
pyarrow
```

- [x] **Step 2: Write failing test for round-trip Parquet storage**

Create `backend/tests/test_price_warehouse.py`:

```python
from backend.services.price_warehouse import PriceWarehouse


def test_price_warehouse_round_trips_ticker_prices(tmp_path):
    warehouse = PriceWarehouse(root=tmp_path)

    warehouse.write_prices("BRK/B", [
        {"date": "2024-01-02", "close": 100.0, "dividends": 0.0, "source": "test"},
        {"date": "2024-01-03", "close": 101.5, "dividends": 0.25, "source": "test"},
    ])

    rows = warehouse.read_prices("BRK/B", start="2024-01-03")

    assert rows == [
        {
            "ticker": "BRK/B",
            "date": "2024-01-03",
            "close": 101.5,
            "dividends": 0.25,
            "source": "test",
        }
    ]
```

- [x] **Step 3: Run test to verify it fails**

Run:

```bash
python -m pytest backend/tests/test_price_warehouse.py -q
```

Expected: fail because `backend.services.price_warehouse` does not exist.

- [x] **Step 4: Implement `PriceWarehouse`**

Create `backend/services/price_warehouse.py`:

```python
import os
from pathlib import Path
from typing import Dict, List, Optional

import duckdb
import pandas as pd


class PriceWarehouse:
    def __init__(self, root: Optional[Path | str] = None):
        configured_root = os.environ.get("PRICE_WAREHOUSE_PATH", "backend/data/price_warehouse")
        self.root = Path(root or configured_root)

    def _ticker_dir(self, ticker: str) -> Path:
        safe = ticker.replace("/", "__SLASH__").replace("\\", "__BSLASH__")
        return self.root / "prices" / f"ticker={safe}"

    def _price_file(self, ticker: str) -> Path:
        return self._ticker_dir(ticker) / "prices.parquet"

    def write_prices(self, ticker: str, rows: List[Dict]) -> None:
        if not rows:
            return

        price_file = self._price_file(ticker)
        price_file.parent.mkdir(parents=True, exist_ok=True)

        normalized = []
        for row in rows:
            normalized.append({
                "ticker": ticker,
                "date": str(row["date"])[:10],
                "close": float(row["close"]),
                "dividends": float(row.get("dividends", 0.0)),
                "source": row.get("source", "unknown"),
            })

        frame = pd.DataFrame(normalized)
        frame = frame.sort_values(["ticker", "date"]).drop_duplicates(["ticker", "date"], keep="last")
        frame.to_parquet(price_file, index=False)

    def read_prices(self, ticker: str, start: Optional[str] = None, end: Optional[str] = None) -> List[Dict]:
        price_file = self._price_file(ticker)
        if not price_file.exists():
            return []

        filters = ["ticker = ?"]
        params = [ticker]
        if start:
            filters.append("date >= ?")
            params.append(start)
        if end:
            filters.append("date <= ?")
            params.append(end)

        query = f"""
            SELECT ticker, date, close, dividends, source
            FROM read_parquet(?)
            WHERE {' AND '.join(filters)}
            ORDER BY date
        """

        rows = duckdb.execute(query, [str(price_file), *params]).fetchall()
        return [
            {
                "ticker": row[0],
                "date": str(row[1])[:10],
                "close": float(row[2]),
                "dividends": float(row[3] or 0.0),
                "source": row[4],
            }
            for row in rows
        ]
```

- [x] **Step 5: Verify test passes**

Run:

```bash
python -m pytest backend/tests/test_price_warehouse.py -q
```

Expected: `1 passed`.

## Task 2: Export Existing Price Cache To Warehouse

**Files:**
- Create: `backend/scripts/export_prices_to_warehouse.py`
- Test: `backend/tests/test_price_warehouse.py`

- [x] **Step 1: Add export test with a fake database**

Add to `backend/tests/test_price_warehouse.py`:

```python
from backend.scripts.export_prices_to_warehouse import export_tickers


class FakeDb:
    def get_prices(self, ticker, start_date=None):
        return [
            {"date": "2024-01-02", "price": 10.0, "dividends": 0.0},
            {"date": "2024-01-03", "price": 11.0, "dividends": 0.1},
        ]


def test_export_tickers_writes_db_prices_to_warehouse(tmp_path):
    warehouse = PriceWarehouse(root=tmp_path)

    result = export_tickers(FakeDb(), warehouse, ["AAPL"])

    assert result == {"AAPL": 2}
    assert warehouse.read_prices("AAPL")[-1]["close"] == 11.0
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
python -m pytest backend/tests/test_price_warehouse.py -q
```

Expected: fail because `backend.scripts.export_prices_to_warehouse` does not exist.

- [x] **Step 3: Implement export script**

Create `backend/scripts/export_prices_to_warehouse.py`:

```python
from typing import Dict, Iterable

from backend.services.database import DatabaseManager
from backend.services.price_warehouse import PriceWarehouse


def export_tickers(db, warehouse: PriceWarehouse, tickers: Iterable[str]) -> Dict[str, int]:
    counts = {}
    for ticker in tickers:
        prices = db.get_prices(ticker)
        rows = [
            {
                "date": price["date"],
                "close": price["price"],
                "dividends": price.get("dividends", 0.0),
                "source": "db-cache",
            }
            for price in prices
        ]
        warehouse.write_prices(ticker, rows)
        counts[ticker] = len(rows)
    return counts


def main():
    db = DatabaseManager()
    warehouse = PriceWarehouse()
    tickers = db.get_all_tickers()
    counts = export_tickers(db, warehouse, tickers)
    print(f"Exported {sum(counts.values())} price rows across {len(counts)} tickers.")


if __name__ == "__main__":
    main()
```

- [x] **Step 4: Verify tests pass**

Run:

```bash
python -m pytest backend/tests/test_price_warehouse.py -q
```

Expected: all tests pass.

## Task 3: Keep App Requests On Neon Hot Cache Only

**Files:**
- Modify: `backend/services/prices.py`
- Test: `backend/tests/test_prices.py`

- [x] **Step 1: Add test that production requests do not warehouse-backfill synchronously**

Create `backend/tests/test_prices.py`:

```python
import os

from backend.services.prices import price_backfill_enabled


def test_price_backfill_disabled_by_default(monkeypatch):
    monkeypatch.delenv("ENABLE_PRICE_SYNC", raising=False)
    assert price_backfill_enabled() is False


def test_price_backfill_can_be_enabled(monkeypatch):
    monkeypatch.setenv("ENABLE_PRICE_SYNC", "1")
    assert price_backfill_enabled() is True
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
python -m pytest backend/tests/test_prices.py -q
```

Expected: fail because `price_backfill_enabled` does not exist.

- [x] **Step 3: Implement the helper and guard Yahoo fetches**

In `backend/services/prices.py`, add:

```python
def price_backfill_enabled() -> bool:
    return os.environ.get("ENABLE_PRICE_SYNC", "").lower() in {"1", "true", "yes", "on"}
```

Then before the Yahoo Finance fetch block, add:

```python
    if not price_backfill_enabled():
        logger.info("Price backfill disabled; returning cached prices only.")
        return prices
```

- [x] **Step 4: Verify focused tests pass**

Run:

```bash
python -m pytest backend/tests/test_prices.py backend/tests/test_mimic_performance.py -q
```

Expected: all tests pass.

## Task 4: Add Derived Metrics Boundary

**Files:**
- Create: `backend/scripts/build_price_derived_metrics.py`
- Create: `backend/tests/test_price_derived_metrics.py`

- [x] **Step 1: Add test for a pure derived metric helper**

Create `backend/tests/test_price_derived_metrics.py`:

```python
from backend.scripts.build_price_derived_metrics import calculate_return


def test_calculate_return_with_dividends():
    result = calculate_return(start_price=100.0, end_price=110.0, dividends=2.0)
    assert round(result, 4) == 0.12
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
python -m pytest backend/tests/test_price_derived_metrics.py -q
```

Expected: fail because the script/helper does not exist.

- [x] **Step 3: Implement the helper**

Create `backend/scripts/build_price_derived_metrics.py`:

```python
def calculate_return(start_price: float, end_price: float, dividends: float = 0.0) -> float:
    if start_price <= 0:
        return 0.0
    return ((end_price + dividends) / start_price) - 1.0
```

- [x] **Step 4: Verify test passes**

Run:

```bash
python -m pytest backend/tests/test_price_derived_metrics.py -q
```

Expected: `1 passed`.

## Final Verification

Run:

```bash
python -m pytest backend/tests -q -p no:cacheprovider
cd ui
npm run build
```

Expected:

- backend test suite passes,
- frontend production build passes,
- existing bundle-size warning is acceptable until code splitting is addressed.

## Notes

- Do not bulk-load full historical prices into Neon.
- Keep `ENABLE_PRICE_SYNC=0` for normal local and production app requests.
- Treat Parquet warehouse data as raw/bulk analytical data.
- Treat Neon-derived metric tables as app-visible truth after batch promotion.
