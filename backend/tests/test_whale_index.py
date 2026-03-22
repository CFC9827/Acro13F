import pytest
import os
import sys
import tempfile
from unittest.mock import MagicMock, patch

# Ensure the backend directory is in the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.database import DatabaseManager
from services.whale_index import WhaleIndexService

@pytest.fixture
def db():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name
    db = DatabaseManager(db_path=db_path)
    yield db
    if os.path.exists(db_path):
        os.remove(db_path)

def test_calculate_fund_metrics(db):
    """Verify that calculate_fund_metrics correctly aggregates data from holdings."""
    # 1. Setup a fund and some holdings
    cik = "0001067983"
    acc = "0001067983-25-000001"
    db.save_fund(cik, "Berkshire Hathaway")
    db.save_filing(acc, cik, "2024-12-31", "2025-02-14")
    
    # Create holdings with mixed sectors and caps
    holdings = [
        {"issuer_name": "APPLE INC", "cusip": "037833100", "ticker": "AAPL", "shares": 1000, "value": 200000, "put_call": None}, # Tech, Mega
        {"issuer_name": "BANK OF AMERICA", "cusip": "060505104", "ticker": "BAC", "shares": 5000, "value": 150000, "put_call": None}, # Finance, Mega
        {"issuer_name": "SMALL CO", "cusip": "123456789", "ticker": "SML", "shares": 10000, "value": 50000, "put_call": None}, # Unknown, Small (if we mock)
    ]
    db.save_holdings(acc, holdings)
    
    # Mock sector and cap resolution if necessary, or just rely on the service
    service = WhaleIndexService(db)
    
    # Mocking internal methods that might hit APIs
    service.get_market_cap = MagicMock(side_effect=lambda t: 300000000000 if t in ["AAPL", "BAC"] else 500000000)
    
    metrics = service.calculate_fund_metrics(cik, acc)
    
    assert metrics["cik"] == db.normalize_cik(cik)
    assert metrics["total_aum"] == 400000
    assert metrics["position_count"] == 3
    assert metrics["top_10_concentration"] == 100.0 # Only 3 positions, so top 10 is 100%
    
    # Verify persistence
    service.save_metrics(metrics)
    res = db._execute("SELECT * FROM fund_quarterly_stats WHERE cik = ?", (db.normalize_cik(cik),), fetch='one')
    assert res is not None
    assert res["total_aum"] == 400000

if __name__ == "__main__":
    pytest.main([__file__])
