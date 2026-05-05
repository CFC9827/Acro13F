import os
import sys
from backend.services.database import DatabaseManager

db = DatabaseManager()

def check_holders(ticker):
    print(f"\n--- Holders for {ticker} (All Funds) ---")
    holders = db.get_stock_holders(ticker)
    print(f"Total Holders found: {len(holders)}")
    for h in holders:
        print(f"Fund: {h['fund_name']}, CIK: {h['cik']}, Value: ${h['value']:,.0f}")

if __name__ == "__main__":
    check_holders('AMZN')
    check_holders('GOOGL')
