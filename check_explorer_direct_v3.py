import os
os.environ["DATABASE_URL"] = "postgresql://postgres.eoamlyhoxhcbksdbykyt:KYxXeE8BD7xllj72@aws-1-us-east-1.pooler.supabase.com:6543/postgres"

import sys
sys.path.append('backend')
from services.database import DatabaseManager

db_manager = DatabaseManager()
print(f"Is Postgres: {db_manager.is_postgres}")

user_id = "613a7374-1aab-4aa8-aa0f-da005a8b8cfb"
criteria = {
    "filters": [
        {"logic": "AND", "metric": "total_aum", "op": "gt", "val": 1000000000}
    ],
    "global_logic": "AND"
}

try:
    results = db_manager.search_explorer(criteria, user_id=user_id)
    if results:
        # Find TCI Fund
        tci = next((r for r in results if r['cik'] == '0001647251'), None)
        print("TCI Result:", tci)
    else:
        print("No results")
except Exception as e:
    print(f"Error: {e}")
