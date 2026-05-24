import os
import sys
import asyncio

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

os.environ["DATABASE_URL"] = ""

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services.auth import get_current_user


def test_dev_auth_uses_default_user_without_credentials(monkeypatch):
    monkeypatch.delenv("ENV", raising=False)

    user = asyncio.run(get_current_user(None))

    assert user["id"] == "00000000-0000-0000-0000-000000000000"
    assert user["email"] == "dev@abrams13f.local"


def test_production_auth_rejects_missing_credentials(monkeypatch):
    monkeypatch.setenv("ENV", "production")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user(None))

    assert exc.value.status_code == 401


def test_production_auth_rejects_token_when_supabase_is_not_configured(monkeypatch):
    monkeypatch.setenv("ENV", "production")

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="not-a-real-token")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user(credentials))

    assert exc.value.status_code == 500
