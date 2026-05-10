import os
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from typing import Optional

# Initialize Supabase client for auth verification
url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_ANON_KEY", "")

# We only initialize if config is present
supabase: Optional[Client] = create_client(url, key) if url and key else None

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Dependency that validates the Supabase JWT and returns the user object.
    Uses the 'sub' field from the JWT as the unique user_id.
    """
    token = credentials.credentials
    if not supabase:
        # Fallback for development if keys are missing
        # In a real production environment, this would raise a 500 error
        return {"id": "00000000-0000-0000-0000-000000000000", "email": "dev@abrams13f.local"}

    try:
        # Verify token with Supabase
        user_resp = supabase.auth.get_user(token)
        if not user_resp or not user_resp.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        return {
            "id": user_resp.user.id,
            "email": user_resp.user.email
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

def get_user_id(user = Depends(get_current_user)) -> str:
    """Helper to get just the string ID."""
    return user["id"]
