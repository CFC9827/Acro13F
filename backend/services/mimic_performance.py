import logging
from datetime import datetime
from typing import List, Dict
from .prices import get_historical_prices
from .benchmark import get_benchmark_data
from .cusip_mapper import CUSIPMapper

logger = logging.getLogger(__name__)

class MimicPerformanceCalculator:
    def __init__(self, db):
        self.db = db
        self.mapper = CUSIPMapper()

    def get_mimic_performance(self, cik: str) -> Dict:
        """
        Calculates performance by simulating buys/sells at the time of 13F filing.
        Strictly uses market prices (Share Count * Market Price) for weights.
        """
        history = self.db.get_historical_holdings(cik)
        if not history:
            return {"error": "No historical data found"}

        # Group holdings by period
        periods_map = {}
        for h in history:
            p = h['period_of_report']
            if p not in periods_map:
                periods_map[p] = {
                    'period': p,
                    'filing_date': h['filing_date'],
                    'holdings': []
                }
            periods_map[p]['holdings'].append(h)

        # Sort periods chronologically
        sorted_periods = sorted(periods_map.keys())
        if len(sorted_periods) < 1:
            return {"error": "No filings found"}

        # Helper to get the best label for a holding
        def get_best_label(h):
            if h.get('ticker'): return h['ticker']
            if h.get('cusip'):
                mapped = self.mapper.get_ticker(h['cusip'])
                return mapped if mapped else h['cusip']
            return "Unknown"

        # 1. Identify all unique tickers to pre-fetch prices
        all_tickers = set()
        for f in periods_map.values():
            for h in f['holdings']:
                all_tickers.add(get_best_label(h))
        
        # 2. Pre-fetch all prices
        abs_start = periods_map[sorted_periods[0]]['filing_date']
        price_cache = {}
        for ticker in all_tickers:
            price_cache[ticker] = get_historical_prices(ticker, self.db, abs_start)

        mimic_series = []
        trades_log = []
        
        # Helper to get price for a specific date
        def get_price(symbol, date):
            prices = price_cache.get(symbol, [])
            if prices:
                # Find price on or before date
                found = next((p['price'] for p in reversed(prices) if p['date'] <= date), None)
                if found: return found
                # Fallback to first available
                return prices[0]['price']
            return 0.0

        # Helper to get filing-implied price with normalization
        def get_implied_price(h, ticker):
            if h['shares'] <= 0: return 0.0
            p = h['value'] / h['shares']
            # Normalization: Most SEC data is in thousands. 
            # If unscaled price is < $0.50, it almost certainly needs * 1000
            if p < 0.50:
                p = p * 1000
            # If price is insane (>5k) and not a known monster, it's 1000x error
            elif p > 5000 and ticker not in ['BRK.A', 'BRK-A', 'NVR', 'SEB']:
                p = p / 1000
            return p

        # Simulation Loop
        current_holdings = {} # symbol -> shares
        cumulative_return = 1.0 # 1.0 = 100%

        for i, period in enumerate(sorted_periods):
            curr_filing = periods_map[period]
            c_date = curr_filing['filing_date']
            
            # A. Calculate Period Return (based on current_holdings moving from prev_date to c_date)
            if i > 0:
                prev_date = periods_map[sorted_periods[i-1]]['filing_date']
                p_returns = []
                for ticker, shares in current_holdings.items():
                    p_start = get_price(ticker, prev_date)
                    p_end = get_price(ticker, c_date)
                    if p_start > 0:
                        p_returns.append({
                            "start_val": shares * p_start,
                            "end_val": shares * p_end
                        })
                
                total_s = sum(v['start_val'] for v in p_returns)
                total_e = sum(v['end_val'] for v in p_returns)
                if total_s > 0:
                    period_ret = (total_e / total_s) - 1
                else:
                    period_ret = 0.0
                cumulative_return *= (1 + period_ret)

            # B. Establish Target State (Weights based on Shares * Prices)
            target_holdings_shares = {}
            target_holdings_detailed = []
            
            for h in curr_filing['holdings']:
                symbol = get_best_label(h)
                if h['shares'] > 0:
                    # Consolidated shares for same label
                    target_holdings_shares[symbol] = target_holdings_shares.get(symbol, 0) + h['shares']
            
            # Calculate total fund value using real prices
            for symbol, shares in target_holdings_shares.items():
                p = get_price(symbol, c_date)
                if p <= 0:
                    # Fallback to filing implied price
                    h_file = next((x for x in curr_filing['holdings'] if get_best_label(x) == symbol), None)
                    p = get_implied_price(h_file, symbol) if h_file else 0.0
                
                target_holdings_detailed.append({
                    "ticker": symbol,
                    "shares": shares,
                    "price": p,
                    "value": shares * p
                })
            
            total_fund_val = sum(h['value'] for h in target_holdings_detailed)
            
            # C. Record Series Point
            mimic_series.append({
                "date": c_date,
                "period": period,
                "return": (cumulative_return - 1.0) * 100.0,
                "label": f"Filing {period}",
                "portfolio_value": total_fund_val,
                "holdings": target_holdings_shares,
                "holdings_detailed": target_holdings_detailed
            })

            # D. Generate Trades (State-Based)
            all_involved = set(current_holdings.keys()) | set(target_holdings_shares.keys())
            for ticker in all_involved:
                old_s = current_holdings.get(ticker, 0)
                new_s = target_holdings_shares.get(ticker, 0)
                if old_s != new_s:
                    diff = new_s - old_s
                    action = "Buy" if old_s == 0 else "Sell" if new_s == 0 else "Add" if diff > 0 else "Reduce"
                    
                    # Execution Price (on filing date)
                    p_exec = next((h['price'] for h in target_holdings_detailed if h['ticker'] == ticker), 0.0)
                    if p_exec <= 0: p_exec = get_price(ticker, c_date)
                    
                    trades_log.append({
                        "date": c_date,
                        "period": period,
                        "ticker": ticker,
                        "action": action,
                        "shares_change": diff,
                        "price": p_exec,
                        "value": abs(diff) * p_exec
                    })

            # E. Update state
            current_holdings = target_holdings_shares

        # Benchmark data
        benchmark = get_benchmark_data(mimic_series[0]['date'], mimic_series[-1]['date'])
        for item in mimic_series:
            if benchmark:
                d = item['date']
                closest = min(benchmark, key=lambda x: abs((datetime.strptime(x['date'], "%Y-%m-%d") - datetime.strptime(d, "%Y-%m-%d")).days))
                item['benchmark_return'] = ((closest['value'] / benchmark[0]['value']) - 1.0) * 100.0
            else:
                item['benchmark_return'] = 0.0

        # Fund name
        fund_name = ""
        with self.db._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM funds WHERE cik = ?", (self.db.normalize_cik(cik),))
            row = cursor.fetchone()
            if row: fund_name = row[0]

        return {
            "cik": cik,
            "fund_name": fund_name,
            "series": mimic_series,
            "trades": sorted(trades_log, key=lambda x: x['date'], reverse=True)
        }
