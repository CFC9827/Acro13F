import yfinance as yf
import requests
import os

def test_spy():
    print("Testing yfinance fetch for SPY...")
    try:
        user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        session = requests.Session()
        session.headers.update({'User-Agent': user_agent})
        
        spy = yf.Ticker("SPY", session=session)
        data = spy.history(period="1mo")
        
        if data.empty:
            print("ERROR: Fetch successful but returned empty data.")
        else:
            print(f"SUCCESS: Fetched {len(data)} rows.")
            print(data.head())
            
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_spy()
