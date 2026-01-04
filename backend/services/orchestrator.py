from services.sec_client import SECClient
from services.parser import InfTableParser
from services.database import DatabaseManager
from services.cusip_mapper import CUSIPMapper
import logging

class Orchestrator:
    def __init__(self, db_manager: DatabaseManager):
        self.db = db_manager
        self.client = SECClient()
        self.parser = InfTableParser()
        self.mapper = CUSIPMapper()
        
    def process_fund(self, cik: str, limit: int = None, force_refresh_all: bool = False, backfill: bool = False):
        """
        Dynamic flow: 
        - If fund is NEW (no filings in DB) -> pull 10-year history.
        - If fund EXISTS -> scan SEC until we catch up to our last known filing.
        - Amendments (13F-HR/A) have unique accession numbers and will be caught automatically.
        """
        cik = self.db.normalize_cik(cik)
        is_new = not self.db.has_filings(cik)
        
        # Default limit: 40 for new, 100 for scanning existing
        if limit is None:
            limit = 40 if is_new else 100
            
        logging.info(f"Syncing fund CIK: {cik} (is_new={is_new}, limit={limit})")
        
        data = self.client.get_submissions(cik)
        fund_name = data.get('name')
        self.db.save_fund(cik, fund_name)
        
        filings = data.get('filings', {}).get('recent', {})
        count = 0
        consecutive_skips = 0
        newly_added = []
        skipped_legacy_count = 0
        skipped_legacy_dates = []
        verified_existing = 0
        
        for i, form in enumerate(filings.get('form', [])):
            if form in ['13F-HR', '13F-HR/A']:
                accession_number = filings['accessionNumber'][i]
                period_of_report = filings['reportDate'][i]
                filing_date = filings['filingDate'][i]
                
                exists = self.db.filing_exists(accession_number)

                # Skip if already exists (unless we are forcing a full refresh of everything)
                if exists and not force_refresh_all:
                    logging.info(f"Filing {accession_number} for {period_of_report} already exists.")
                    verified_existing += 1
                    consecutive_skips += 1
                    count += 1
                    
                    # Stop if we hit a wall of existing filings (caught up)
                    # BUT if backfill=True (explicit limit provided), we keep scanning to find older gaps.
                    if not is_new and not backfill and consecutive_skips >= 4:
                        logging.info("Caught up with existing history.")
                        break
                        
                    if count >= limit:
                        break
                    continue
                
                # Check for Legacy Filings (Pre-2013-05-20 usually XML starts around here, safe cutoff 2013-01-01)
                # We skip them explicitly to avoid "04" ghost data and parsing errors.
                if str(period_of_report) < "2013-05-01":
                     logging.info(f"Skipping legacy filing {accession_number} ({period_of_report})")
                     skipped_legacy_count += 1
                     skipped_legacy_dates.append(period_of_report)
                     # Don't increment 'count' (limit) for skips? Or do we? 
                     # Usually we want to scan deeper if we skip. 
                     # But if we hit legacy, we might be hitting the end of useful history.
                     limit += 1 # Extend limit to find more modern ones if needed
                     continue

                # New filing found or force_refresh_all
                consecutive_skips = 0
                logging.info(f"Processing NEW filing: {accession_number}")
                
                try:
                    filename = self.client.get_xml_filename(cik, accession_number)
                    url = self.client.get_filing_url(cik, accession_number, filename)
                    xml_data = self.client.download_xml(url)
                    holdings = self.parser.parse(xml_data)
                    
                    for h in holdings:
                        h['ticker'] = self.mapper.get_ticker(h['cusip'])
                        
                    self.db.save_filing(accession_number, cik, period_of_report, filing_date)
                    self.db.save_holdings(accession_number, holdings)
                    
                    newly_added.append({"period": period_of_report, "count": len(holdings)})
                except Exception as e:
                    logging.error(f"Failed to process filing {accession_number}. Error: {e}")
                
                count += 1
                if count >= limit:
                    break
        
        logging.info(f"Sync complete for {fund_name}. Added: {len(newly_added)}, Verified: {verified_existing}")
        
        return {
            "status": "success",
            "fund_name": fund_name,
            "cik": cik,
            "newly_added": newly_added,
            "newly_added": newly_added,
            "verified_count": verified_existing,
            "skipped_legacy": skipped_legacy_count,
            "skipped_legacy_start": min(skipped_legacy_dates) if skipped_legacy_dates else None,
            "skipped_legacy_end": max(skipped_legacy_dates) if skipped_legacy_dates else None,
            "is_new": is_new
        }

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    db = DatabaseManager(db_path="backend/data/tracker.db")
    orch = Orchestrator(db)
    # Alkeon Capital
    try:
        res = orch.process_fund("1410833")
        print(res)
    except Exception as e:
        print(f"Error: {e}")
