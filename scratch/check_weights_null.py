import os
from backend.services.database import DatabaseManager

db = DatabaseManager()

def check_weights():
    ticker = 'AMZN'
    holders = db.get_stock_holders(ticker)
    print(f"Total holders: {len(holders)}")
    for i, h in enumerate(holders):
        print(f"{i+1}. {h['fund_name']}: Weight = {h['weight']}")

if __name__ == "__main__":
    check_weights()
