import os
import sys
from backend.services.database import DatabaseManager

db = DatabaseManager()

def check_consensus(ticker):
    summary = db.get_dashboard_summary()
    consensus = summary.get('consensus_stocks', [])
    for item in consensus:
        if item['ticker'] == ticker:
            print(f"\n--- Consensus for {ticker} ---")
            print(f"Fund Count: {item['fund_count']}")
            print(f"Total Value: {item['total_value']}")
            print(f"Net Shares Change: {item['net_shares_change']}")
            print(f"Top Holder: {item['top_holder']}")
            print(f"Max Weight: {item['max_weight']}")

if __name__ == "__main__":
    check_consensus('AMZN')
    check_consensus('GOOGL')
