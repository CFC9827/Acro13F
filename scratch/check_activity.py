import os
import sys
import json

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.database import DatabaseManager as Database

def check_activity():
    db = Database()
    # Find a group with some funds
    groups = db.get_groups()
    if not groups:
        print("No groups found")
        return
    
    group_id = groups[0]['id']
    print(f"Checking group {group_id}")
    
    summary = db.get_dashboard_summary(group_id)
    activity = summary.get('ticker_fund_activity', {})
    
    # Look for AMZN
    amzn = activity.get('AMZN')
    if amzn:
        print("AMZN activity found:")
        print(json.dumps(amzn, indent=2))
    else:
        print("AMZN activity NOT found in ticker_fund_activity")
        # Print some other tickers
        print("Available tickers:", list(activity.keys())[:5])

if __name__ == "__main__":
    check_activity()
