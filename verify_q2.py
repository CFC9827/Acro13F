import requests
import json

cik = "0001336528"
url = f"http://127.0.0.1:8000/api/funds/{cik}/mimic-performance"

try:
    res = requests.get(url)
    data = res.json()
    series = data.get('series', [])
    trades = data.get('trades', [])
    
    # Q2 '25 (approximate date range)
    target_date = "2025-05" # Looking for Q2 filing
    
    # Find the ratio for the period containing BN/TRUP trades
    q2_point = next((s for s in series if "2025-05" in s['date'] or "2025-06" in s['date']), series[0])
    fund_val = q2_point['portfolio_value']
    user_initial = 10000.0
    # The actual user value at that point is needed for the ratio
    # but for a quick sanity check, let's use the fund start value ratio
    ratio = user_initial / series[0]['portfolio_value']
    
    print(f"Period Date: {q2_point['date']}")
    print(f"Fund Portfolio Value: ${fund_val:,.2f}")
    
    q2_trades = [t for t in trades if "2025-05" in t['date'] or "2025-06" in t['date']]
    print(f"\n--- Q2 '25 Trade Instructions (User Scale ~$10k) ---")
    q2_trades.sort(key=lambda x: x['value'], reverse=True)
    for t in q2_trades[:20]:
        user_val = t['value'] * ratio
        print(f"{t['ticker']:<15} | {t['action']:<7} | Fund:${t['value']:>15,.0f} | User:${user_val:>10,.2f}")
        
except Exception as e:
    print(f"Error: {e}")
