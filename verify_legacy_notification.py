import sys
import os
import logging
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.database import DatabaseManager
from services.orchestrator import Orchestrator

# 1. Init
db = DatabaseManager()
orc = Orchestrator(db)

# 2. Process Abrams Bison (0001317588) with deep limit to hit legacy
# Abrams Bison has filings back to 2005.
print('Scanning Abrams Bison for Legacy Skips...')
try:
    # Limit 100 to catch everything
    res = orc.process_fund('0001317588', limit=100, force_refresh_all=True)
    
    print("\n--- RESULT ---")
    print(f"Skipped Legacy Count: {res.get('skipped_legacy')}")
    print(f"Start Date: {res.get('skipped_legacy_start')}")
    print(f"End Date: {res.get('skipped_legacy_end')}")
    print(f"Newly Added (Modern): {len(res.get('newly_added', []))}")
    
except Exception as e:
    print(f"Error: {e}")
