"""Re-fetch affected Q4'24 filings for Pershing Square after parser fix."""
import sys
sys.path.insert(0, '.')
import sqlite3
from services.database import DatabaseManager
from services.orchestrator import Orchestrator
import logging

logging.basicConfig(level=logging.INFO)

db = DatabaseManager()
cik = '0001336528'

# First, delete the Q4'24 filings that have bad data
print("Deleting Q4'24 filings with bad data...")
conn = sqlite3.connect('data/tracker.db')
c = conn.cursor()

# Get Q4'24 accession numbers
c.execute("""
    SELECT accession_number FROM filings 
    WHERE cik = ? AND period_of_report = '2024-12-31'
""", (cik,))
q4_filings = [row[0] for row in c.fetchall()]
print(f"Found {len(q4_filings)} Q4'24 filings to delete: {q4_filings}")

# Delete holdings for these filings
for acc in q4_filings:
    c.execute("DELETE FROM holdings WHERE accession_number = ?", (acc,))
    c.execute("DELETE FROM filings WHERE accession_number = ?", (acc,))
    print(f"  Deleted: {acc}")

conn.commit()
conn.close()

# Now re-fetch using orchestrator which will re-parse with fixed heuristic
print("\nRe-fetching Q4'24 filings...")
orch = Orchestrator(db)
result = orch.process_fund(cik, limit=10, force_refresh_all=False)
print(f"\nResult: {result}")
