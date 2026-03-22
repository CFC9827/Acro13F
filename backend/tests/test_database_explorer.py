import pytest
import os
import sys
import tempfile
# Ensure the backend directory is in the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.database import DatabaseManager

def test_fund_quarterly_stats_schema():
    """Verify that fund_quarterly_stats table is created and supports save_quarterly_stats."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name
    
    try:
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
        if os.path.exists(db_path):
            os.remove(db_path)

if __name__ == "__main__":
    pytest.main([__file__])
