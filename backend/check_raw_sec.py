"""Fetch and examine raw SEC XML for the Q4'24 amendment."""
import sys
sys.path.insert(0, '.')
from services.sec_client import SECClient

client = SECClient()
cik = '1336528'

# Get the amendment accession number (most recent Q4'24)
data = client.get_submissions(cik)
filings = data.get('filings', {}).get('recent', {})

# Find Q4'24 filings
q4_filings = []
for i, form in enumerate(filings.get('form', [])):
    if form in ['13F-HR', '13F-HR/A']:
        report_date = filings['reportDate'][i]
        if report_date == '2024-12-31':
            q4_filings.append({
                'accession': filings['accessionNumber'][i],
                'filing_date': filings['filingDate'][i],
                'form': form
            })

print(f"Found {len(q4_filings)} Q4'24 filings:")
for f in q4_filings:
    print(f"  {f['filing_date']} | {f['form']} | {f['accession']}")

# Get the most recent one (amendment)
if q4_filings:
    latest = sorted(q4_filings, key=lambda x: x['filing_date'], reverse=True)[0]
    print(f"\nFetching XML for: {latest['accession']}")
    
    try:
        filename = client.get_xml_filename(cik, latest['accession'])
        url = client.get_filing_url(cik, latest['accession'], filename)
        print(f"URL: {url}")
        
        xml_data = client.download_xml(url)
        print(f"\nRaw XML (first 2000 chars):")
        print(xml_data[:2000])
    except Exception as e:
        print(f"Error: {e}")
