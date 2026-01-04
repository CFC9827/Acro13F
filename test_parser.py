import requests
from services.parser import InfTableParser

headers = {
    "User-Agent": "StockScreener/1.0 (contact@stockscreener.app)",
    "Accept-Encoding": "gzip, deflate"
}

url = "https://www.sec.gov/Archives/edgar/data/1814465/000092189525003108/infotable.xml"
print(f"Downloading: {url}")
r = requests.get(url, headers=headers)
r.raise_for_status()

parser = InfTableParser()
holdings = parser.parse(r.text)

liquidia = [h for h in holdings if "LIQUIDIA" in h['issuer_name'].upper()]
print(f"Found {len(liquidia)} Liquidia positions.")
for h in liquidia:
    print(f"Position: {h['issuer_name']}, Shares: {h['shares']}, Value: {h['value']}, Put/Call: {h.get('put_call')}")
