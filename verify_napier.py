import sys
import os
import logging
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.database import DatabaseManager
from services.orchestrator import Orchestrator
import sqlite3

# 1. Clear DB
db_path = 'backend/data/tracker.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('DELETE FROM holdings')
    c.execute('DELETE FROM filings')
    c.execute('DELETE FROM funds')
    conn.commit()
    conn.close()
    print('DB Cleared.')

# 2. Sync Napier Park (0001410833)
print('Syncing Napier Park...')
try:
    db = DatabaseManager()
    orc = Orchestrator(db)
    orc.process_fund('0001410833', limit=10)
    print('Sync Complete.')
except Exception as e:
    print(f"Sync Failed: {e}")
    import traceback
    traceback.print_exc()

# 3. Check Value
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute("SELECT h.value, h.shares, h.issuer_name, f.period_of_report FROM holdings h JOIN filings f ON h.accession_number = f.accession_number WHERE f.period_of_report LIKE '2025%' ORDER BY h.value DESC LIMIT 1")
row = c.fetchone()
if row:
    print(f'Top Holding ({row[3]}): {row[2]}')
    print(f'Shares: {row[1]}')
    print(f'Value: {row[0]}') # Should be millions, not billions
else:
    print('No 2025 holdings found.')
conn.close()
