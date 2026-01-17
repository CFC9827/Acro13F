import requests
import json

cik = "0001336528"
url = f"http://127.0.0.1:8000/api/funds/{cik}/mimic-performance"

try:
    res = requests.get(url)
    data = res.json()
    trades = data.get('trades', [])
    
    # Q3 '25 (2025-08-14 or similar)
    q3_trades = [t for t in trades if "2025-08" in t['date'] or "2025-09" in t['date']]
    
    print(f"--- Q3 '25 Trades ({len(q3_trades)}) ---")
    for t in q3_trades:
        # Check specific fields relevant to the bug
        u_val = t.get('user_value')
        u_shares = t.get('user_shares')
        val = t.get('value')
        is_cap = t.get('isCapitalDeployment')
        is_ctx = t.get('isContext')
        
        print(f"[{t['ticker']}] Action:{t['action']} Cap:{is_cap} Ctx:{is_ctx} | Val:{val} UserVal:{u_val} UserShares:{u_shares}")

except Exception as e:
    print(f"Error: {e}")
