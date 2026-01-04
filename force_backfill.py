import sys
import os
import sqlite3
import logging

# Ensure we can import from backend
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.database import DatabaseManager
from services.cusip_mapper import CUSIPMapper

def run_backfill():
    logging.basicConfig(level=logging.INFO)
    db_path = "backend/backend/data/tracker.db"
    print(f"Targeting DB: {db_path}")
    
    db = DatabaseManager(db_path=db_path)
    mapper = CUSIPMapper()
    
    print(f"Loaded {len(mapper.mappings)} mappings from CSV.")
    
    with db._get_connection() as conn:
        cursor = conn.cursor()
        
        # Find all unique CUSIPs
        cursor.execute("SELECT DISTINCT cusip FROM holdings")
        all_cusips = cursor.fetchall()
        
        print(f"Found {len(all_cusips)} unique CUSIPs in database.")
        
        updates = 0
        for (cusip,) in all_cusips:
            if not cusip: continue
            
            ticker = mapper.get_ticker(cusip)
            if ticker:
                # Update ALL holdings with this CUSIP
                cursor.execute(
                    "UPDATE holdings SET ticker = ? WHERE cusip = ?",
                    (ticker, cusip)
                )
                updates += cursor.rowcount
        
        conn.commit()
        print(f"Backfill complete. Updated {updates} records.")

if __name__ == "__main__":
    run_backfill()
