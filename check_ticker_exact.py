import sqlite3
import os

db_path = 'backend/data/tracker.db'
if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('''
        SELECT h.value, h.shares, h.ticker, f.period_of_report 
        FROM holdings h
        JOIN filings f ON h.accession_number = f.accession_number
        WHERE h.ticker="112585104" OR h.cusip="112585104" 
        ORDER BY f.period_of_report DESC
    ''')
    rows = cursor.fetchall()
    for row in rows:
        print(row)
    conn.close()
