from backend.services.parser import LegacyTextParser
import requests

parser = LegacyTextParser()
url = "https://www.sec.gov/Archives/edgar/data/1317588/000091957406004577/0000919574-06-004577.txt"
headers = {'User-Agent': 'Mozilla/5.0'}

print(f"Downloading {url}...")
r = requests.get(url, headers=headers)
r.raise_for_status()
content = r.text

print(f"Parsing content (length {len(content)})...")
holdings = parser.parse(content)

print(f"Found {len(holdings)} holdings.")
if holdings:
    print("First 3 holdings:")
    for h in holdings[:3]:
        print(f"  {h}")
else:
    # Print some lines around where it might have failed
    print("Sample lines from content:")
    lines = content.splitlines()
    for i, line in enumerate(lines[:100]):
        print(f"{i:3}: {line}")
