import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

from backend.services.price_warehouse import PriceWarehouse
from backend.scripts.export_prices_to_warehouse import export_tickers


def test_price_warehouse_round_trips_ticker_prices(tmp_path):
    warehouse = PriceWarehouse(root=tmp_path)

    warehouse.write_prices(
        "BRK/B",
        [
            {"date": "2024-01-02", "close": 100.0, "dividends": 0.0, "source": "test"},
            {"date": "2024-01-03", "close": 101.5, "dividends": 0.25, "source": "test"},
        ],
    )

    rows = warehouse.read_prices("BRK/B", start="2024-01-03")

    assert rows == [
        {
            "ticker": "BRK/B",
            "date": "2024-01-03",
            "close": 101.5,
            "dividends": 0.25,
            "source": "test",
        }
    ]


class FakeDb:
    def get_prices(self, ticker, start_date=None):
        return [
            {"date": "2024-01-02", "price": 10.0, "dividends": 0.0},
            {"date": "2024-01-03", "price": 11.0, "dividends": 0.1},
        ]


def test_export_tickers_writes_db_prices_to_warehouse(tmp_path):
    warehouse = PriceWarehouse(root=tmp_path)

    result = export_tickers(FakeDb(), warehouse, ["AAPL"])

    assert result == {"AAPL": 2}
    assert warehouse.read_prices("AAPL")[-1]["close"] == 11.0


class FakeDbWithNullPrice:
    def get_prices(self, ticker, start_date=None):
        return [
            {"date": "2024-01-02", "price": None, "dividends": 0.0},
            {"date": "2024-01-03", "price": 11.0, "dividends": None},
        ]


def test_export_tickers_skips_null_prices(tmp_path):
    warehouse = PriceWarehouse(root=tmp_path)

    result = export_tickers(FakeDbWithNullPrice(), warehouse, ["AAPL"])

    assert result == {"AAPL": 1}
    assert warehouse.read_prices("AAPL") == [
        {
            "ticker": "AAPL",
            "date": "2024-01-03",
            "close": 11.0,
            "dividends": 0.0,
            "source": "db-cache",
        }
    ]


def test_price_warehouse_parquet_rows_include_updated_at(tmp_path):
    warehouse = PriceWarehouse(root=tmp_path)

    warehouse.write_prices(
        "AAPL",
        [{"date": "2024-01-02", "close": 100.0, "dividends": 0.0, "source": "test"}],
    )

    price_file = warehouse._price_file("AAPL")
    rows = duckdb.execute(
        "SELECT updated_at FROM read_parquet(?, hive_partitioning=false)",
        [str(price_file)],
    ).fetchall()

    assert rows[0][0]


class FakeS3Client:
    def __init__(self, objects):
        self.objects = objects
        self.calls = []

    def get_object(self, Bucket, Key):
        self.calls.append({"Bucket": Bucket, "Key": Key})
        import io

        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}


def test_price_warehouse_reads_prices_from_s3_backend(tmp_path):
    table = pa.Table.from_pylist(
        [
            {"ticker": "AAPL", "date": "2024-01-02", "close": 100.0, "dividends": 0.0, "source": "test"},
            {"ticker": "AAPL", "date": "2024-01-03", "close": 101.5, "dividends": 0.25, "source": "test"},
        ]
    )
    price_file = tmp_path / "prices.parquet"
    pq.write_table(table, price_file)
    key = "abrams13f/price_warehouse/prices/ticker=AAPL/prices.parquet"
    client = FakeS3Client({("bucket", key): price_file.read_bytes()})

    warehouse = PriceWarehouse(
        backend="s3",
        bucket="bucket",
        prefix="abrams13f/price_warehouse",
        s3_client=client,
    )

    rows = warehouse.read_prices("AAPL", start="2024-01-03")

    assert rows == [
        {
            "ticker": "AAPL",
            "date": "2024-01-03",
            "close": 101.5,
            "dividends": 0.25,
            "source": "test",
        }
    ]
    assert client.calls == [{"Bucket": "bucket", "Key": key}]
