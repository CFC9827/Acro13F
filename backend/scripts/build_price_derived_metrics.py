import argparse
import os
from datetime import datetime


def calculate_return(start_price: float, end_price: float, dividends: float = 0.0) -> float:
    if start_price <= 0:
        return 0.0
    return ((end_price + dividends) / start_price) - 1.0


def calculate_weighted_holding_return(warehouse, holdings, start_date: str, end_date: str) -> float:
    weighted_return = 0.0
    total_weight = 0.0

    for holding in holdings:
        ticker = holding.get("ticker")
        value = float(holding.get("value") or 0.0)
        if not ticker or value <= 0:
            continue

        prices = warehouse.read_prices(ticker, start=start_date, end=end_date)
        if len(prices) < 2:
            continue

        start_price = prices[0]["close"]
        end_price = prices[-1]["close"]
        dividends = sum(row.get("dividends", 0.0) for row in prices[1:])
        weighted_return += value * calculate_return(start_price, end_price, dividends)
        total_weight += value

    if total_weight <= 0:
        return 0.0
    return weighted_return / total_weight


def calculate_price_coverage(warehouse, holdings, start_date: str, end_date: str):
    positions_total = len([holding for holding in holdings if holding.get("ticker")])
    positions_priced = 0

    for holding in holdings:
        ticker = holding.get("ticker")
        if not ticker:
            continue
        prices = warehouse.read_prices(ticker, start=start_date, end=end_date)
        if len(prices) >= 2:
            positions_priced += 1

    coverage_pct = (positions_priced / positions_total * 100.0) if positions_total else 0.0
    return positions_priced, positions_total, coverage_pct


def build_filing_price_metrics(db, warehouse, filing, holdings, start_date: str, end_date: str):
    period_return = calculate_weighted_holding_return(warehouse, holdings, start_date, end_date)
    positions_priced, positions_total, coverage_pct = calculate_price_coverage(
        warehouse, holdings, start_date, end_date
    )

    stats = {
        "cik": filing["cik"],
        "period_of_report": filing["period_of_report"],
        "accession_number": filing["accession_number"],
        "start_date": start_date,
        "end_date": end_date,
        "weighted_return": round(period_return, 6),
        "coverage_pct": round(coverage_pct, 4),
        "positions_priced": positions_priced,
        "positions_total": positions_total,
    }
    db.save_fund_price_metric(stats)
    return stats


def quarter_start_for_period(period_of_report: str) -> str:
    period = datetime.strptime(period_of_report[:10], "%Y-%m-%d")
    quarter_start_month = ((period.month - 1) // 3) * 3 + 1
    return f"{period.year}-{quarter_start_month:02d}-01"


def build_recent_price_metrics(db, warehouse, limit: int = 25):
    filings = db._execute(
        """
        SELECT accession_number, cik, period_of_report
        FROM filings
        ORDER BY period_of_report DESC, filing_date DESC
        LIMIT ?
        """,
        (limit,),
        fetch="all",
    )

    results = []
    for filing in filings:
        holdings = db._execute(
            "SELECT ticker, value FROM holdings WHERE accession_number = ?",
            (filing["accession_number"],),
            fetch="all",
        )
        if not any(holding.get("ticker") for holding in holdings):
            continue
        results.append(
            build_filing_price_metrics(
                db,
                warehouse,
                filing=filing,
                holdings=holdings,
                start_date=quarter_start_for_period(filing["period_of_report"]),
                end_date=filing["period_of_report"],
            )
        )
    return results


def resolve_refresh_limit(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Build compact fund price metrics from the price warehouse.")
    parser.add_argument("--limit", type=int, default=None, help="Number of recent filings to refresh.")
    args = parser.parse_args(argv)

    if args.limit is not None:
        return max(1, args.limit)

    try:
        return max(1, int(os.environ.get("PRICE_METRICS_REFRESH_LIMIT", "25")))
    except ValueError:
        return 25


def main():
    from backend.services.database import DatabaseManager
    from backend.services.price_warehouse import PriceWarehouse

    db = DatabaseManager()
    warehouse = PriceWarehouse()
    limit = resolve_refresh_limit()
    results = build_recent_price_metrics(db, warehouse, limit=limit)
    print(f"Built {len(results)} fund price metric rows.")


if __name__ == "__main__":
    main()
