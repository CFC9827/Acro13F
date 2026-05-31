import os
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from typing import Optional

# Initialize Supabase client for auth verification
url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_ANON_KEY", "")

from backend.services.database import DatabaseManager
db_manager = DatabaseManager()

# We only initialize if config is present
supabase: Optional[Client] = create_client(url, key) if url and key else None

security = HTTPBearer(auto_error=False)

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """
    Dependency that validates the Supabase JWT and returns the user object.
    Uses the 'sub' field from the JWT as the unique user_id.
    """
    if not credentials or not credentials.credentials:
        if os.environ.get("ENV") != "production":
            return {"id": "00000000-0000-0000-0000-000000000000", "email": "dev@abrams13f.local"}
        raise HTTPException(status_code=401, detail="Missing authorization token")

    token = credentials.credentials
    if not supabase:
        if os.environ.get("ENV") == "production":
            raise HTTPException(status_code=500, detail="Supabase Auth is not configured")
        return {"id": "00000000-0000-0000-0000-000000000000", "email": "dev@abrams13f.local"}

    try:
        # Verify token with Supabase
        user_resp = supabase.auth.get_user(token)
        if not user_resp or not user_resp.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        user_id = user_resp.user.id
        user_email = user_resp.user.email

        # JIT: Ensure user exists in our local database to satisfy foreign keys
        db_manager.ensure_user(user_id, user_email)
        
        return {
            "id": user_id,
            "email": user_email
        }
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

def get_user_id(user = Depends(get_current_user)) -> str:
    """Helper to get just the string ID."""
    return user["id"]
