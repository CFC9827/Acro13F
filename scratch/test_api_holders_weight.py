import os
from backend.services.database import DatabaseManager

db = DatabaseManager()

def test_api_holders_weight():
    ticker = 'AMZN'
    holders = db.get_stock_holders(ticker)
    print(f"Total holders: {len(holders)}")
    for h in holders:
        print(f"- {h['fund_name']}: Weight = {h['weight']}")

if __name__ == "__main__":
    test_api_holders_weight()
