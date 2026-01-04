import sqlite3
import os

db_path = "backend/data/tracker.db"

def inspect():
    if not os.path.exists(db_path):
        print(f"DB not found at {db_path}")
        return
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("Checking for Microsoft:")
    cursor.execute("SELECT issuer_name, cusip, ticker FROM holdings WHERE issuer_name LIKE '%MICROSOFT%' LIMIT 5")
    rows = cursor.fetchall()
    for row in rows:
        print(row)
        
    print("\nChecking for top 10 tickers:")
    cursor.execute("SELECT issuer_name, cusip, ticker FROM holdings WHERE ticker IS NOT NULL AND ticker != '' LIMIT 10")
    rows = cursor.fetchall()
    for row in rows:
        print(row)
        
    print("\nChecking for unique CUSIPS missing tickers:")
    cursor.execute("SELECT COUNT(DISTINCT cusip) FROM holdings WHERE ticker IS NULL OR ticker = ''")
    print(f"Missing: {cursor.fetchone()[0]}")
    
    conn.close()

if __name__ == "__main__":
    inspect()
