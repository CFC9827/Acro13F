import requests
import json

cik = "0001336528"
url = f"http://127.0.0.1:8000/api/funds/{cik}/mimic-performance"

try:
    res = requests.get(url)
    data = res.json()
    series = data.get('series', [])
    
    if not series:
        print("No series found")
        exit()

    for s in series:
        # Check Q2 '25 specifically if it exists
        if "2025" in s['date']:
            total_val = s['portfolio_value']
            detailed = s.get('holdings_detailed', [])
            sum_calc = sum(h['value'] for h in detailed)
            print(f"Date: {s['date']} | Reported: ${total_val:,.0f} | Sum: ${sum_calc:,.0f} | Positions: {len(detailed)}")
            
            # Show top positions to see which ones are tiny
            detailed.sort(key=lambda x: x['value'], reverse=True)
            for h in detailed[:5]:
                print(f"  {h['ticker']}: {h['shares']:,} sh @ ${h['price']:.2f} = ${h['value']:,.0f}")
except Exception as e:
    print(f"Error: {e}")
