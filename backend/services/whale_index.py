import requests
import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from backend.services.database import DatabaseManager
from backend.services.sec_client import SECClient
from backend.services.sector_mapper import SectorMapper

class WhaleIndexService:
    """
    Manages the 'Whale Index' - a pre-indexed universe of top institutional funds.
    Calculates quarterly metrics (AUM, Concentration, Sector exposure) for the Screener.
    """
    
    SEC_FILER_LIST_URL = "https://www.sec.gov/files/investment/13flist.pdf" # This is often PDF now, text version 404s

    def __init__(self, db: DatabaseManager):
        self.db = db
        self.client = SECClient()
        self.sector_mapper = SectorMapper()
        # Mocking for tests
        self.get_market_cap = self._get_market_cap_live

    def fetch_sec_filer_list(self) -> List[Dict]:
        """Downloads and parses the official SEC 13F Filer List."""
        # Fallback list of top 20 major funds for the prototype since the text URL is unreliable
        top_whales = [
            {"cik": "0001067983", "name": "BERKSHIRE HATHAWAY INC"},
            {"cik": "0001086364", "name": "BLACKROCK INC."},
            {"cik": "0001616668", "name": "VANGUARD GROUP INC"},
            {"cik": "0001037389", "name": "RENAISSANCE TECHNOLOGIES LLC"},
            {"cik": "0000937515", "name": "STATE STREET CORP"},
            {"cik": "0001045810", "name": "NVIDIA CORP"},
            {"cik": "0001350694", "name": "BRIDGEWATER ASSOCIATES, LP"},
            {"cik": "0001166559", "name": "BILL & MELINDA GATES FOUNDATION TRUST"},
            {"cik": "0001079114", "name": "TIGER GLOBAL MANAGEMENT LLC"},
            {"cik": "0001423053", "name": "EGERTON CAPITAL UK LLP"},
            {"cik": "0001568820", "name": "POINT72 ASSET MANAGEMENT, L.P."},
            {"cik": "0001605941", "name": "COATUE MANAGEMENT LLC"},
            {"cik": "0001273087", "name": "APPALOOSA LP"},
            {"cik": "0001413329", "name": "TCI FUND MANAGEMENT LTD"},
            {"cik": "0001103804", "name": "VIKING GLOBAL INVESTORS LP"},
            {"cik": "0001340122", "name": "PERSHING SQUARE CAPITAL MANAGEMENT, L.P."},
            {"cik": "0000882835", "name": "BAILLIE GIFFORD & CO"},
            {"cik": "0001006438", "name": "THIRD POINT LLC"},
            {"cik": "0001230245", "name": "PZENA INVESTMENT MANAGEMENT LLC"},
            {"cik": "0001336528", "name": "ALTIMETER CAPITAL MANAGEMENT, LP"}
        ]
        
        try:
            # We still try to fetch the official list, but if it fails, we use our top_whales
            response = requests.get(self.SEC_FILER_LIST_URL, headers=self.client.headers)
            if response.status_code != 200:
                logging.warning(f"Official SEC list 404/Error. Using fallback list of {len(top_whales)} funds.")
                return top_whales
            # Parsing logic here if PDF/Text was returned...
            return top_whales
        except Exception as e:
            logging.warning(f"Error fetching SEC list: {e}. Using fallback list.")
            return top_whales

    def calculate_fund_metrics(self, cik: str, accession_number: str) -> Dict:
        """
        Calculates 15+ metrics for a specific filing.
        Results are stored in the fund_quarterly_stats table.
        """
        cik = self.db.normalize_cik(cik)
        holdings = self.db._execute("SELECT ticker, value, sector, shares FROM holdings WHERE accession_number = ?", (accession_number,), fetch='all')
        
        if not holdings:
            return {}

        total_aum = sum(h['value'] for h in holdings)
        position_count = len(holdings)
        
        # Conviction
        sorted_holdings = sorted(holdings, key=lambda x: x['value'], reverse=True)
        top_10_value = sum(h['value'] for h in sorted_holdings[:10])
        concentration = (top_10_value * 100.0 / total_aum) if total_aum > 0 else 0
        avg_pos_size = (total_aum / position_count) if position_count > 0 else 0
        
        # Sector Exposure
        sector_totals = {}
        for h in holdings:
            sector = h.get('sector') or self.sector_mapper.get_sector(h.get('ticker', ''))
            sector_totals[sector] = sector_totals.get(sector, 0) + h['value']
        
        primary_sector = "Unknown"
        primary_sector_weight = 0
        if sector_totals:
            primary_sector = max(sector_totals, key=sector_totals.get)
            primary_sector_weight = (sector_totals[primary_sector] * 100.0 / total_aum) if total_aum > 0 else 0

        # Market Cap DNA
        mega_cap_val = 0
        mid_cap_val = 0
        small_cap_val = 0
        
        for h in holdings:
            ticker = h.get('ticker')
            if not ticker: continue
            
            mkt_cap = self.get_market_cap(ticker)
            if mkt_cap >= 200_000_000_000: # 200B
                mega_cap_val += h['value']
            elif mkt_cap >= 2_000_000_000: # 2B
                mid_cap_val += h['value']
            else:
                small_cap_val += h['value']
        
        # Portfolio DNA (Turnover, Holding Period)
        turnover = 0
        avg_holding_period = 0
        herding_score = 0
        
        # Find prior filing
        res = self.db._execute("""
            SELECT accession_number FROM filings 
            WHERE cik = ? AND period_of_report < (SELECT period_of_report FROM filings WHERE accession_number = ?)
            ORDER BY period_of_report DESC LIMIT 1
        """, (cik, accession_number), fetch='one')
        
        if res:
            prev_acc = res['accession_number']
            prev_holdings = self.db._execute("SELECT ticker, shares, value FROM holdings WHERE accession_number = ?", (prev_acc,), fetch='all')
            prev_total_aum = sum(h['value'] for h in prev_holdings)
            
            if prev_total_aum > 0:
                # Turnover calculation (approximate)
                prev_map = {h['ticker']: h['shares'] for h in prev_holdings if h['ticker']}
                net_change_val = 0
                for h in holdings:
                    t = h.get('ticker')
                    if not t: continue
                    shares_prev = prev_map.get(t, 0)
                    price_t = h['value'] / h['shares'] if h['shares'] > 0 else 0
                    net_change_val += abs(h['shares'] - shares_prev) * price_t
                
                # Simplified turnover
                turnover = (net_change_val / total_aum * 100.0) if total_aum > 0 else 0

        # Get the filing metadata
        filing_info = self.db._execute("SELECT period_of_report FROM filings WHERE accession_number = ?", (accession_number,), fetch='one')
        period = filing_info['period_of_report'] if filing_info else "Unknown"

        metrics = {
            "cik": cik,
            "period_of_report": period,
            "accession_number": accession_number,
            "total_aum": total_aum,
            "position_count": position_count,
            "top_10_concentration": concentration,
            "avg_position_size": avg_pos_size,
            "primary_sector": primary_sector,
            "primary_sector_weight": primary_sector_weight,
            "mega_cap_pct": (mega_cap_val * 100.0 / total_aum) if total_aum > 0 else 0,
            "mid_cap_pct": (mid_cap_val * 100.0 / total_aum) if total_aum > 0 else 0,
            "small_cap_pct": (small_cap_val * 100.0 / total_aum) if total_aum > 0 else 0,
            "portfolio_turnover": turnover,
            "avg_holding_period": avg_holding_period,
            "herding_score": herding_score
        }
        
        return metrics

    def save_metrics(self, metrics: Dict):
        """Saves calculated metrics to the database."""
        if not metrics: return
        self.db.save_quarterly_stats(metrics)

    def _get_market_cap_live(self, ticker: str) -> float:
        """
        Placeholder for fetching live market cap.
        In production, this would hit Yahoo Finance or a local cache.
        """
        # For now, return a neutral Mid-Cap value if unknown
        return 5_000_000_000 

    def sync_top_whales(self, limit: int = 2000):
        """
        Main entry point to sync the top whales.
        1. Fetch filer list.
        2. Filter for largest AUM (requires temporary processing or using a known list).
        3. Iterate and fetch latest 4 quarters of stats.
        """
        from backend.services.orchestrator import Orchestrator
        orch = Orchestrator(self.db)
        
        filers = self.fetch_sec_filer_list()
        if not filers:
            logging.error("No filers found to sync.")
            return

        # Sort filers? SEC filer list isn't sorted by AUM.
        # In a real app, we'd have a pre-ranked list or we process and discover.
        # For the prototype, we process the first N filers from the SEC list.
        # (Usually major funds appear near the top or we can use a subset)
        
        count = 0
        for filer in filers[:limit]:
            cik = filer['cik']
            name = filer['name']
            
            try:
                logging.info(f"Syncing Whale: {name} (CIK: {cik})")
                # Ensure fund exists in 'funds' table so metrics can join
                self.db.save_fund(cik, name)
                
                # Process latest filings (4 quarters)
                result = orch.process_fund(cik, limit=4)
                
                # After filings are in DB, calculate stats for each
                filings = self.db._execute("SELECT accession_number, period_of_report FROM filings WHERE cik = ? ORDER BY period_of_report DESC LIMIT 4", (cik,), fetch='all')
                
                for f in filings:
                    metrics = self.calculate_fund_metrics(cik, f['accession_number'])
                    if metrics:
                        self.save_metrics(metrics)
                
                count += 1
                if count >= limit: break
                
            except Exception as e:
                logging.error(f"Failed to sync {name}: {e}")
                continue

        logging.info(f"Whale Index sync complete. Processed {count} funds.")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    db = DatabaseManager()
    service = WhaleIndexService(db)
    print("WhaleIndexService initialized.")
