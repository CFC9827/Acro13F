import logging
from datetime import datetime
import requests
import os
import random
import math

logger = logging.getLogger(__name__)

def get_benchmark_data(start_date: str, end_date: str = None):
    """
    Fetches S&P 500 (SPY) data for the given date range.
    Falls back to synthetic data if yfinance is not installed.
    """
    try:
        import yfinance as yf
        logger.info(f"Fetching SPY data from {start_date} to {end_date}")

        # Use default yfinance settings - session injection can cause issues
        spy = yf.Ticker("SPY")
        # Ensure we fetch enough data
        hist = spy.history(start=start_date, end=end_date)    

        benchmark_data = []
        if not hist.empty:
            # Calculate cumulative return based on the first available price
            start_price = hist['Close'].iloc[0]

            for date, row in hist.iterrows():
                # Store as a simplified object matching our chart needs
                benchmark_data.append({
                    "date": date.strftime("%Y-%m-%d"),        
                    "value": row['Close'],
                    "return": (row['Close'] - start_price) / start_price
                })
            return benchmark_data

    except ImportError:
        logger.error("yfinance not found. Cannot fetch benchmark data.")
        return []
    except Exception as e:
        logger.error(f"Error fetching benchmark data: {e}")   
        return []

    return []

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
