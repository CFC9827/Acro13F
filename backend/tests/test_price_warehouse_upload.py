from backend.scripts.upload_price_warehouse import build_upload_manifest, get_warehouse_storage_config


def test_build_upload_manifest_uses_portable_object_keys(tmp_path):
    price_dir = tmp_path / "prices" / "ticker=AAPL"
    price_dir.mkdir(parents=True)
    price_file = price_dir / "prices.parquet"
    price_file.write_bytes(b"price-data")

    manifest = build_upload_manifest(tmp_path, prefix="abrams13f/price_warehouse")

    assert manifest == [
        {
            "local_path": price_file,
            "object_key": "abrams13f/price_warehouse/prices/ticker=AAPL/prices.parquet",
            "size_bytes": 10,
        }
    ]


def test_get_warehouse_storage_config_reads_env(monkeypatch):
    monkeypatch.setenv("PRICE_WAREHOUSE_BUCKET", "bucket")
    monkeypatch.setenv("PRICE_WAREHOUSE_ENDPOINT_URL", "https://example.r2.cloudflarestorage.com")
    monkeypatch.setenv("PRICE_WAREHOUSE_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("PRICE_WAREHOUSE_SECRET_ACCESS_KEY", "secret")

    config = get_warehouse_storage_config()

    assert config.bucket == "bucket"
    assert config.endpoint_url == "https://example.r2.cloudflarestorage.com"
    assert config.access_key_id == "key"
    assert config.secret_access_key == "secret"
