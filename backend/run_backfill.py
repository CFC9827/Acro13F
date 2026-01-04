from services.database import DatabaseManager
from services.cusip_mapper import CUSIPMapper
import logging

def run_backfill():
    logging.basicConfig(level=logging.INFO)
    db = DatabaseManager()
    mapper = CUSIPMapper()
    
    print(f"Loaded {len(mapper.mappings)} mappings from {mapper.csv_path}")
    count = db.backfill_tickers(mapper.get_ticker)
    print(f"Successfully backfilled {count} tickers in the database.")

if __name__ == "__main__":
    run_backfill()
