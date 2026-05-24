from backend.services.prices import get_historical_prices, price_backfill_enabled


def test_price_backfill_disabled_by_default(monkeypatch):
    monkeypatch.delenv("ENABLE_PRICE_SYNC", raising=False)

    assert price_backfill_enabled() is False


def test_price_backfill_can_be_enabled(monkeypatch):
    monkeypatch.setenv("ENABLE_PRICE_SYNC", "1")

    assert price_backfill_enabled() is True


class EmptyPriceDb:
    def get_prices(self, ticker, start_date=None):
        return []

    def get_ticker_metadata(self, ticker):
        return None


class FakeWarehouse:
    def read_prices(self, ticker, start=None):
        return [
            {"ticker": ticker, "date": "2024-01-02", "close": 100.0, "dividends": 0.0, "source": "test"},
            {"ticker": ticker, "date": "2024-01-03", "close": 101.5, "dividends": 0.25, "source": "test"},
        ]


def test_get_historical_prices_falls_back_to_price_warehouse(monkeypatch):
    monkeypatch.delenv("ENABLE_PRICE_SYNC", raising=False)
    monkeypatch.setenv("PRICE_WAREHOUSE_BACKEND", "s3")

    rows = get_historical_prices("AAPL", EmptyPriceDb(), "2024-01-01", warehouse=FakeWarehouse())

    assert rows == [
        {"date": "2024-01-02", "price": 100.0, "dividends": 0.0},
        {"date": "2024-01-03", "price": 101.5, "dividends": 0.25},
    ]
