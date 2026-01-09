import json
import os
import csv
from typing import Dict, Optional

class CUSIPMapper:
    """
    Maps 9-digit CUSIPs to stock tickers.
    Uses a local CSV dataset and a cache.
    """
    
    def __init__(self, csv_path: str = None, cache_path: str = None):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        self.csv_path = csv_path or os.path.join(base_dir, "data", "CUSIP.csv")
        self.manual_csv_path = os.path.join(base_dir, "data", "manual_cusip.csv")
        self.cache_path = cache_path or os.path.join(base_dir, "data", "cusip_cache.json")
        self.mappings: Dict[str, str] = {}
        
        # 1. Load core mappings from CSV
        self._load_csv()
        # 2. Load manual overrides (primary priority)
        self._load_manual_csv()
        # 3. Overlay user/dynamic cache
        self._load_cache()
        
        # Static overrides for verified accuracy
        self.manual_mappings = {
            "037833100": "AAPL",
            "594918104": "MSFT",
            "023135106": "AMZN",
            "458140100": "INTC",
            "67066G104": "NVDA",
            "302130109": "XOM",
            "88160R101": "TSLA",
            "060505104": "BAC"
        }
        self.mappings.update(self.manual_mappings)

    def _load_csv(self):
        """Loads mappings from the massive CUSIP.csv reference file."""
        if not os.path.exists(self.csv_path):
            return
            
        try:
            with open(self.csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    cusip = row.get('cusip', '').strip().upper()
                    symbol = row.get('symbol', '').strip().upper()
                    if cusip and symbol:
                        # Normalize CUSIP to 9 digits if it's 8 (some systems strip leading zero)
                        if len(cusip) == 8:
                            cusip = "0" + cusip
                        self.mappings[cusip] = symbol
        except Exception as e:
            import logging
            logging.error(f"Error loading CUSIP CSV at {self.csv_path}: {e}")

    def _load_cache(self):
        if os.path.exists(self.cache_path):
            try:
                with open(self.cache_path, 'r') as f:
                    cache_data = json.load(f)
                    self.mappings.update(cache_data)
            except:
                pass

    def _load_manual_csv(self):
        """Loads mappings from the manual overrides file."""
        if not os.path.exists(self.manual_csv_path):
            return
            
        try:
            with open(self.manual_csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    cusip = row.get('cusip', '').strip().upper()
                    symbol = row.get('symbol', '').strip().upper()
                    if cusip and symbol:
                        if len(cusip) == 8:
                            cusip = "0" + cusip
                        self.mappings[cusip] = symbol
        except Exception as e:
            import logging
            logging.error(f"Error loading Manual CUSIP CSV: {e}")

    def get_ticker(self, cusip: str) -> Optional[str]:
        """Returns the ticker for a given CUSIP."""
        if not cusip:
            return None
            
        # Clean CUSIP (ensure capitalized, no noise)
        clean_cusip = cusip.replace('-', '').replace(' ', '').upper()
        
        # Ensure 9-digit normalization for lookups
        if len(clean_cusip) == 8:
            clean_cusip = '0' + clean_cusip
            
        return self.mappings.get(clean_cusip)

    def add_mapping(self, cusip: str, ticker: str):
        clean_cusip = cusip.replace('-', '').replace(' ', '').upper()
        if len(clean_cusip) == 8:
            clean_cusip = '0' + clean_cusip
            
        mapping_update = {clean_cusip: ticker.upper()}
        self.mappings.update(mapping_update)
        
        # Save to persistent cache
        os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
        current_cache = {}
        if os.path.exists(self.cache_path):
            try:
                with open(self.cache_path, 'r') as f:
                    current_cache = json.load(f)
            except:
                pass
        
        current_cache.update(mapping_update)
        with open(self.cache_path, 'w') as f:
            json.dump(current_cache, f, indent=2)

if __name__ == "__main__":
    # Test
    mapper = CUSIPMapper(csv_path="backend/data/CUSIP.csv", cache_path="backend/data/cusip_cache.json")
    print(f"Ticker for 037833100: {mapper.get_ticker('037833100')}")
    print(f"Total mappings loaded: {len(mapper.mappings)}")
