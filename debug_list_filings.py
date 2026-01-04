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

print("--- RECENT 13F-HR filings ---")
found = 0
for i in range(len(filings.get('accessionNumber', []))):
    form = filings['form'][i]
    if '13F' in form: # HR or HR/A
        acc = filings['accessionNumber'][i]
        date = filings['reportDate'][i]
        print(f"{acc} | {date} | {form}")
        found += 1
        if found >= 10:
            break
