import argparse
import os
from dataclasses import dataclass
from pathlib import Path
from typing import List

from dotenv import load_dotenv


load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")


@dataclass(frozen=True)
class WarehouseStorageConfig:
    bucket: str
    endpoint_url: str
    access_key_id: str
    secret_access_key: str


def get_warehouse_storage_config() -> WarehouseStorageConfig:
    return WarehouseStorageConfig(
        bucket=os.environ.get("PRICE_WAREHOUSE_BUCKET", ""),
        endpoint_url=os.environ.get("PRICE_WAREHOUSE_ENDPOINT_URL", ""),
        access_key_id=os.environ.get("PRICE_WAREHOUSE_ACCESS_KEY_ID", ""),
        secret_access_key=os.environ.get("PRICE_WAREHOUSE_SECRET_ACCESS_KEY", ""),
    )


def build_upload_manifest(root: Path | str, prefix: str = "price_warehouse") -> List[dict]:
    warehouse_root = Path(root)
    normalized_prefix = prefix.strip("/")
    manifest = []

    for path in sorted(warehouse_root.rglob("*.parquet")):
        relative_key = path.relative_to(warehouse_root).as_posix()
        object_key = f"{normalized_prefix}/{relative_key}" if normalized_prefix else relative_key
        manifest.append(
            {
                "local_path": path,
                "object_key": object_key,
                "size_bytes": path.stat().st_size,
            }
        )

    return manifest


def upload_manifest(manifest: List[dict], config: WarehouseStorageConfig) -> int:
    if not all([config.bucket, config.endpoint_url, config.access_key_id, config.secret_access_key]):
        raise ValueError("Missing PRICE_WAREHOUSE_BUCKET, endpoint, access key, or secret key.")

    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=config.endpoint_url,
        aws_access_key_id=config.access_key_id,
        aws_secret_access_key=config.secret_access_key,
    )

    for item in manifest:
        client.upload_file(str(item["local_path"]), config.bucket, item["object_key"])

    return len(manifest)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Upload local price warehouse Parquet files to R2/S3 storage.")
    parser.add_argument("--root", default=os.environ.get("PRICE_WAREHOUSE_PATH", "backend/data/price_warehouse"))
    parser.add_argument("--prefix", default=os.environ.get("PRICE_WAREHOUSE_PREFIX", "price_warehouse"))
    parser.add_argument("--upload", action="store_true", help="Actually upload files. Default is dry-run.")
    args = parser.parse_args(argv)

    manifest = build_upload_manifest(args.root, args.prefix)
    total_bytes = sum(item["size_bytes"] for item in manifest)

    if not args.upload:
        print(f"Dry run: {len(manifest)} files, {total_bytes} bytes.")
        if manifest:
            print(f"First key: {manifest[0]['object_key']}")
            print(f"Last key: {manifest[-1]['object_key']}")
        return manifest

    uploaded = upload_manifest(manifest, get_warehouse_storage_config())
    print(f"Uploaded {uploaded} files.")
    return manifest


if __name__ == "__main__":
    main()
