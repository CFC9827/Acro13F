import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

from backend.services.database import DatabaseManager
from backend.services.mimic_performance import MimicPerformanceCalculator
import json

def test_dorsey():
    db = DatabaseManager()
    calc = MimicPerformanceCalculator(db)
    
    # Dorsey CIK
    cik = "0001671657" 
    
    print(f"Calculating mimic performance for {cik}...")
    result = calc.get_mimic_performance(cik)
    
    if "error" in result:
        print(f"Error: {result['error']}")
        return

    trades = result.get("trades", [])
    print(f"Total Trades Logged: {len(trades)}")
    
    if len(trades) > 0:
        print("First 3 trades:")
        for t in trades[:3]:
            print(t)
    else:
        print("WARNING: No trades found.")
        
        # Debugging: check series length
        print(f"Series length: {len(result['series'])}")
        
if __name__ == "__main__":
    test_dorsey()
