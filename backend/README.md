# Stock Screener Backend Service

The backend is built with **FastAPI** and serves as the data extraction, transformation, and loading (ETL) engine for the application. It handles communication with SEC EDGAR, parses complex XML 13F filings, and manages the local SQLite database.

## ⚙️ Architecture

### Services
The application logic is separated into distinct services within `backend/services/`:

*   **`orchestrator.py`**: The "brain" of the operation. It coordinates fetching, parsing, and saving. It implements smart logic to skip already-indexed filings and handle legacy formats.
*   **`database.py`**: A wrapper around `sqlite3`. Manages all SQL queries, schema migrations, and connection pooling.
*   **`parser.py`**: Contains `InfTableParser`. It parses the raw XML Information Tables from SEC filings into structured Python dictionaries. It handles various XML namespace quirks found in older filings.
*   **`sec_client.py`**: Handles HTTP requests to SEC EDGAR. Implements rate limiting (to comply with SEC fair access rules) and user-agent string management.
*   **`cusip_mapper.py`**: Maps 9-digit CUSIP codes from filings to human-readable Ticker symbols (e.g., `037833100` -> `AAPL`).

### Database Schema (`tracker.db`)

The SQLite database consists of the following core tables:

*   **`funds`**: Stores CIK and Fund Name.
*   **`filings`**: Metadata for each 13F filing (Accession Number, Report Date, Filing Date).
*   **`holdings`**: Individual positions linked to a filing.
    *   Columns: `issuer_name`, `cusip`, `ticker`, `shares`, `value`, `put_call`.
*   **`prices`**: Historical price data for tickers (used for TWR calculations).
*   **`fund_groups`** & **`fund_group_members`**: Organization tables for custom user-defined fund groupings.

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

### Dashboard
*   `GET /dashboard/summary`: Aggregated stats (AUM, top movers, crowding) across all funds.
*   `GET /dashboard/performance`: Time-series performance data for charts.

## 🛠️ Development

### Running Tests
There are several standalone test scripts in the root directory (e.g., `test_parser.py`, `test_api.py`).
You can run them using:
```bash
python ../test_parser.py
```

### Adding New Features
1.  **New API Routes**: Add them in `main.py` or create a new router file if `main.py` becomes too large.
2.  **Database Changes**: Add a migration method in `DatabaseManager.__init__` (e.g., `_migrate_new_column`) to automatically apply schema updates on startup.
