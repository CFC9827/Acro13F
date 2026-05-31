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


def test_production_auth_accepts_supabase_user_and_ensures_neon_user(monkeypatch):
    from types import SimpleNamespace
    import backend.services.auth as auth_module

    ensured = []

    class FakeAuthClient:
        def get_user(self, token):
            assert token == "valid-token"
            return SimpleNamespace(
                user=SimpleNamespace(
                    id="11111111-1111-1111-1111-111111111111",
                    email="jonah@example.com",
                )
            )

    class FakeSupabase:
        auth = FakeAuthClient()

    class FakeDb:
        def ensure_user(self, user_id, email):
            ensured.append({"user_id": user_id, "email": email})

    monkeypatch.setenv("ENV", "production")
    monkeypatch.setattr(auth_module, "supabase", FakeSupabase())
    monkeypatch.setattr(auth_module, "db_manager", FakeDb())

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token")
    user = asyncio.run(auth_module.get_current_user(credentials))

    assert user == {
        "id": "11111111-1111-1111-1111-111111111111",
        "email": "jonah@example.com",
    }
    assert ensured == [
        {
            "user_id": "11111111-1111-1111-1111-111111111111",
            "email": "jonah@example.com",
        }
    ]


def test_production_auth_rejects_supabase_response_without_user(monkeypatch):
    from types import SimpleNamespace
    import backend.services.auth as auth_module

    class FakeAuthClient:
        def get_user(self, token):
            assert token == "expired-token"
            return SimpleNamespace(user=None)

    class FakeSupabase:
        auth = FakeAuthClient()

    monkeypatch.setenv("ENV", "production")
    monkeypatch.setattr(auth_module, "supabase", FakeSupabase())

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="expired-token")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth_module.get_current_user(credentials))

    assert exc.value.status_code == 401
    assert exc.value.detail == "Invalid or expired token"
