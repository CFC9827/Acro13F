import requests
import json

cik = "0001336528"
url = f"http://127.0.0.1:8000/api/funds/{cik}/mimic-performance"

try:
    res = requests.get(url)
    data = res.json()
    series = data.get('series', [])
    trades = data.get('trades', [])
    
    if not series:
        print("No series found")
        exit()

    first_fund_val = series[0]['portfolio_value']
    user_initial = 10000.0
    ratio0 = user_initial / first_fund_val
    
    print(f"Fund Start Value: ${first_fund_val:,.2f}")
    print(f"Initial Ratio: {ratio0:.10f}")
    
    # Check for the TRUP position jump ($61k issue)
    # TRUP CUSIP: 112585104
    print("\n--- Problematic Position Check ---")
    trup_trades = [t for t in trades if t['ticker'] in ['TRUP', '112585104', '89778L108']]
    for t in trup_trades:
        user_val = t['value'] * ratio0
        print(f"TRUP Trade: Date={t['date']}, Price={t['price']:.2f}, Fund Val=${t['value']:,.2f}, User Val=${user_val:,.2f}")
        if t['price'] > 5000:
            print("!!! WARNING: PRICE STILL TOO HIGH !!!")

    print("\n--- Random Trade Sample (User Scale) ---")
    for t in trades[:10]:
        user_val = t['value'] * ratio0
        print(f"{t['date']} | {t['ticker']:<10} | {t['action']:<7} | Fund:${t['value']:>15,.0f} | User:${user_val:>10,.2f}")
        if user_val > 50000: # For a 10k account, a 50k trade is an explosion
            print(f"!!! ALERT: EXECUTABLE VALUE TOO HIGH: ${user_val:,.2f}")

except Exception as e:
    print(f"Error: {e}")
