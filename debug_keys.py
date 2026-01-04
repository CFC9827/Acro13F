import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.cusip_mapper import CUSIPMapper

def debug():
    mapper = CUSIPMapper()
    print(f"Total mappings: {len(mapper.mappings)}")
    
    # Print first few mappings
    keys = sorted(list(mapper.mappings.keys()))
    print(f"First 10 keys: {keys[:10]}")
    
    # Search by ticker value
    matches_goog = [k for k, v in mapper.mappings.items() if 'GOOG' in v]
    print(f"Keys matching GOOG: {matches_goog}")
    for k in matches_goog:
        print(f"  {k}: {mapper.mappings[k]}")

    # Search for Meta specifically
    matches_meta = [k for k, v in mapper.mappings.items() if 'META' in v]
    print(f"Keys matching META: {matches_meta}")

if __name__ == "__main__":
    debug()
