from backend.services.database import DatabaseManager
from backend.services.cusip_mapper import CUSIPMapper
import logging

def backfill_tickers():
    logging.basicConfig(level=logging.INFO)
    db = DatabaseManager(db_path="backend/backend/data/tracker.db")
    mapper = CUSIPMapper()
    
    print(f"Loaded {len(mapper.mappings)} mappings from CSV.")
    
    with db._get_connection() as conn:
        cursor = conn.cursor()
        
        # Find all unique CUSIPs that don't have a ticker or have an empty ticker
        cursor.execute("SELECT DISTINCT cusip FROM holdings WHERE ticker IS NULL OR ticker = ''")
        missing = cursor.fetchall()
        
        print(f"Found {len(missing)} unique CUSIPs missing tickers.")
        
        updates = 0
        for (cusip,) in missing:
            ticker = mapper.get_ticker(cusip)
            if ticker:
                conn.execute(
                    "UPDATE holdings SET ticker = ? WHERE cusip = ? AND (ticker IS NULL OR ticker = '')",
                    (ticker, cusip)
                )
                updates += 1
                if updates % 100 == 0:
                    print(f"Updated {updates} tickers...")
        
        conn.commit()
        print(f"Backfill complete. Updated {updates} tickers for missing CUSIPs.")

if __name__ == "__main__":
    backfill_tickers()
