import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Union

import duckdb
import pandas as pd


class PriceWarehouse:
    def __init__(
        self,
        root: Optional[Union[Path, str]] = None,
        backend: Optional[str] = None,
        bucket: Optional[str] = None,
        endpoint_url: Optional[str] = None,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        prefix: Optional[str] = None,
        s3_client=None,
    ):
        configured_root = os.environ.get("PRICE_WAREHOUSE_PATH", "backend/data/price_warehouse")
        self.root = Path(root or configured_root)
        default_backend = "local" if root is not None else os.environ.get("PRICE_WAREHOUSE_BACKEND", "local")
        self.backend = (backend or default_backend).lower()
        self.bucket = bucket or os.environ.get("PRICE_WAREHOUSE_BUCKET", "")
        self.endpoint_url = endpoint_url or os.environ.get("PRICE_WAREHOUSE_ENDPOINT_URL", "")
        self.access_key_id = access_key_id or os.environ.get("PRICE_WAREHOUSE_ACCESS_KEY_ID", "")
        self.secret_access_key = secret_access_key or os.environ.get("PRICE_WAREHOUSE_SECRET_ACCESS_KEY", "")
        self.prefix = (prefix if prefix is not None else os.environ.get("PRICE_WAREHOUSE_PREFIX", "")).strip("/")
        self._s3_client = s3_client

    def _ticker_dir(self, ticker: str) -> Path:
        safe_ticker = ticker.replace("/", "__SLASH__").replace("\\", "__BSLASH__")
        return self.root / "prices" / f"ticker={safe_ticker}"

    def _price_file(self, ticker: str) -> Path:
        return self._ticker_dir(ticker) / "prices.parquet"

    def _price_object_key(self, ticker: str) -> str:
        relative_key = self._price_file(ticker).relative_to(self.root).as_posix()
        return f"{self.prefix}/{relative_key}" if self.prefix else relative_key

    def _client(self):
        if self._s3_client is not None:
            return self._s3_client
        if not all([self.bucket, self.endpoint_url, self.access_key_id, self.secret_access_key]):
            raise ValueError("Missing price warehouse S3/R2 configuration.")

        import boto3

        self._s3_client = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
        )
        return self._s3_client

    def _download_price_file(self, ticker: str) -> Path:
        response = self._client().get_object(Bucket=self.bucket, Key=self._price_object_key(ticker))
        with tempfile.NamedTemporaryFile(delete=False, suffix=".parquet") as temp_file:
            temp_file.write(response["Body"].read())
            return Path(temp_file.name)

    def write_prices(self, ticker: str, rows: List[Dict]) -> None:
        if self.backend not in {"local", "file"}:
            raise NotImplementedError("PriceWarehouse writes are only supported for the local backend.")
        if not rows:
            return

        price_file = self._price_file(ticker)
        price_file.parent.mkdir(parents=True, exist_ok=True)
        updated_at = datetime.now(timezone.utc).isoformat()

        normalized = [
            {
                "ticker": ticker,
                "date": str(row["date"])[:10],
                "close": float(row["close"]),
                "dividends": float(row.get("dividends", 0.0)),
                "source": row.get("source", "unknown"),
                "updated_at": row.get("updated_at", updated_at),
            }
            for row in rows
        ]

        frame = pd.DataFrame(normalized)
        frame = frame.sort_values(["ticker", "date"]).drop_duplicates(["ticker", "date"], keep="last")
        frame.to_parquet(price_file, index=False)

    def read_prices(
        self,
        ticker: str,
        start: Optional[str] = None,
        end: Optional[str] = None,
    ) -> List[Dict]:
        temp_price_file = None
        if self.backend in {"s3", "r2"}:
            price_file = self._download_price_file(ticker)
            temp_price_file = price_file
        else:
            price_file = self._price_file(ticker)
            if not price_file.exists():
                return []

        filters = ["ticker = ?"]
        params = [str(price_file), ticker]
        if start:
            filters.append("date >= ?")
            params.append(start)
        if end:
            filters.append("date <= ?")
            params.append(end)

        query = f"""
            SELECT ticker, date, close, dividends, source
            FROM read_parquet(?, hive_partitioning=false)
            WHERE {' AND '.join(filters)}
            ORDER BY date
        """

        try:
            rows = duckdb.execute(query, params).fetchall()
            return [
                {
                    "ticker": row[0],
                    "date": str(row[1])[:10],
                    "close": float(row[2]),
                    "dividends": float(row[3] or 0.0),
                    "source": row[4],
                }
                for row in rows
            ]
        finally:
            if temp_price_file:
                temp_price_file.unlink(missing_ok=True)
