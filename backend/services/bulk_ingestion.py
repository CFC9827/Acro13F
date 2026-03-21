import os
import requests
import zipfile
import io
import csv
from datetime import datetime
from typing import List, Dict, Optional
from .database import DatabaseManager

class BulkIngestor:
    BASE_URL = "https://www.sec.gov/files/dera/data/form-13f-data-sets"
    
    def __init__(self, db: DatabaseManager):
        self.db = db
        self.headers = {
            "User-Agent": "Abrams13F Ingestion Engine (abram@example.com)"
        }

    def download_quarter(self, year: int, quarter: int) -> Optional[io.BytesIO]:
        """Downloads the ZIP for a specific quarter."""
        # Example: https://www.sec.gov/files/dera/data/form-13f-data-sets/2024q3_13f.zip
        url = f"{self.BASE_URL}/{year}q{quarter}_13f.zip"
        print(f"Downloading {url}...")
        
        response = requests.get(url, headers=self.headers)
        if response.status_code == 404:
            print(f"Data set for {year}q{quarter} not found.")
            return None
        response.raise_for_status()
        
        return io.BytesIO(response.content)

    def parse_zip(self, zip_data: io.BytesIO):
        """Extracts and parses the tab-delimited files from the ZIP."""
        with zipfile.ZipFile(zip_data) as z:
            # Files in ZIP: SUBMISSION.txt, COVERPAGE.txt, SUMMARYPAGE.txt, INFOTABLE.txt, etc.
            # We mainly need SUBMISSION.txt (for filings/funds) and INFOTABLE.txt (for holdings)
            
            # 1. Map Accession -> CIK/Period from SUBMISSION.txt
            submission_map = {}
            if "SUBMISSION.txt" in z.namelist():
                with z.open("SUBMISSION.txt") as f:
                    reader = csv.DictReader(io.TextIOWrapper(f, encoding='utf-8'), delimiter='\t')
                    for row in reader:
                        submission_map[row['ACCESSION_NUMBER']] = {
                            'cik': self.db.normalize_cik(row['CIK']),
                            'period': row['REPORT_CALENDAR_OR_AD_HOC_DATE'], # YYYY-MM-DD
                            'name': row['FILER_NAME']
                        }
                        # Save fund to DB
                        self.db.save_fund(row['CIK'], row['FILER_NAME'])
                        # Save filing to DB
                        self.db.save_filing(
                            row['ACCESSION_NUMBER'], 
                            row['CIK'], 
                            row['REPORT_CALENDAR_OR_AD_HOC_DATE'],
                            datetime.now().strftime("%Y-%m-%d") # We don't have exact filing_date here, using today or we can get it from another file if needed
                        )

            # 2. Parse INFOTABLE.txt for holdings
            if "INFOTABLE.txt" in z.namelist():
                print("Parsing INFOTABLE.txt...")
                with z.open("INFOTABLE.txt") as f:
                    reader = csv.DictReader(io.TextIOWrapper(f, encoding='utf-8'), delimiter='\t')
                    
                    # Batch processing to avoid memory issues and speed up DB inserts
                    batch_holdings = {} # acc -> list of holdings
                    count = 0
                    
                    for row in reader:
                        acc = row['ACCESSION_NUMBER']
                        holding = {
                            'issuer_name': row['NAMEOFISSUER'],
                            'cusip': row['CUSIP'],
                            'shares': int(float(row['SHRS_OR_PRN_AMT'])),
                            'value': int(float(row['VALUE'])), # Raw value from CSV
                            'ticker': None, # We'll backfill this
                            'put_call': row.get('PUT_CALL', '').upper() or None
                        }
                        
                        if acc not in batch_holdings:
                            batch_holdings[acc] = []
                        batch_holdings[acc].append(holding)
                        count += 1
                        
                        if count % 10000 == 0:
                            print(f"Processed {count} holdings...")
                            self._flush_holdings(batch_holdings)
                            batch_holdings = {}
                    
                    self._flush_holdings(batch_holdings)
                print(f"Completed ingestion of {count} holdings.")

    def _flush_holdings(self, batch_holdings: Dict[str, List[Dict]]):
        for acc, holdings in batch_holdings.items():
            # Robust Scale Detection for Bulk Ingestion
            # Same logic as parser.py to ensure consistency
            test_prices = []
            for h in holdings:
                if h['shares'] > 0:
                    raw_p = h['value'] / h['shares'] # 'value' here is currently raw from CSV
                    if 0.0001 < raw_p < 10000:
                        test_prices.append(raw_p)
            
            should_scale = True
            if test_prices:
                test_prices.sort()
                median_p = test_prices[len(test_prices)//2]
                if median_p > 2.0:
                    should_scale = False
            
            if should_scale:
                for h in holdings:
                    h['value'] = h['value'] * 1000
            
            self.db.save_holdings(acc, holdings)

if __name__ == "__main__":
    from .database import DatabaseManager
    db = DatabaseManager()
    ingestor = BulkIngestor(db)
    # Test with a recent quarter
    zip_data = ingestor.download_quarter(2024, 3)
    if zip_data:
        ingestor.parse_zip(zip_data)
