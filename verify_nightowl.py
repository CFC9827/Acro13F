import sys
import os
import logging
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.database import DatabaseManager
from services.orchestrator import Orchestrator
import sqlite3

# 1. Clear DB (ensure no overlap)
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

# 2. Sync Night Owl (0001410633)
print('Syncing Night Owl...')
try:
    db = DatabaseManager()
    orc = Orchestrator(db)
    # Use larger limit and force refresh to be safe
    # Q3 2025 should be very recent (top of list)
    orc.process_fund('0001410633', limit=20, force_refresh_all=True)
    print('Sync Complete.')
except Exception as e:
    print(f"Sync Failed: {e}")
    import traceback
    traceback.print_exc()

# 3. Check Holdings
conn = sqlite3.connect(db_path)
c = conn.cursor()

# Get ANY recent holding
c.execute("SELECT h.value, h.shares, h.issuer_name, f.period_of_report FROM holdings h JOIN filings f ON h.accession_number = f.accession_number ORDER BY f.period_of_report DESC, h.value DESC LIMIT 5")
rows = c.fetchall()

if rows:
    print(f"\n--- Found {len(rows)} Holdings sample ---")
    for r in rows:
        print(f"Period: {r[3]} | Issuer: {r[2]} | Shares: {r[1]} | Value: {r[0]}")
        # Value check: Alphabet should be ~77M (77,000,000), not 77B
else:
    print('No holdings found at all.')

conn.close()
