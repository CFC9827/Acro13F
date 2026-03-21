import logging
from datetime import datetime
import requests
import os
import random
import math

logger = logging.getLogger(__name__)

def get_quarterly_benchmark(start_date: str, end_date: str = None):
    """
    Fetches SPY data and calculates returns at specific quarter-end dates 
    to match 13F filing periods.
    """
    try:
        import yfinance as yf
        spy = yf.Ticker("SPY")
        # Fetch daily to allow precise quarter-end selection
        hist = spy.history(start=start_date, end=end_date)
        
        if hist.empty:
            return []

        # Convert to quarterly returns aligned with March, June, Sept, Dec
        quarter_ends = {}
        for date, row in hist.iterrows():
            # Standard 13F periods are last day of March, June, Sept, Dec
            month = date.month
            year = date.year
            if month in [3, 6, 9, 12]:
                # We want the LATEST available day in that month
                key = f"{year}-{month:02d}"
                if key not in quarter_ends or date.day > quarter_ends[key]['day']:
                    quarter_ends[key] = {
                        "date": date.strftime("%Y-%m-%d"),
                        "day": date.day,
                        "price": row['Close']
                    }
        
        sorted_qs = sorted(quarter_ends.values(), key=lambda x: x['date'])
        if not sorted_qs:
            return []

        start_price = sorted_qs[0]['price']
        result = []
        for q in sorted_qs:
            result.append({
                "period": q['date'],
                "return": (q['price'] - start_price) / start_price * 100.0,
                "price": q['price']
            })
        return result

    except Exception as e:
        logger.error(f"Error fetching quarterly benchmark: {e}")
        return []
