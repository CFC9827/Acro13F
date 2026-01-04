import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.cusip_mapper import CUSIPMapper
import sqlite3

def debug():
    mapper = CUSIPMapper()
    print(f"Total mappings: {len(mapper.mappings)}")
    
    target = '02079K107'
    print(f"Lookup for '{target}': {mapper.get_ticker(target)}")
    
    # Check for Meta
    meta_cusip = '30303M102'
    print(f"Lookup for '{meta_cusip}': {mapper.get_ticker(meta_cusip)}")
    
    # Check database raw value
    conn = sqlite3.connect('backend/data/tracker.db')
    cursor = conn.cursor()
    cursor.execute("SELECT quote(cusip), ticker FROM holdings WHERE cusip LIKE '%02079K107%' LIMIT 1")
    res = cursor.fetchone()
    print(f"Database raw: {res}")
    conn.close()

if __name__ == "__main__":
    debug()
