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
        
        # Identify the request
        user_agent = os.environ.get("SEC_USER_AGENT", "MyTrackerApp/1.0 (contact@example.com)")
        session = requests.Session()
        session.headers.update({'User-Agent': user_agent})
        
        spy = yf.Ticker("SPY", session=session)
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
