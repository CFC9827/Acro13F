import argparse
import os
from pathlib import Path
from typing import Dict, List, Mapping

from dotenv import load_dotenv


load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")


BASE_RENDER_VARS = ["ENV", "DATABASE_URL", "SEC_USER_AGENT"]
S3_VARS = [
    "PRICE_WAREHOUSE_BUCKET",
    "PRICE_WAREHOUSE_ENDPOINT_URL",
    "PRICE_WAREHOUSE_ACCESS_KEY_ID",
    "PRICE_WAREHOUSE_SECRET_ACCESS_KEY",
]


def enabled(value: str) -> bool:
    return str(value).lower() in {"1", "true", "yes", "on"}


def missing_vars(names: List[str], env: Mapping[str, str]) -> List[str]:
    return [name for name in names if not env.get(name)]


def validate_env(target: str, env: Mapping[str, str] = os.environ) -> Dict[str, object]:
    required: List[str] = []
    warnings: List[str] = []

    if target == "render-api":
        required = BASE_RENDER_VARS + ["FRONTEND_URL"]
    elif target == "render-worker":
        required = BASE_RENDER_VARS + ["ENABLE_PRICE_SYNC", "ENABLE_PRICE_METRICS_SYNC"]
        if env.get("PRICE_WAREHOUSE_BACKEND", "local").lower() in {"s3", "r2"} and enabled(
            env.get("ENABLE_PRICE_METRICS_SYNC", "")
        ):
            required += S3_VARS
        if enabled(env.get("ENABLE_PRICE_SYNC", "")):
            warnings.append("ENABLE_PRICE_SYNC is on; keep it off on the current Neon tier unless intentionally backfilling.")
    elif target == "vercel":
        required = ["VITE_API_URL"]
    elif target == "warehouse-upload":
        required = S3_VARS
    else:
        raise ValueError(f"Unknown target: {target}")

    missing = missing_vars(required, env)
    return {"ok": not missing and not warnings, "missing": missing, "warnings": warnings}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Validate Abrams13F production environment variables.")
    parser.add_argument(
        "target",
        choices=["render-api", "render-worker", "vercel", "warehouse-upload"],
        help="Environment target to validate.",
    )
    args = parser.parse_args(argv)

    result = validate_env(args.target)
    if result["ok"]:
        print(f"{args.target}: ok")
        return 0

    print(f"{args.target}: not ready")
    if result["missing"]:
        print("Missing:")
        for name in result["missing"]:
            print(f"- {name}")
    if result["warnings"]:
        print("Warnings:")
        for warning in result["warnings"]:
            print(f"- {warning}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
