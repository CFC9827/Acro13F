import os
os.environ["DATABASE_URL"] = "postgresql://postgres.eoamlyhoxhcbksdbykyt:KYxXeE8BD7xllj72@aws-1-us-east-1.pooler.supabase.com:6543/postgres"

import sys
sys.path.append('backend')
from services.database import DatabaseManager

db_manager = DatabaseManager()

try:
    stats = db_manager._execute("SELECT cik, name FROM funds WHERE cik = '0001647251'", fetch='one')
    print("Fund Info:", stats)
    
    # Check stats for this fund
    fund_stats = db_manager._execute("SELECT * FROM fund_quarterly_stats WHERE cik = '0001647251' ORDER BY period_of_report DESC LIMIT 1", fetch='one')
    print("Latest Stats:", fund_stats)
except Exception as e:
    print(f"Error: {e}")
