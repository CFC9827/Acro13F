"""
Sector Mapper Service

Maps stock tickers to GICS-like sector classifications.
Uses a CSV database file (sectors.csv) similar to CUSIP.csv for reliable mappings.
"""

import os
import csv
import json
import logging
from typing import Optional

class SectorMapper:
    """
    Maps tickers to sector classifications using sectors.csv database.
    """
    
    # Standard GICS-like sector mappings
    VALID_SECTORS = {
        "Technology", "Healthcare", "Financials", "Consumer Discretionary",
        "Consumer Staples", "Industrials", "Energy", "Materials",
        "Utilities", "Real Estate", "Communication Services", "ETF", "Unknown"
    }
    
    def __init__(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.csv_path = os.path.join(base_dir, "data", "sectors.csv")
        self.fallback_path = os.path.join(base_dir, "data", "sector_fallback.json")
        
        # Load the CSV database (primary source)
        self.sectors_db = self._load_csv()
        
        # Load fallback JSON for additional tickers not in S&P 500
        self.fallback = self._load_json(self.fallback_path) or {}
        
        logging.info(f"SectorMapper loaded {len(self.sectors_db)} tickers from CSV, {len(self.fallback)} from fallback")
        
    def _load_csv(self) -> dict:
        """Load sectors from CSV file."""
        sectors = {}
        if os.path.exists(self.csv_path):
            try:
                with open(self.csv_path, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        ticker = row.get('ticker', '').strip().upper()
                        sector = row.get('sector', '').strip()
                        if ticker and sector:
                            sectors[ticker] = sector
            except Exception as e:
                logging.warning(f"Failed to load {self.csv_path}: {e}")
        return sectors
    
    def _load_json(self, path: str) -> Optional[dict]:
        """Load a JSON file, returning None if it doesn't exist."""
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logging.warning(f"Failed to load {path}: {e}")
        return None
    
    def get_sector(self, ticker: str) -> str:
        """
        Get the sector for a ticker.
        
        Lookup order:
        1. CSV database (S&P 500 + additions)
        2. JSON fallback (additional common tickers)
        3. "Unknown" if not found
        """
        if not ticker:
            return "Unknown"
        
        ticker = ticker.upper().strip()
        
        # Handle share classes (BRK.B -> BRK.B, BRK/B -> BRK.B)
        ticker_normalized = ticker.replace('/', '.')
        
        # 1. Check CSV database
        if ticker in self.sectors_db:
            return self.sectors_db[ticker]
        if ticker_normalized in self.sectors_db:
            return self.sectors_db[ticker_normalized]
        
        # 2. Check fallback
        if ticker in self.fallback:
            return self.fallback[ticker]
        if ticker_normalized in self.fallback:
            return self.fallback[ticker_normalized]
        
        # 3. Fallback to Unknown
        return "Unknown"
    
    def get_sectors_batch(self, tickers: list) -> dict:
        """Get sectors for multiple tickers. Returns dict of ticker -> sector."""
        result = {}
        for ticker in tickers:
            result[ticker] = self.get_sector(ticker)
        return result
    
    def get_cached_count(self) -> int:
        """Return the number of sector mappings available."""
        return len(self.sectors_db) + len(self.fallback)


if __name__ == "__main__":
    # Quick test
    mapper = SectorMapper()
    test_tickers = ["AAPL", "MSFT", "XOM", "JPM", "META", "NVDA", "UNKNOWN_TICKER"]
    print(f"Loaded {mapper.get_cached_count()} sector mappings")
    for t in test_tickers:
        print(f"{t}: {mapper.get_sector(t)}")
