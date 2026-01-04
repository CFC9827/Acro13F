import logging
import sys
import os

# Add the current directory to sys.path to find services
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.database import DatabaseManager
from services.orchestrator import Orchestrator

logging.basicConfig(level=logging.INFO)

def test_multi_fetch():
    # Use absolute path for DB
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "tracker.db")
    db = DatabaseManager(db_path=db_path)
    orch = Orchestrator(db)
    cik = "1067983" # Berkshire
    print(f"Testing multi-fetch for CIK {cik}...")
    try:
        res = orch.process_fund(cik, limit=4)
        print("Result:", res)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test_multi_fetch()
