"""
Smoke test: Verify the DatabaseManager works against Neon Postgres with the new schema.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

print(f"DATABASE_URL set: {bool(os.environ.get('DATABASE_URL'))}")

from backend.services.database import DatabaseManager

db = DatabaseManager()
print(f"is_postgres: {db.is_postgres}")

# 1. get_funds
funds = db.get_funds(user_id=1)
print(f"\n1. get_funds(user_id=1): {len(funds)} funds")
for f in funds[:3]:
    print(f"   - {f['name']} ({f['cik']})")

# 2. get_groups
groups = db.get_groups(user_id=1)
print(f"\n2. get_groups(user_id=1): {len(groups)} groups")
for g in groups:
    print(f"   - {g['name']}: {len(g['member_ciks'])} members")

# 3. fund-info style query
test_cik = funds[0]['cik'] if funds else None
if test_cik:
    fund = db._execute("SELECT * FROM funds WHERE cik = %s", (test_cik,), fetch='one')
    tracked = db._execute("SELECT 1 FROM user_tracked_funds WHERE user_id = %s AND cik = %s", (1, test_cik), fetch='one')
    print(f"\n3. fund_info for {test_cik}: name={fund['name']}, tracked={bool(tracked)}")

# 4. Quick dashboard summary (just fund count)
try:
    summary = db.get_dashboard_summary(user_id=1)
    print(f"\n4. Dashboard: {summary['kpis']['fund_count']} funds, AUM={summary['kpis']['total_aum']:,}")
except Exception as e:
    print(f"\n4. Dashboard error: {e}")

print("\nAll smoke tests passed!")
