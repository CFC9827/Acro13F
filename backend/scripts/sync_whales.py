import sys
import os
import logging

# Add the project root to sys.path to import services
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(script_dir, '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from backend.services.database import DatabaseManager
from backend.services.whale_index import WhaleIndexService

def run_sync(limit=20):
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    db = DatabaseManager()
    service = WhaleIndexService(db)
    
    print(f"Starting Whale Index Sync (Limit: {limit})...")
    service.sync_top_whales(limit=limit)
    print("Sync process finished.")

if __name__ == "__main__":
    limit = 20
    if len(sys.argv) > 1:
        limit = int(sys.argv[1])
    run_sync(limit)
