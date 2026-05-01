import sys
import os
sys.path.append(os.getcwd())
from backend.services.database import DatabaseManager

db = DatabaseManager()
summary = db.get_dashboard_summary()

amzn_activity = summary.get('ticker_fund_activity', {}).get('AMZN', {})
print(f"AMZN Activity: {amzn_activity}")

gaining = summary.get('crowding_signals', {}).get('gaining_funds', [])
amzn_gaining = next((f for f in gaining if f['ticker'] == 'AMZN'), None)
print(f"AMZN Gaining Signal: {amzn_gaining}")

# Check which funds contribute to the +2
for fund in summary['fund_highlights']:
    cik = fund['cik']
    name = fund['name']
    
    # We need to reach into the db to see what happened for this fund
    filings = db._execute("SELECT accession_number, period_of_report FROM filings WHERE cik = ? ORDER BY period_of_report DESC LIMIT 2", (cik,), fetch='all')
    if len(filings) < 2: continue
    
    latest_acc = filings[0]['accession_number']
    prev_acc = filings[1]['accession_number']
    
    latest_h = [h['ticker'] for h in db._execute("SELECT ticker FROM holdings WHERE accession_number = ?", (latest_acc,), fetch='all') if h['ticker']]
    prev_h = [h['ticker'] for h in db._execute("SELECT ticker FROM holdings WHERE accession_number = ?", (prev_acc,), fetch='all') if h['ticker']]
    
    latest_set = set(t.strip().upper() for t in latest_h)
    prev_set = set(t.strip().upper() for t in prev_h)
    
    if 'AMZN' in latest_set and 'AMZN' not in prev_set:
        print(f"Fund {name} ({cik}) is a NEW BUYER of AMZN")
    elif 'AMZN' in latest_set:
        print(f"Fund {name} ({cik}) already held AMZN")
    elif 'AMZN' in prev_set:
         print(f"Fund {name} ({cik}) EXITED AMZN")
