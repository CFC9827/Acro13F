import os
from backend.services.database import DatabaseManager

db = DatabaseManager()

def check_net_change():
    summary = db.get_dashboard_summary()
    consensus = summary.get('consensus_stocks', [])
    print(f"Total tickers: {len(consensus)}")
    for s in consensus[:10]:
        print(f"Ticker: {s['ticker']}, Net Change: {s['net_shares_change']}, Funds: {s['fund_count']}")

if __name__ == "__main__":
    check_net_change()
