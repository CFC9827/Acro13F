from lxml import etree
from typing import List, Dict
import logging

class InfTableParser:
    """
    Parses the inftable.xml file from a 13F filing.
    """
    
    # Common namespaces for 13F XML
    NS = {
        'ns1': 'http://www.sec.gov/edgar/document/thirteenf/informationtable'
    }

    def parse(self, xml_content: str) -> List[Dict]:
        """
        Parses the XML string and returns a list of holdings.
        """
        root = etree.fromstring(xml_content.encode('utf-8'))
        
        # Determine if we need namespaces (sometimes they are present, sometimes not)
        use_ns = 'thirteenf' in root.nsmap.get(None, '') or 'thirteenf' in str(root.tag)
        
        # Find all infoTable elements (ignore namespace)
        tables = root.xpath('//*[local-name()="infoTable"]')
            
        raw_holdings = []
        for table in tables:
            def get_val(tag_name):
                # Helper to get value ignoring namespace
                # Search for direct child or descendant with local-name
                results = table.xpath(f'.//*[local-name()="{tag_name}"]/text()')
                return results[0] if results else None

            def clean_int(val):
                if not val: return 0
                try:
                    # Remove commas, spaces, and handle potential decimals
                    return int(float(val.replace(',', '').strip()))
                except:
                    return 0

            raw_val = clean_int(get_val("value"))
            
            # Helper for nested fields like shrsOrPrnAmt/sshPrnamt
            shares_node = table.xpath('.//*[local-name()="shrsOrPrnAmt"]/*[local-name()="sshPrnamt"]/text()')
            shares = clean_int(shares_node[0]) if shares_node else 0
            
            type_node = table.xpath('.//*[local-name()="shrsOrPrnAmt"]/*[local-name()="sshPrnamtType"]/text()')
            sh_type = type_node[0] if type_node else None

            put_call_raw = get_val("putCall")
            put_call = put_call_raw.upper() if put_call_raw else None

            raw_holdings.append({
                "issuer_name": get_val("nameOfIssuer"),
                "cusip": get_val("cusip"),
                "raw_value": raw_val,
                "shares": shares,
                "sh_type": sh_type,
                "investment_discretion": get_val("investmentDiscretion"),
                "put_call": put_call  # Guaranteed uppercase if present
            })

        # Heuristic: Determine if values are in thousands or dollars
        # SEC standard varies - some filings report in thousands, others in full dollars
        # The form header indicates "(to the nearest dollar)" for full dollars or "(in thousands)" for thousands
        scale_by_1000 = True
        test_samples = [h for h in raw_holdings if h['shares'] > 100 and h['raw_value'] > 0]
        
        if len(test_samples) >= 3:
            # With enough samples, use the expensive-price heuristic
            too_expensive_count = 0
            for h in test_samples[:50]:
                price_if_scaled = (h['raw_value'] * 1000) / h['shares']
                if price_if_scaled > 5000:
                    too_expensive_count += 1
            
            if too_expensive_count / len(test_samples[:50]) > 0.3:
                scale_by_1000 = False
                logging.info(f"Scaling heuristic detected FULL DOLLARS (scale_by_1000=False). Samples: {len(test_samples)}")
            else:
                logging.info(f"Scaling heuristic detected THOUSANDS (scale_by_1000=True). Samples: {len(test_samples)}")
        else:
            # Few samples (amendments) - check if raw values give reasonable prices
            # Most stocks trade between $0.10 and $10,000/share
            reasonable_without_scaling = True
            for h in test_samples:
                price_unscaled = h['raw_value'] / h['shares']
                if price_unscaled < 0.10 or price_unscaled > 50000:
                    reasonable_without_scaling = False
                    break
            
            if test_samples and reasonable_without_scaling:
                # Prices look reasonable without scaling - values are already in dollars
                scale_by_1000 = False
                logging.info(f"Few samples ({len(test_samples)}), prices look reasonable unscaled - using FULL DOLLARS")
            else:
                # Prices too low without scaling - need to multiply by 1000
                logging.info(f"Few samples ({len(test_samples)}), defaulting to THOUSANDS")
            
        holdings = []
        for h in raw_holdings:
            final_h = h.copy()
            # Final value in dollars
            final_h['value'] = h['raw_value'] * 1000 if scale_by_1000 else h['raw_value']
            del final_h['raw_value']
            holdings.append(final_h)
        
        # Post-parse validation: check for anomalous prices
        for h in holdings:
            if h['shares'] > 0:
                implied_price = h['value'] / h['shares']
                if implied_price > 50000:
                    logging.warning(f"ANOMALY DETECTED: {h['issuer_name']} has implied price ${implied_price:.2f}/share (value=${h['value']:,}, shares={h['shares']:,})")
                elif implied_price < 0.01:
                    logging.warning(f"ANOMALY DETECTED: {h['issuer_name']} has very low implied price ${implied_price:.4f}/share")
            
        return holdings

if __name__ == "__main__":
    parser = InfTableParser()
    print("Parser initialized.")
