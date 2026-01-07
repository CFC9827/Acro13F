"""Test amendment fix - verify get_historical_holdings returns correct data."""
import sys
sys.path.insert(0, '.')
from services.database import DatabaseManager

db = DatabaseManager()
cik = '0001336528'  # Pershing Square

# Get historical holdings with the fix
holdings = db.get_historical_holdings(cik)

# Group by period to check for duplicates
periods = {}
for h in holdings:
    p = h['period_of_report']
    if p not in periods:
        periods[p] = {'count': 0, 'total_value': 0}
    periods[p]['count'] += 1
    periods[p]['total_value'] += h['value']

print("Pershing Square Holdings by Period (after fix):")
print("-" * 70)
sorted_periods = sorted(periods.keys(), reverse=True)[:10]
for p in sorted_periods:
    data = periods[p]
    print(f"{p}: {data['count']:3} holdings, Total: ${data['total_value']/1000000:.0f}M")

# Verify Q4'24 is not duplicated
print("\n" + "=" * 70)
q4_24_value = periods.get('2024-12-31', {}).get('total_value', 0) / 1000000
print(f"Q4'24 Total Value: ${q4_24_value:.0f}M")
if q4_24_value > 20000:  # Should be ~$10-15B, not $60B+
    print("WARNING: Q4'24 value still looks too high! Fix may not be working.")
else:
    print("SUCCESS: Q4'24 value looks reasonable (not doubled).")
