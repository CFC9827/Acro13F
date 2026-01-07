"""Test parser directly on a single-holding filing."""
import sys
sys.path.insert(0, '.')
import importlib

# Force reimport to get latest code
import services.parser
importlib.reload(services.parser)
from services.parser import InfTableParser

import logging
logging.basicConfig(level=logging.INFO)

# Simulate a single-holding filing like the Hertz amendment
# Raw SEC value: 45,533,105 (in thousands per SEC standard)
# Shares: 12,713,963
parser = InfTableParser()

test_xml = """<?xml version="1.0" encoding="utf-8"?>
<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
<infoTable>
<nameOfIssuer>TZ GLOBAL HLDGS INC</nameOfIssuer>
<titleOfClass>COM NEW</titleOfClass>
<cusip>42806J700</cusip>
<value>45533105</value>
<shrsOrPrnAmt>
<sshPrnamt>12713963</sshPrnamt>
<sshPrnamtType>SH</sshPrnamtType>
</shrsOrPrnAmt>
<investmentDiscretion>SOLE</investmentDiscretion>
</infoTable>
</informationTable>
"""

holdings = parser.parse(test_xml)
print("\nParsed holdings:")
for h in holdings:
    price = h['value'] / h['shares'] if h['shares'] else 0
    print(f"  {h['issuer_name']}: value=${h['value']:,}, shares={h['shares']:,}, price=${price:.2f}")
    print(f"  Expected: value ~$45M (45533105000 after ×1000), price ~$3.58/share")
