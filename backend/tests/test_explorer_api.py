import pytest
import os
import sys
import tempfile
import json
from fastapi.testclient import TestClient

# Tests should never initialize the cloud database during module import.
os.environ["ABRAMS13F_SKIP_DOTENV"] = "1"
os.environ["DATABASE_URL"] = ""

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
    DatabaseManager._instance = None
    DatabaseManager._initialized = False
    main.db = DatabaseManager(db_path=db_path)
    main.invalidate_dashboard_summary_cache()
    main.app.dependency_overrides[main.get_user_id] = lambda: "00000000-0000-0000-0000-000000000000"
    
    yield TestClient(app)

    main.app.dependency_overrides.clear()
    main.invalidate_dashboard_summary_cache()
    DatabaseManager._instance = None
    DatabaseManager._initialized = False
    
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

def test_fund_price_metrics_endpoint_returns_compact_online_metrics(client):
    import backend.main as main
    db = main.db

    db.save_fund("0001067983", "Berkshire Hathaway")
    db.save_fund_price_metric({
        "cik": "0001067983",
        "period_of_report": "2024-12-31",
        "accession_number": "ACC1",
        "start_date": "2024-10-01",
        "end_date": "2024-12-31",
        "weighted_return": 0.1234,
        "coverage_pct": 98.5,
        "positions_priced": 40,
        "positions_total": 42,
    })

    resp = client.get("/api/funds/0001067983/price-metrics")

    assert resp.status_code == 200
    assert resp.json() == {
        "cik": "0001067983",
        "metrics": [
            {
                "cik": "0001067983",
                "period_of_report": "2024-12-31",
                "accession_number": "ACC1",
                "start_date": "2024-10-01",
                "end_date": "2024-12-31",
                "weighted_return": 0.1234,
                "coverage_pct": 98.5,
                "positions_priced": 40,
                "positions_total": 42,
                "updated_at": resp.json()["metrics"][0]["updated_at"],
            }
        ],
    }

def test_api_routes_do_not_register_duplicate_method_path_pairs():
    """Each API method/path pair should be registered once to avoid shadowed handlers."""
    seen = set()
    duplicates = []

    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", set()) or set()
        for method in methods:
            if method in {"HEAD", "OPTIONS"}:
                continue
            key = (method, path)
            if key in seen:
                duplicates.append(key)
            seen.add(key)

    assert duplicates == []


def test_dashboard_summary_endpoint_caches_and_can_force_refresh(client, monkeypatch):
    import backend.main as main

    calls = []

    def fake_summary(group_id=None, user_id=None):
        calls.append({"group_id": group_id, "user_id": user_id})
        return {"call_count": len(calls), "group_id": group_id}

    monkeypatch.setenv("DASHBOARD_SUMMARY_CACHE_TTL_SECONDS", "300")
    monkeypatch.setattr(main.db, "get_dashboard_summary", fake_summary)
    main.invalidate_dashboard_summary_cache()

    first = client.get("/api/dashboard/summary")
    second = client.get("/api/dashboard/summary")
    forced = client.get("/api/dashboard/summary?refresh=true")

    assert first.status_code == 200
    assert second.status_code == 200
    assert forced.status_code == 200
    assert first.json()["call_count"] == 1
    assert second.json()["call_count"] == 1
    assert forced.json()["call_count"] == 2


def test_tracking_fund_invalidates_dashboard_summary_cache(client, monkeypatch):
    import backend.main as main

    calls = []

    def fake_summary(group_id=None, user_id=None):
        calls.append(user_id)
        return {"call_count": len(calls)}

    monkeypatch.setenv("DASHBOARD_SUMMARY_CACHE_TTL_SECONDS", "300")
    monkeypatch.setattr(main.db, "get_dashboard_summary", fake_summary)
    main.invalidate_dashboard_summary_cache()

    assert client.get("/api/dashboard/summary").json()["call_count"] == 1
    track_resp = client.post("/api/funds/0000000001/track?track=true")
    assert track_resp.status_code == 200
    assert client.get("/api/dashboard/summary").json()["call_count"] == 2


def test_config_update_is_disabled_in_production(client, monkeypatch):
    monkeypatch.setenv("ENV", "production")

    resp = client.post("/api/config", json={"sec_user_agent": "Abrams13F/1.0 admin@example.com"})

    assert resp.status_code == 403
    assert resp.json()["detail"] == "Runtime configuration changes are disabled in production"

if __name__ == "__main__":
    pytest.main([__file__])
