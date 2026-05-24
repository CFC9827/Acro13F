from typing import Dict, Iterable

from backend.services.database import DatabaseManager
from backend.services.price_warehouse import PriceWarehouse


def export_tickers(db, warehouse: PriceWarehouse, tickers: Iterable[str]) -> Dict[str, int]:
    counts = {}
    for ticker in tickers:
        prices = db.get_prices(ticker)
        rows = []
        for price in prices:
            if price.get("price") is None:
                continue
            rows.append(
                {
                    "date": price["date"],
                    "close": price["price"],
                    "dividends": price.get("dividends") or 0.0,
                    "source": "db-cache",
                }
            )
        warehouse.write_prices(ticker, rows)
        counts[ticker] = len(rows)
    return counts


def main():
    db = DatabaseManager()
    warehouse = PriceWarehouse()
    tickers = db.get_all_tickers()
    counts = export_tickers(db, warehouse, tickers)
    print(f"Exported {sum(counts.values())} price rows across {len(counts)} tickers.")


if __name__ == "__main__":
    main()
