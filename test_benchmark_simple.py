import yfinance as yf

def test_spy_simple():
    print("Testing simplified yfinance fetch for SPY...")
    try:
        # Simple, no session
        spy = yf.Ticker("SPY")
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
    test_spy_simple()
