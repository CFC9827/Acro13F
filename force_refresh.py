import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from backend.services.database import DatabaseManager
from backend.services.orchestrator import Orchestrator
import logging

logging.basicConfig(level=logging.INFO)

db = DatabaseManager(db_path='backend/data/tracker.db')
# Manually override Orchestrator to see more details
class VerboseOrchestrator(Orchestrator):
    def process_fund(self, cik: str, limit: int = None, force_refresh_all: bool = False):
        print(f"Starting verbose process for {cik}...")
        return super().process_fund(cik, limit=limit, force_refresh_all=force_refresh_all)

orc = VerboseOrchestrator(db)

cik = '0001317588' # Alkeon Bison
print(f"Force refreshing filings for {cik}...")
orc.process_fund(cik, limit=100, force_refresh_all=True)
print("Done.")
