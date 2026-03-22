import requests
import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from services.database import DatabaseManager
from services.sec_client import SECClient
from services.sector_mapper import SectorMapper

class WhaleIndexService:
    """
    Manages the 'Whale Index' - a pre-indexed universe of top institutional funds.
    Calculates quarterly metrics (AUM, Concentration, Sector exposure) for the Screener.
    """
    
    SEC_FILER_LIST_URL = "https://www.sec.gov/files/investment/13f-filer-list.txt"

    def __init__(self, db: DatabaseManager):
        self.db = db
        self.client = SECClient()
        self.sector_mapper = SectorMapper()
        # Mocking for tests
        self.get_market_cap = self._get_market_cap_live

    def fetch_sec_filer_list(self) -> List[Dict]:
        """Downloads and parses the official SEC 13F Filer List."""
        # Note: In a real environment, this text file is positional and tricky.
        # For this version, we provide a placeholder or mock for testing.
        # Actual implementation would use a robust parser.
        try:
            response = requests.get(self.SEC_FILER_LIST_URL, headers=self.client.headers)
            response.raise_for_status()
            # Basic parsing logic here...
            return []
        except Exception as e:
            logging.error(f"Failed to fetch SEC filer list: {e}")
            return []

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
        # These require prior period comparisons
        turnover = 0
        avg_holding_period = 0
        herding_score = 0 # Future implementation
        
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
        Main entry point to sync the top 2,000 whales.
        1. Fetch filer list.
        2. Filter for largest AUM.
        3. Iterate and fetch latest 4 quarters of stats.
        """
        pass # To be implemented in Task 3

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    db = DatabaseManager()
    service = WhaleIndexService(db)
    print("WhaleIndexService initialized.")
