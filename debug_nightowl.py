
import sys
import os
import requests
import logging

# Configure logging to see parser output
logging.basicConfig(level=logging.INFO)

sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.sec_client import SECClient
from services.parser import InfTableParser

# Night Owl Capital Management (0001410633)
# Q3 2025 (Period: 2025-09-30)
# Accession Number (need to find it)

client = SECClient()
parser = InfTableParser()

print("Fetching Night Owl Submissions...")
data = client.get_submissions("0001410633")
filings = data.get('filings', {}).get('recent', {})

limit = 20
found_acc = None
found_period = None

for i in range(len(filings.get('accessionNumber', []))):
    form = filings['form'][i]
    period = filings['reportDate'][i]
    acc = filings['accessionNumber'][i]
    
    # Look for Q3 2025 (approx Sept 30 2025)
    if '13F' in form and '2025-09-30' in period:
        print(f"Found Q3 2025 Filing: {acc} ({form})")
        found_acc = acc
        found_period = period
        break

if found_acc:
    print(f"Downloading XML for {found_acc}...")
    try:
        filename = client.get_xml_filename("0001410633", found_acc)
        url = client.get_filing_url("0001410633", found_acc, filename)
        xml_content = client.download_xml(url)
        
        print(f"Parsing XML (Length: {len(xml_content)})...")
        holdings = parser.parse(xml_content)
        
        print("\n--- HOLDINGS SAMPLE ---")
        if holdings:
            h = holdings[0]
            print(f"Issuer: {h['issuer_name']}")
            print(f"Shares: {h.get('shares', 'MISSING')}") # The parser stored it as 'shares'
            # Wait, the parser logic:
            # final_h['value'] = h['raw_value'] * 1000 if scale_by_1000 else h['raw_value']
            print(f"Value: {h['value']}")
            
            # Reconstruct what happened
            # If shares is 0, the heuristic likely defaulted to scale_by_1000=True
        else:
            print("No holdings found!")
            
    except Exception as e:
        print(f"Error: {e}")
else:
    print("Could not find Q3 2025 filing.")
