from backend.scripts.validate_production_env import validate_env


def test_validate_render_api_requires_core_production_vars():
    result = validate_env(
        "render-api",
        {
            "ENV": "production",
            "DATABASE_URL": "",
            "SEC_USER_AGENT": "Abrams13F/1.0 ops@example.com",
            "FRONTEND_URL": "https://abrams13f.vercel.app",
        },
    )

    assert result["ok"] is False
    assert "DATABASE_URL" in result["missing"]


def test_validate_render_worker_requires_s3_vars_when_metrics_enabled():
    result = validate_env(
        "render-worker",
        {
            "ENV": "production",
            "DATABASE_URL": "postgresql://example",
            "SEC_USER_AGENT": "Abrams13F/1.0 ops@example.com",
            "ENABLE_PRICE_SYNC": "0",
            "ENABLE_PRICE_METRICS_SYNC": "1",
            "PRICE_WAREHOUSE_BACKEND": "s3",
            "PRICE_WAREHOUSE_BUCKET": "abrams13f",
        },
    )

    assert result["ok"] is False
    assert result["missing"] == [
        "PRICE_WAREHOUSE_ENDPOINT_URL",
        "PRICE_WAREHOUSE_ACCESS_KEY_ID",
        "PRICE_WAREHOUSE_SECRET_ACCESS_KEY",
    ]


def test_validate_vercel_requires_api_url():
    result = validate_env("vercel", {})

    assert result["ok"] is False
    assert result["missing"] == ["VITE_API_URL"]


def test_validate_warehouse_upload_requires_storage_credentials():
    result = validate_env(
        "warehouse-upload",
        {
            "PRICE_WAREHOUSE_BUCKET": "abrams13f",
            "PRICE_WAREHOUSE_ENDPOINT_URL": "https://example.r2.cloudflarestorage.com",
        },
    )

    assert result["ok"] is False
    assert result["missing"] == [
        "PRICE_WAREHOUSE_ACCESS_KEY_ID",
        "PRICE_WAREHOUSE_SECRET_ACCESS_KEY",
    ]


def test_validate_complete_render_worker_env_passes():
    result = validate_env(
        "render-worker",
        {
            "ENV": "production",
            "DATABASE_URL": "postgresql://example",
            "SEC_USER_AGENT": "Abrams13F/1.0 ops@example.com",
            "ENABLE_PRICE_SYNC": "0",
            "ENABLE_PRICE_METRICS_SYNC": "1",
            "PRICE_WAREHOUSE_BACKEND": "s3",
            "PRICE_WAREHOUSE_BUCKET": "abrams13f",
            "PRICE_WAREHOUSE_ENDPOINT_URL": "https://example.r2.cloudflarestorage.com",
            "PRICE_WAREHOUSE_ACCESS_KEY_ID": "key",
            "PRICE_WAREHOUSE_SECRET_ACCESS_KEY": "secret",
        },
    )

    assert result == {"ok": True, "missing": [], "warnings": []}
