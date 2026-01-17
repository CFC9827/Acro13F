import logging
from datetime import datetime
from typing import List, Dict
from .prices import get_historical_prices
from .benchmark import get_benchmark_data

logger = logging.getLogger(__name__)

class MimicPerformanceCalculator:
    def __init__(self, db):
        self.db = db

    def get_mimic_performance(self, cik: str) -> Dict:
        """
        Calculates performance by simulating buys/sells at the time of 13F filing.
        """
        history = self.db.get_historical_holdings(cik)
        if not history:
            return {"error": "No historical data found"}

        # Group by filing (accession_number)
        filings_map = {}
        for h in history:
            acc = h['filing_accession']
            if acc not in filings_map:
                filings_map[acc] = {
                    'period': h['period_of_report'],
                    'filing_date': h['filing_date'],
                    'holdings': []
                }
            filings_map[acc]['holdings'].append(h)

        # Sort filings by filing_date
        sorted_accs = sorted(filings_map.keys(), key=lambda x: filings_map[x]['filing_date'])
        
        if len(sorted_accs) < 2:
            return {"error": "Not enough filings to calculate performance"}

        # Simulation
        # 1. Identify all unique tickers to pre-fetch prices
        all_tickers = set()
        for f in filings_map.values():
            for h in f['holdings']:
                symbol = h['ticker'] or h['cusip']
                if symbol:
                    all_tickers.add(symbol)
        
        # 2. Pre-fetch all prices into a local cache
        # We use the first filing's date as the absolute start for history
        abs_start = filings_map[sorted_accs[0]]['filing_date']
        price_cache = {}
        logger.info(f"Pre-fetching prices for {len(all_tickers)} unique tickers for CIK {cik}")
        for ticker in all_tickers:
            price_cache[ticker] = get_historical_prices(ticker, self.db, abs_start)

        mimic_series = []
        trades_log = []
        
        # Initial state
        first_filing = filings_map[sorted_accs[0]]
        current_holdings = { (h['ticker'] or h['cusip']): h['shares'] for h in first_filing['holdings'] if h['shares'] > 0 }
        
        # Initial point
        mimic_series.append({
            "date": first_filing['filing_date'],
            "period": first_filing['period'],
            "return": 0.0,
            "label": "Initial Filing"
        })

        cumulative_return = 1.0 # 1.0 = 100%
        
        for i in range(1, len(sorted_accs)):
            prev_filing = filings_map[sorted_accs[i-1]]
            curr_filing = filings_map[sorted_accs[i]]
            
            p_date = prev_filing['filing_date']
            c_date = curr_filing['filing_date']
            
            tickers = list(current_holdings.keys())
            if not tickers:
                period_return = 0.0
            else:
                period_returns = []
                for ticker in tickers:
                    prices = price_cache.get(ticker, [])
                    if not prices: continue
                    
                    # Find price on or after p_date
                    start_price = next((p['price'] for p in prices if p['date'] >= p_date), None)
                    if not start_price: continue
                    
                    # Find price on or before c_date
                    end_price = next((p['price'] for p in reversed(prices) if p['date'] <= c_date), None)
                    if not end_price:
                        end_price = start_price
                        
                    shares = current_holdings[ticker]
                    period_returns.append({
                        "ticker": ticker,
                        "start_val": shares * start_price,
                        "end_val": shares * end_price
                    })
                
                total_start_val = sum(v['start_val'] for v in period_returns)
                total_end_val = sum(v['end_val'] for v in period_returns)
                
                if total_start_val > 0:
                    period_return = (total_end_val / total_start_val) - 1
                else:
                    period_return = 0.0
            
            cumulative_return *= (1 + period_return)
            
            mimic_series.append({
                "date": c_date,
                "period": curr_filing['period'],
                "return": (cumulative_return - 1.0) * 100.0,
                "label": f"Filing {curr_filing['period']}"
            })
            
            # Rebalance Logic & Trade Logging
            # Compare current_holdings (what we held coming into this date)
            # vs curr_filing (what we want to hold going forward)
            
            target_holdings_map = { (h['ticker'] or h['cusip']): h['shares'] for h in curr_filing['holdings'] if h['shares'] > 0 }
            
            all_involved_tickers = set(current_holdings.keys()) | set(target_holdings_map.keys())
            
            for ticker in all_involved_tickers:
                old_shares = current_holdings.get(ticker, 0)
                new_shares = target_holdings_map.get(ticker, 0)
                
                if old_shares == new_shares:
                    continue
                    
                diff = new_shares - old_shares
                action = ""
                
                if old_shares == 0 and new_shares > 0:
                    action = "Buy"
                elif old_shares > 0 and new_shares == 0:
                    action = "Sell"
                elif diff > 0:
                    action = "Add"
                else:
                    action = "Reduce"
                
                # Execution Price on c_date
                exec_price = 0.0
                prices = price_cache.get(ticker, [])
                if prices:
                    # Find price on or before c_date (the filing date)
                    found_price = next((p['price'] for p in reversed(prices) if p['date'] <= c_date), None)
                    if found_price:
                        exec_price = found_price
                
                # If no price found, we can't estimate value perfectly, but we log the trade
                value_traded = abs(diff) * exec_price
                
                trades_log.append({
                    "date": c_date,
                    "period": curr_filing['period'], # The filing that triggered this trade
                    "ticker": ticker,
                    "action": action,
                    "shares_change": diff,
                    "price": exec_price,
                    "value": value_traded
                })

            # Update holdings for next period
            current_holdings = target_holdings_map

        # Get benchmark data for comparison
        benchmark = get_benchmark_data(mimic_series[0]['date'], mimic_series[-1]['date'])
        
        # Flatten benchmark return to match our series dates
        for item in mimic_series:
            d = item['date']
            # Find closest benchmark date
            closest = min(benchmark, key=lambda x: abs((datetime.strptime(x['date'], "%Y-%m-%d") - datetime.strptime(d, "%Y-%m-%d")).days))
            # Re-index benchmark to 0 at start date
            start_bench_val = benchmark[0]['value']
            item['benchmark_return'] = ((closest['value'] / start_bench_val) - 1.0) * 100.0

        # Get fund name
        fund_name = ""
        with self.db._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM funds WHERE cik = ?", (self.db.normalize_cik(cik),))
            row = cursor.fetchone()
            if row:
                fund_name = row[0]

        return {
            "cik": cik,
            "fund_name": fund_name,
            "series": mimic_series,
            "trades": sorted(trades_log, key=lambda x: x['date'], reverse=True) # Returns newest trades first
        }
