import os
import sqlite3
from backend.services.database import DatabaseManager

db = DatabaseManager()

def check_amzn_shares():
    with db._get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT shares, value, ticker FROM holdings WHERE ticker='AMZN'")
        rows = cur.fetchall()
        print(f"Holdings rows for AMZN: {len(rows)}")
        for i, r in enumerate(rows):
            print(f"{i+1}. Shares: {r['shares']}, Value: {r['value']}")

if __name__ == "__main__":
    check_amzn_shares()
