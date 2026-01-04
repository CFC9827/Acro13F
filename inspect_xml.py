import requests
import os
from lxml import etree

headers = {
    "User-Agent": "StockScreener/1.0 (contact@stockscreener.app)",
    "Accept-Encoding": "gzip, deflate"
}

cik = "0001814465"
accession = "0000921895-25-003108"
cik_clean = cik.lstrip('0')
accession_clean = accession.replace('-', '')

index_url = f"https://www.sec.gov/Archives/edgar/data/{cik_clean}/{accession_clean}/index.json"
print(f"Fetching index: {index_url}")
r = requests.get(index_url, headers=headers)
r.raise_for_status()
data = r.json()

xml_filename = None
for file in data.get('directory', {}).get('item', []):
    name = file.get('name', '').lower()
    if name.endswith('.xml') and ('inftable' in name or 'infotable' in name or 'informationtable' in name):
        xml_filename = file['name']
        break

if not xml_filename:
    print("Could not find XML inftable")
    exit(1)

xml_url = f"https://www.sec.gov/Archives/edgar/data/{cik_clean}/{accession_clean}/{xml_filename}"
print(f"Downloading XML: {xml_url}")
r = requests.get(xml_url, headers=headers)
r.raise_for_status()
xml_content = r.text

root = etree.fromstring(xml_content.encode('utf-8'))
tables = root.xpath('//*[local-name()="infoTable"]')

print(f"Found {len(tables)} infoTable entries.")
for table in tables:
    name = table.xpath('.//*[local-name()="nameOfIssuer"]/text()')
    if name and "LIQUIDIA" in name[0].upper():
        print("-" * 20)
        print(etree.tostring(table, pretty_print=True).decode())
