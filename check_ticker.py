import sqlite3
import os

db_path = 'backend/data/tracker.db'
if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('SELECT value, shares, ticker, accession_number FROM holdings WHERE ticker LIKE "%112585104%" OR cusip LIKE "%112585104%" LIMIT 10')
    rows = cursor.fetchall()
    for row in rows:
        print(row)
    conn.close()
