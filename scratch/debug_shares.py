import sqlite3
import os

db_path = "backend/data/tracker.db"
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("--- Sample Holdings ---")
rows = cursor.execute("SELECT ticker, shares, value FROM holdings WHERE ticker IS NOT NULL LIMIT 10").fetchall()
for row in rows:
    print(f"Ticker: {row['ticker']}, Shares: {row['shares']}, Value: {row['value']}")

print("\n--- Consensus Data Check ---")
# Let's check GOOGL as it was in the screenshot
rows = cursor.execute("SELECT shares, value, accession_number FROM holdings WHERE ticker = 'GOOGL'").fetchall()
for row in rows:
    print(f"GOOGL - Shares: {row['shares']}, Value: {row['value']}, Acc: {row['accession_number']}")

conn.close()
