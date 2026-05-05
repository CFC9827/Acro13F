import os
from backend.services.database import DatabaseManager

db = DatabaseManager()

def test_api_holders():
    ticker = 'AMZN'
    holders = db.get_stock_holders(ticker)
    print(f"Total holders returned by API for {ticker}: {len(holders)}")
    for h in holders:
        print(f"- {h['fund_name']} (CIK: {h['cik']})")

if __name__ == "__main__":
    test_api_holders()
