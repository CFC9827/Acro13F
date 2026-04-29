# Stock Screener Backend Service

The backend is built with **FastAPI** and serves as the data extraction, transformation, and loading (ETL) engine for the application. It handles communication with SEC EDGAR, parses complex XML 13F filings, and manages the local SQLite database.

## ⚙️ Architecture

### Services
The application logic is separated into distinct services within `backend/services/`:

*   **`orchestrator.py`**: Coordinates fetching, parsing, saving, and auto-calculating quarterly metrics. Implements smart logic to skip already-indexed filings and handle legacy formats.
*   **`database.py`**: A wrapper around `sqlite3`. Manages all SQL queries, schema migrations, and connection pooling.
*   **`parser.py`**: Parses the raw XML Information Tables from SEC filings. Includes a smart scaling heuristic with secondary sanity check to handle values reported in thousands vs. actual dollars.
*   **`sec_client.py`**: Handles HTTP requests to SEC EDGAR. Implements rate limiting and user-agent string management.
*   **`cusip_mapper.py`**: Maps 9-digit CUSIP codes to human-readable Ticker symbols (e.g., `037833100` → `AAPL`).
*   **`whale_index.py`**: Calculates 15+ quarterly metrics (AUM, Concentration, Sector Exposure, Market Cap DNA, Turnover) for the Institutional Explorer screener.
*   **`mimic_performance.py`**: Simulates retail investor returns by replaying a fund's 13F trades with configurable investment parameters.
*   **`sector_mapper.py`**: Maps tickers to GICS sectors for portfolio analysis.

### Database Schema (`tracker.db`)

The SQLite database consists of the following tables:

*   **`funds`**: CIK, Fund Name, tracked status, sync metadata.
*   **`filings`**: Metadata for each 13F filing (Accession Number, Report Date, Filing Date).
*   **`holdings`**: Individual positions linked to a filing.
    *   Columns: `issuer_name`, `cusip`, `ticker`, `shares`, `value`, `put_call`, `sector`.
*   **`prices`**: Historical price/dividend data for tickers (used for TWR and mimic calculations).
*   **`fund_quarterly_stats`**: Pre-calculated quarterly metrics per fund (AUM, concentration, sector, cap DNA, turnover) — powers the Institutional Explorer.
*   **`fund_groups`** & **`fund_group_members`**: Custom user-defined fund groupings with sort ordering.

## 🔌 API Endpoints

### Funds
*   `GET /funds`: List all tracked funds.
*   `POST /funds/{cik}/refresh`: Trigger a sync/refresh for a specific fund.
    *   Query Param `limit`: Optional, limit the number of historical filings to fetch.
    *   Query Param `force_all`: Force re-download of all filings.
*   `DELETE /funds/{cik}`: Remove a fund and all its data.

### Data Access
*   `GET /funds/{cik}/holdings`: Get current (latest quarter) holdings.
*   `GET /funds/{cik}/history`: Get full historical holdings, merged and sorted by period.
*   `GET /search-cik`: Proxy endpoint to search SEC EDGAR for company names/CIKs.
*   `GET /funds/{cik}/mimic-performance`: Simulate retail investor returns for a fund.

### Dashboard
*   `GET /dashboard/summary`: Aggregated stats (AUM, top movers, crowding) across all funds.
*   `GET /dashboard/performance`: Time-series TWR performance data for comparison charts.

### Groups
*   `GET /dashboard/groups`: List fund groups.
*   `POST /dashboard/groups`: Create a new group.
*   `DELETE /dashboard/groups/{id}`: Delete a group.
*   `POST /dashboard/groups/reorder`: Reorder groups.
*   `POST /dashboard/groups/{id}/members`: Add a fund to a group.
*   `DELETE /dashboard/groups/{id}/members/{cik}`: Remove a fund from a group.

### Explorer
*   `POST /api/explorer/search`: Search the institutional fund universe with multi-factor filters.

### Sectors
*   `GET /api/sectors/allocation`: Get sector allocation breakdown for a fund.

### Market
*   `GET /api/market/benchmark`: Get S&P 500 benchmark data.

## 🛠️ Development

### Running Tests
```bash
python -m pytest backend/tests/ -v
```

Tests cover: database schema, explorer API, and whale index metric calculations.

### Adding New Features
1.  **New API Routes**: Add them in `main.py` or create a new router file.
2.  **Database Changes**: Add a migration method in `DatabaseManager.__init__` to automatically apply schema updates on startup.
