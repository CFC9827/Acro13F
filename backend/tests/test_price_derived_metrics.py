from backend.scripts.build_price_derived_metrics import (
    calculate_return,
    calculate_weighted_holding_return,
    build_filing_price_metrics,
    build_recent_price_metrics,
    resolve_refresh_limit,
    quarter_start_for_period,
)


def test_calculate_return_with_dividends():
    result = calculate_return(start_price=100.0, end_price=110.0, dividends=2.0)

    assert round(result, 4) == 0.12


def test_calculate_weighted_holding_return_uses_warehouse_prices(tmp_path):
    from backend.services.price_warehouse import PriceWarehouse

    warehouse = PriceWarehouse(root=tmp_path)
    warehouse.write_prices(
        "AAPL",
        [
            {"date": "2024-01-01", "close": 100.0, "dividends": 0.0, "source": "test"},
            {"date": "2024-03-31", "close": 110.0, "dividends": 1.0, "source": "test"},
        ],
    )
    warehouse.write_prices(
        "MSFT",
        [
            {"date": "2024-01-01", "close": 200.0, "dividends": 0.0, "source": "test"},
            {"date": "2024-03-31", "close": 190.0, "dividends": 0.0, "source": "test"},
        ],
    )

    result = calculate_weighted_holding_return(
        warehouse,
        [
            {"ticker": "AAPL", "value": 60_000},
            {"ticker": "MSFT", "value": 40_000},
        ],
        start_date="2024-01-01",
        end_date="2024-03-31",
    )

    assert round(result, 4) == 0.046


class FakeDb:
    def __init__(self):
        self.saved = []

    def save_fund_price_metric(self, stats):
        self.saved.append(stats)


def test_build_filing_price_metrics_promotes_compact_result(tmp_path):
    from backend.services.price_warehouse import PriceWarehouse

    warehouse = PriceWarehouse(root=tmp_path)
    warehouse.write_prices(
        "AAPL",
        [
            {"date": "2024-01-01", "close": 100.0, "dividends": 0.0, "source": "test"},
            {"date": "2024-03-31", "close": 120.0, "dividends": 0.0, "source": "test"},
        ],
    )
    db = FakeDb()

    stats = build_filing_price_metrics(
        db,
        warehouse,
        filing={
            "cik": "0000123456",
            "accession_number": "0000123456-24-000001",
            "period_of_report": "2024-03-31",
        },
        holdings=[{"ticker": "AAPL", "value": 10_000}],
        start_date="2024-01-01",
        end_date="2024-03-31",
    )

    assert stats["cik"] == "0000123456"
    assert stats["period_of_report"] == "2024-03-31"
    assert stats["weighted_return"] == 0.2
    assert stats["coverage_pct"] == 100.0
    assert db.saved == [stats]


def test_quarter_start_for_period():
    assert quarter_start_for_period("2024-03-31") == "2024-01-01"
    assert quarter_start_for_period("2024-06-30") == "2024-04-01"
    assert quarter_start_for_period("2024-09-30") == "2024-07-01"
    assert quarter_start_for_period("2024-12-31") == "2024-10-01"


def test_resolve_refresh_limit_prefers_cli_then_env(monkeypatch):
    monkeypatch.setenv("PRICE_METRICS_REFRESH_LIMIT", "75")

    assert resolve_refresh_limit(["--limit", "100"]) == 100
    assert resolve_refresh_limit([]) == 75

    monkeypatch.setenv("PRICE_METRICS_REFRESH_LIMIT", "not-a-number")
    assert resolve_refresh_limit([]) == 25


def test_build_recent_price_metrics_reads_db_and_writes_compact_metric(tmp_path, monkeypatch):
    import os
    import tempfile

    from backend.services.database import DatabaseManager
    from backend.services.price_warehouse import PriceWarehouse

    monkeypatch.setenv("DATABASE_URL", "")
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    try:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        db = DatabaseManager(db_path=db_path)
        db.save_fund("0000123456", "Test Fund")
        db.save_filing("0000123456-24-000001", "0000123456", "2024-03-31", "2024-05-15")
        db.save_holdings(
            "0000123456-24-000001",
            [
                {
                    "issuer_name": "APPLE INC",
                    "cusip": "037833100",
                    "ticker": "AAPL",
                    "shares": 100,
                    "value": 10_000,
                    "put_call": None,
                }
            ],
        )

        warehouse = PriceWarehouse(root=tmp_path)
        warehouse.write_prices(
            "AAPL",
            [
                {"date": "2024-01-01", "close": 100.0, "dividends": 0.0, "source": "test"},
                {"date": "2024-03-31", "close": 125.0, "dividends": 0.0, "source": "test"},
            ],
        )

        results = build_recent_price_metrics(db, warehouse, limit=1)
        saved = db._execute("SELECT * FROM fund_price_metrics", fetch="one")

        assert len(results) == 1
        assert saved["weighted_return"] == 0.25
        assert saved["coverage_pct"] == 100.0

    finally:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        if os.path.exists(db_path):
            os.remove(db_path)


def test_build_recent_price_metrics_skips_filings_without_ticker_holdings(tmp_path, monkeypatch):
    import os
    import tempfile

    from backend.services.database import DatabaseManager
    from backend.services.price_warehouse import PriceWarehouse

    monkeypatch.setenv("DATABASE_URL", "")
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    try:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        db = DatabaseManager(db_path=db_path)
        db.save_fund("0000123456", "Test Fund")
        db.save_filing("0000123456-24-000001", "0000123456", "2024-03-31", "2024-05-15")

        results = build_recent_price_metrics(db, PriceWarehouse(root=tmp_path), limit=1)
        saved = db._execute("SELECT * FROM fund_price_metrics", fetch="one")

        assert results == []
        assert saved is None

    finally:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        if os.path.exists(db_path):
            os.remove(db_path)
