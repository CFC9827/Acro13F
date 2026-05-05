from backend.services.database import DatabaseManager
import os

db = DatabaseManager()
groups = db._execute("SELECT id, name FROM fund_groups", fetch='all')

for group in groups:
    print(f"\nGroup: {group['name']} (ID: {group['id']})")
    summary = db.get_dashboard_summary(group_id=group['id'])
    consensus = summary.get("consensus_stocks", [])
    
    non_zero = [s for s in consensus if s.get('net_shares_change') != 0]
    print(f"Total consensus stocks: {len(consensus)}")
    print(f"Stocks with non-zero net change: {len(non_zero)}")
    
    if non_zero:
        for stock in non_zero[:3]:
            print(f"  - {stock['ticker']}: {stock['net_shares_change']}")
    else:
        print("  !!! ALL ZERO !!!")
        if consensus:
            s = consensus[0]
            print(f"  Example {s['ticker']}: Total Value {s['total_value']}, Funds {s['fund_count']}")
