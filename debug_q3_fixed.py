import requests
import json
import sys

# Force utf-8 output for windows console
sys.stdout.reconfigure(encoding='utf-8')

cik = "0001336528"
url = f"http://127.0.0.1:8000/api/funds/{cik}/mimic-performance"

try:
    res = requests.get(url)
    data = res.json()
    trades = data.get('trades', [])
    
    # Q3 '25
    q3_trades = [t for t in trades if "2025-08" in t['date'] or "2025-09" in t['date']]
    
    print(f"--- Q3 '25 Trades ({len(q3_trades)}) ---")
    for t in q3_trades:
        if t['ticker'] == 'GOOGL' or t['ticker'] == 'MKL':
            print(f"--- {t['ticker']} ---")
            print(json.dumps(t, indent=2))

except Exception as e:
    print(f"Error: {e}")
