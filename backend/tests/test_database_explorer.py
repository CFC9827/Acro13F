import pytest
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = ""

# Ensure the backend directory is in the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.services.database import DatabaseManager

def test_fund_quarterly_stats_schema():
    """Verify that fund_quarterly_stats table is created and supports save_quarterly_stats."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name
    
    try:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        db = DatabaseManager(db_path=db_path)
        
        # This should fail if the table doesn't exist or save_quarterly_stats is not implemented
        stats = {
            "cik": "0001067983", # Berkshire
            "period_of_report": "2024-12-31",
            "accession_number": "0001067983-25-000001",
            "total_aum": 350000000000,
            "position_count": 45,
            "top_10_concentration": 78.5,
            "avg_position_size": 2.2,
            "primary_sector": "Technology",
            "primary_sector_weight": 42.1,
            "mega_cap_pct": 85.0,
            "mid_cap_pct": 10.0,
            "small_cap_pct": 5.0,
            "portfolio_turnover": 4.5,
            "avg_holding_period": 12.4,
            "herding_score": 15.2
        }
        
        db.save_quarterly_stats(stats)
        
        # Verify persistence
        res = db._execute("SELECT * FROM fund_quarterly_stats WHERE cik = ?", (db.normalize_cik("0001067983"),), fetch='one')
        assert res is not None
        assert res["total_aum"] == 350000000000
        assert res["primary_sector"] == "Technology"
        
    finally:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        if os.path.exists(db_path):
            os.remove(db_path)


def test_fund_price_metrics_schema():
    """Verify compact price-derived metrics can be persisted separately from warehouse data."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    try:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        db = DatabaseManager(db_path=db_path)

        metric = {
            "cik": "0001067983",
            "period_of_report": "2024-12-31",
            "accession_number": "0001067983-25-000001",
            "start_date": "2024-10-01",
            "end_date": "2024-12-31",
            "weighted_return": 0.1234,
            "coverage_pct": 95.5,
            "positions_priced": 42,
            "positions_total": 45,
        }

        db.save_fund_price_metric(metric)
        res = db._execute(
            "SELECT * FROM fund_price_metrics WHERE cik = ? AND period_of_report = ?",
            (db.normalize_cik("0001067983"), "2024-12-31"),
            fetch="one",
        )

        assert res is not None
        assert res["weighted_return"] == 0.1234
        assert res["coverage_pct"] == 95.5

    finally:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        if os.path.exists(db_path):
            os.remove(db_path)


def test_get_stale_funds_honors_limit_and_excludes_recent_funds():
    """Worker refresh batches should be bounded and skip recently synced funds."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    try:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        db = DatabaseManager(db_path=db_path)

        db.save_fund("1", "Never Synced Fund")
        db.save_fund("2", "Old Fund")
        db.save_fund("3", "Recent Fund")
        db.save_fund("4", "Untracked Old Fund")
        db.track_fund("00000000-0000-0000-0000-000000000000", "1")
        db.track_fund("00000000-0000-0000-0000-000000000000", "2")
        db.track_fund("00000000-0000-0000-0000-000000000000", "3")
        db._execute("UPDATE funds SET last_synced_at = datetime('now', '-48 hours') WHERE cik = ?", (db.normalize_cik("2"),))
        db._execute("UPDATE funds SET last_synced_at = datetime('now', '-1 hours') WHERE cik = ?", (db.normalize_cik("3"),))
        db._execute("UPDATE funds SET last_synced_at = datetime('now', '-48 hours') WHERE cik = ?", (db.normalize_cik("4"),))

        stale = db.get_stale_funds(hours=12, limit=3)

        assert [row["cik"] for row in stale] == [db.normalize_cik("1"), db.normalize_cik("2")]

    finally:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        if os.path.exists(db_path):
            os.remove(db_path)


def test_failed_fund_sync_gets_cooldown_before_next_retry():
    """A failing fund should not monopolize every scheduled refresh run."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    try:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        db = DatabaseManager(db_path=db_path)

        db.save_fund("1", "Bad CIK Fund")
        db.track_fund("00000000-0000-0000-0000-000000000000", "1")

        assert [row["cik"] for row in db.get_stale_funds(hours=12, limit=5)] == [db.normalize_cik("1")]

        db.update_fund_sync_status("1", "failed")

        assert db.get_stale_funds(hours=12, limit=5) == []

    finally:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        if os.path.exists(db_path):
            os.remove(db_path)

if __name__ == "__main__":
    pytest.main([__file__])
