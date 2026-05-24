import logging
from datetime import datetime
from typing import List, Dict
from backend.services.benchmark import get_benchmark_data
from backend.services.cusip_mapper import CUSIPMapper

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

        def get_implied_price(holding):
            shares = holding.get('shares') or 0
            value = holding.get('value') or 0
            return (value / shares) if shares > 0 else 0.0

        # 1. Identify all unique tickers to load from the existing price cache.
        # Do not fetch external prices during this request; missing prices fall
        # back to filing-implied prices so the UI remains responsive.
        all_tickers = set()
        for f in periods_map.values():
            for h in f['holdings']:
                all_tickers.add(get_best_label(h))
        
        # 2. Load cached prices only.
        abs_start = periods_map[sorted_periods[0]]['filing_date']
        price_cache = {}
        for ticker in all_tickers:
            price_cache[ticker] = self.db.get_prices(ticker, abs_start)

        mimic_series = []
        trades_log = []
        
        # Helper to get price and dividends for a specific date range
        def get_price_data(symbol, start_date, end_date):
            prices = price_cache.get(symbol, [])
            if not prices: return 0.0, 0.0, 0.0
            
            # 1. Get ending price (on or before end_date)
            p_end = next((p['price'] for p in reversed(prices) if p['date'] <= end_date), 0.0)
            if p_end <= 0: p_end = prices[0]['price']
            
            # 2. Get starting price (on or before start_date)
            p_start = next((p['price'] for p in reversed(prices) if p['date'] <= start_date), 0.0)
            if p_start <= 0: p_start = prices[0]['price']
            
            # 3. Sum dividends paid BETWEEN start_date and end_date
            # (Assumes dividend is received if held between these two filing dates)
            total_divs = sum(p.get('dividends', 0) for p in prices if start_date < p['date'] <= end_date)
            
            return p_start, p_end, total_divs

        # Simulation Loop
        current_holdings = {} # symbol -> shares
        cumulative_return = 1.0 # 1.0 = 100%

        for i, period in enumerate(sorted_periods):
            curr_filing = periods_map[period]
            c_date = curr_filing['filing_date']
            
            # A. Split Detection & Adjustment
            if i > 0:
                prev_date = periods_map[sorted_periods[i-1]]['filing_date']
                for h in curr_filing['holdings']:
                    symbol = get_best_label(h)
                    if symbol in current_holdings and h['shares'] > 0:
                        prev_s = current_holdings[symbol]
                        curr_s = h['shares']
                        share_ratio = curr_s / prev_s
                        
                        if share_ratio > 1.2:
                            p_start, p_end, _ = get_price_data(symbol, prev_date, c_date)
                            if p_start > 0 and p_end > 0:
                                price_ratio = p_end / p_start
                                if 0.7 < (price_ratio * share_ratio) < 1.3:
                                    current_holdings[symbol] = curr_s

            # B. Calculate Period Return (Total Return = Price Change + Dividends)
            if i > 0:
                prev_date = periods_map[sorted_periods[i-1]]['filing_date']
                p_returns = []
                for ticker, shares in current_holdings.items():
                    p_start, p_end, divs = get_price_data(ticker, prev_date, c_date)
                    if p_start > 0:
                        p_returns.append({
                            "start_val": shares * p_start,
                            "end_val": shares * (p_end + divs) # Dividends added to end value
                        })
                
                total_s = sum(v['start_val'] for v in p_returns)
                total_e = sum(v['end_val'] for v in p_returns)
                period_ret = (total_e / total_s) - 1 if total_s > 0 else 0.0
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
                _, p, _ = get_price_data(symbol, c_date, c_date)
                if p <= 0:
                    # Fallback to filing implied price
                    h_file = next((x for x in curr_filing['holdings'] if get_best_label(x) == symbol), None)
                    p = get_implied_price(h_file) if h_file else 0.0
                
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
                    if p_exec <= 0:
                        _, p_exec, _ = get_price_data(ticker, c_date, c_date)
                    
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
        row = self.db._execute("SELECT name FROM funds WHERE cik = ?", (self.db.normalize_cik(cik),), fetch='one')
        if row:
            fund_name = row['name']

        return {
            "cik": cik,
            "fund_name": fund_name,
            "series": mimic_series,
            "trades": sorted(trades_log, key=lambda x: x['date'], reverse=True)
        }
