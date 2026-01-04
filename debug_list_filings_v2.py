import sys
import os
import requests
import logging

sys.path.append(os.path.join(os.getcwd(), 'backend'))
from services.sec_client import SECClient

client = SECClient()
cik = "0001410633"

print(f"Fetching Submissions for {cik}...")
data = client.get_submissions(cik)
filings = data.get('filings', {}).get('recent', {})

dates = filings.get('reportDate', [])
if dates:
    print(f"Latest Date in 'recent': {dates[0]}")
    print(f"Oldest Date in 'recent': {dates[-1]}")
    print(f"Total entries: {len(dates)}")
else:
    print("No recent filings found.")

# List forms carefully
print("\n--- Scanning for 13F ---")
for i, form in enumerate(filings.get('form', [])):
    if '13F' in form:
        print(f"Found {form} at index {i}: {filings['accessionNumber'][i]} ({filings['reportDate'][i]})")

# Check if there are other files?
other_files = data.get('filings', {}).get('files', [])
print(f"\nOther File Lists: {other_files}")
