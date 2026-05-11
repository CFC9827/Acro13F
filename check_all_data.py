import os
os.environ["DATABASE_URL"] = "postgresql://postgres.eoamlyhoxhcbksdbykyt:KYxXeE8BD7xllj72@aws-1-us-east-1.pooler.supabase.com:6543/postgres"

import sys
sys.path.append('backend')
from services.database import DatabaseManager

db_manager = DatabaseManager()

try:
    users = db_manager._execute("SELECT * FROM users", fetch='all')
    print("All Users:", users)
    
    tracked = db_manager._execute("SELECT * FROM user_tracked_funds", fetch='all')
    print("All Tracked Funds:", tracked)
except Exception as e:
    print(f"Error: {e}")
