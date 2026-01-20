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
        # SEC 13F filings can be in either format. We use a weighted scoring system
        # based on what implied stock prices would look like with/without scaling.
        
        test_samples = [h for h in raw_holdings if h['shares'] > 0 and h['raw_value'] > 0]
        
        if test_samples:
            # Weighted scoring: positive = needs scaling, negative = already full dollars
            score = 0
            
            for h in test_samples[:50]:
                unscaled_price = h['raw_value'] / h['shares']
                scaled_price = unscaled_price * 1000
                
                # Signals that we NEED to scale (values are in thousands)
                if unscaled_price < 1.0:
                    score += 3  # Very low price, almost certainly needs scaling
                elif unscaled_price < 10.0:
                    score += 2  # Low price, likely needs scaling
                elif unscaled_price < 100.0:
                    score += 1  # Moderate price, might need scaling
                
                # Signals that we should NOT scale (values are already in full dollars)
                if scaled_price > 50000:
                    score -= 3  # Scaling would give >$50k/share, almost certainly wrong
                elif scaled_price > 10000:
                    score -= 2  # Scaling would give >$10k/share, likely wrong
                elif unscaled_price > 500:
                    score -= 1  # Already a high-priced stock
            
            # Make decision based on net score
            if score > 0:
                scale_by_1000 = True
                logging.info(f"Detected THOUSANDS (score={score}). Samples: {len(test_samples[:50])}")
            else:
                scale_by_1000 = False
                logging.info(f"Detected FULL DOLLARS (score={score}). Samples: {len(test_samples[:50])}")
        else:
            scale_by_1000 = True  # Default to thousands for institutional filings
            logging.info("No samples to test scaling, defaulting to THOUSANDS.")
            
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
