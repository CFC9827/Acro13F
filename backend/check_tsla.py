import requests

# Get holdings history from the API
resp = requests.get("http://localhost:8000/funds/0001730145/history")
data = resp.json()

# Check Q3 2025 data
q3_data = [h for h in data if h.get('period_of_report') == '2025-09-30']

print(f"Q3 2025 holdings: {len(q3_data)}")

# Check period_filings from first holding
first = q3_data[0]
period_filings = first.get('period_filings', [])
print(f"\nperiod_filings: {len(period_filings)} filings")
for f in period_filings:
    label = "AMENDMENT" if f.get('is_amendment') else "ORIGINAL"
    print(f"  {f['accession_number']} ({label})")
