import requests
import sys

def test_price_api(ticker):
    url = f"http://localhost:8000/api/prices/{ticker}"
    print(f"Testing URL: {url}")
    try:
        response = requests.get(url)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Data count: {len(data)}")
            if len(data) > 0:
                print(f"First point: {data[0]}")
                print(f"Last point: {data[-1]}")
            else:
                print("Data is empty!")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    ticker = sys.argv[1] if len(sys.argv) > 1 else "MSFT"
    test_price_api(ticker)
