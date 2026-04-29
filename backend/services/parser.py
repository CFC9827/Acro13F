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

        # SEC 13F values are GENERALLY reported in thousands of dollars.
        # However, some funds report in actual dollars. We use a robust median-based 
        # heuristic to detect the correct scale, with a secondary sanity check.
        
        test_prices = []
        for h in raw_holdings:
            if h['shares'] > 0:
                raw_p = h['raw_value'] / h['shares']
                # Ignore ultra-penny or ultra-high prices for the scale test
                if 0.0001 < raw_p < 10000:
                    test_prices.append(raw_p)
        
        should_scale = True
        if test_prices:
            test_prices.sort()
            median_raw_price = test_prices[len(test_prices)//2]
            
            # If the median stock price is > $2.00, it's almost certainly already in dollars.
            # (If it were in thousands, a $50 stock would show as $0.05).
            if median_raw_price > 2.0:
                should_scale = False
                logging.info(f"SMART SCALING: Detected values already in dollars (median raw price ${median_raw_price:.2f}).")
            else:
                logging.info(f"SMART SCALING: Detected values in thousands (median raw price ${median_raw_price:.4f}). Applying 1000x multiplier.")

        # --- SECONDARY SANITY CHECK ---
        # After the initial decision, verify the resulting implied prices are reasonable.
        # If scaling produces absurd prices, flip the decision.
        def _compute_median_implied(holdings_raw, scale):
            implied = []
            for h in holdings_raw:
                if h['shares'] > 0:
                    p = (h['raw_value'] * scale) / h['shares']
                    if 0.001 < p < 1_000_000:
                        implied.append(p)
            if not implied:
                return 0
            implied.sort()
            return implied[len(implied)//2]
        
        scale_factor = 1000 if should_scale else 1
        median_implied = _compute_median_implied(raw_holdings, scale_factor)
        
        if median_implied > 50_000 or (median_implied < 0.01 and median_implied > 0):
            # The initial scaling decision produced unreasonable prices — flip it
            alt_scale = 1 if should_scale else 1000
            alt_median = _compute_median_implied(raw_holdings, alt_scale)
            
            logging.warning(
                f"SCALING AUTO-CORRECT: Initial scale (x{scale_factor}) produced median price "
                f"${median_implied:.2f}. Flipping to x{alt_scale} (median ${alt_median:.2f})."
            )
            should_scale = not should_scale
            scale_factor = alt_scale
            median_implied = alt_median

        holdings = []
        for h in raw_holdings:
            final_h = h.copy()
            final_h['value'] = h['raw_value'] * 1000 if should_scale else h['raw_value']
            del final_h['raw_value']
            holdings.append(final_h)
        
        # Post-parse validation: log any remaining anomalous implied prices
        anomaly_count = 0
        for h in holdings:
            if h['shares'] > 0:
                implied_price = h['value'] / h['shares']
                if implied_price > 50000:
                    anomaly_count += 1
                    logging.warning(f"ANOMALY: {h['issuer_name']} implied ${implied_price:.2f}/sh (val=${h['value']:,}, sh={h['shares']:,})")
                elif implied_price < 0.01:
                    anomaly_count += 1
                    logging.warning(f"ANOMALY: {h['issuer_name']} implied ${implied_price:.4f}/sh")
        
        if anomaly_count > 0:
            logging.warning(f"SCALING SUMMARY: {anomaly_count} anomalous holdings after x{scale_factor} scaling (median implied ${median_implied:.2f}).")
            
        return holdings

if __name__ == "__main__":
    parser = InfTableParser()
    print("Parser initialized.")
