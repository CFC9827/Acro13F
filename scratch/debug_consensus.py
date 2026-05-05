from backend.services.database import DatabaseManager
import os
import json

db = DatabaseManager()
# Get a group ID or just use None for all
summary = db.get_dashboard_summary(group_id=None)

print(f"Latest Period: {summary.get('latest_period')}")
print(f"Prior Period: {summary.get('prior_period')}")

consensus = summary.get("consensus_stocks", [])
print(f"\n--- Consensus Shares Check (First 10) ---")
for stock in consensus[:10]:
    print(f"Ticker: {stock.get('ticker')}, Net Shares Change: {stock.get('net_shares_change')}, Fund Count: {stock.get('fund_count')}")

# Check one specifically
for stock in consensus:
    if stock.get('ticker') == 'GOOGL':
        print(f"\nGOOGL Detail: {json.dumps(stock, indent=2)}")
        break
