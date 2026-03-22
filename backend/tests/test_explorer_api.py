import pytest
import os
import sys
import tempfile
import json
from fastapi.testclient import TestClient

# Ensure the backend directory is in the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.main import app
from backend.services.database import DatabaseManager

@pytest.fixture
def client():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name
    
    # Overwrite the global db in main.py for testing
    import backend.main as main
    main.db = DatabaseManager(db_path=db_path)
    
    yield TestClient(app)
    
    if os.path.exists(db_path):
        os.remove(db_path)

def test_explorer_search_endpoint(client):
    """Test the /api/explorer/search endpoint with various filters."""
    # 1. Seed some data
    main_db = client.app.dependency_overrides.get(None, None) # Not using DI yet, accessing via main.db
    import backend.main as main
    db = main.db
    
    # Berkshire
    db.save_fund("0001067983", "Berkshire Hathaway")
    db.save_quarterly_stats({
        "cik": "0001067983",
        "period_of_report": "2024-12-31",
        "accession_number": "ACC1",
        "total_aum": 350000000000,
        "position_count": 45,
        "top_10_concentration": 78.0,
        "avg_position_size": 2.0,
        "primary_sector": "Technology",
        "primary_sector_weight": 42.0,
        "mega_cap_pct": 85.0,
        "mid_cap_pct": 10.0,
        "small_cap_pct": 5.0,
        "portfolio_turnover": 4.0,
        "avg_holding_period": 12.0,
        "herding_score": 15.0
    })
    
    # Small VC
    db.save_fund("0009999999", "Small Cap Alpha")
    db.save_quarterly_stats({
        "cik": "0009999999",
        "period_of_report": "2024-12-31",
        "accession_number": "ACC2",
        "total_aum": 100000000, # 100M
        "position_count": 12,
        "top_10_concentration": 95.0,
        "avg_position_size": 8.0,
        "primary_sector": "Healthcare",
        "primary_sector_weight": 80.0,
        "mega_cap_pct": 0.0,
        "mid_cap_pct": 20.0,
        "small_cap_pct": 80.0,
        "portfolio_turnover": 25.0,
        "avg_holding_period": 4.0,
        "herding_score": 5.0
    })

    # Test Filter 1: AUM > 1B
    resp = client.post("/api/explorer/search", json={
        "logic": "AND",
        "filters": [
            {"metric": "total_aum", "op": "gt", "val": 1000000000}
        ]
    })
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Berkshire Hathaway"

    # Test Filter 2: Small Cap % > 50
    resp = client.post("/api/explorer/search", json={
        "logic": "AND",
        "filters": [
            {"metric": "small_cap_pct", "op": "gt", "val": 50}
        ]
    })
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Small Cap Alpha"

    # Test Filter 3: Complex OR logic
    # (AUM > 100B) OR (Sector = Healthcare)
    resp = client.post("/api/explorer/search", json={
        "logic": "OR",
        "filters": [
            {"metric": "total_aum", "op": "gt", "val": 100000000000},
            {"metric": "primary_sector", "op": "eq", "val": "Healthcare"}
        ]
    })
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2

if __name__ == "__main__":
    pytest.main([__file__])
