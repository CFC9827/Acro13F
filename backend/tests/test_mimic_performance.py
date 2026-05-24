import os
import sys
import tempfile

os.environ["DATABASE_URL"] = ""

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services.database import DatabaseManager
from backend.services.mimic_performance import MimicPerformanceCalculator


def test_mimic_performance_does_not_fetch_missing_prices_synchronously(monkeypatch):
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    try:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        db = DatabaseManager(db_path=db_path)
        cik = "0000000001"

        db.save_fund(cik, "Test Fund")
        db.save_filing("acc-1", cik, "2024-03-31", "2024-05-15")
        db.save_holdings("acc-1", [
            {"issuer_name": "APPLE INC", "cusip": "037833100", "ticker": "AAPL", "shares": 10, "value": 1000, "put_call": None},
            {"issuer_name": "MISSING INC", "cusip": "000000000", "ticker": "MISS", "shares": 20, "value": 500, "put_call": None},
        ])
        db.save_filing("acc-2", cik, "2024-06-30", "2024-08-15")
        db.save_holdings("acc-2", [
            {"issuer_name": "APPLE INC", "cusip": "037833100", "ticker": "AAPL", "shares": 10, "value": 1200, "put_call": None},
            {"issuer_name": "MISSING INC", "cusip": "000000000", "ticker": "MISS", "shares": 20, "value": 600, "put_call": None},
        ])
        db.save_prices("AAPL", [
            {"date": "2024-05-15", "price": 100.0, "dividends": 0.0},
            {"date": "2024-08-15", "price": 120.0, "dividends": 0.0},
        ])

        monkeypatch.setattr("backend.services.mimic_performance.get_benchmark_data", lambda *args, **kwargs: [])

        result = MimicPerformanceCalculator(db).get_mimic_performance(cik)

        assert "error" not in result
        assert result["fund_name"] == "Test Fund"
        assert len(result["series"]) == 2
        assert result["series"][0]["holdings_detailed"][1]["ticker"] == "MISS"
        assert result["series"][0]["holdings_detailed"][1]["price"] == 25.0
    finally:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        if os.path.exists(db_path):
            os.remove(db_path)
