from fastapi import FastAPI, HTTPException, Request, APIRouter, BackgroundTasks, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import time
from pathlib import Path
if os.environ.get("ABRAMS13F_SKIP_DOTENV") != "1":
    load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env", override=os.environ.get("ENV") != "production")
from typing import List, Dict
from backend.services.database import DatabaseManager
from backend.services.orchestrator import Orchestrator
from backend.services.benchmark import get_benchmark_data
from backend.services.prices import get_historical_prices
from backend.services.mimic_performance import MimicPerformanceCalculator
from backend.services.sector_mapper import SectorMapper
from backend.services.sec_client import SECClient
from backend.services.auth import get_current_user, get_user_id
import logging

logger = logging.getLogger(__name__)

app = FastAPI(title="Stock Screener API")

# Create API router with /api prefix for production compatibility
api = APIRouter(prefix="/api")

# CORS Configuration
frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
origins = [
    frontend_url,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if os.environ.get("ENV") == "production" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database and orchestrator
db = DatabaseManager()
mimic_calc = MimicPerformanceCalculator(db)
orch = Orchestrator(db)
sector_mapper = SectorMapper()
_dashboard_summary_cache: Dict[tuple, Dict[str, object]] = {}


def dashboard_summary_cache_ttl_seconds() -> int:
    try:
        return max(0, int(os.environ.get("DASHBOARD_SUMMARY_CACHE_TTL_SECONDS", "300")))
    except ValueError:
        return 300


def invalidate_dashboard_summary_cache(user_id: str = None):
    global _dashboard_summary_cache
    if user_id is None:
        _dashboard_summary_cache.clear()
        return

    _dashboard_summary_cache = {
        key: value
        for key, value in _dashboard_summary_cache.items()
        if key[0] != user_id
    }

@api.get("/config")
async def get_config():
    """Returns the current application configuration status."""
    user_agent = os.environ.get("SEC_USER_AGENT", "")
    is_placeholder = "contact@example.com" in user_agent or not user_agent
    return {
        "sec_user_agent": user_agent,
        "is_configured": not is_placeholder
    }

@api.get("/me")
async def get_me(user: Dict[str, str] = Depends(get_current_user)):
    return user

@api.post("/config")
async def update_config(config: Dict[str, str]):
    """Updates the application configuration."""
    if os.environ.get("ENV") == "production":
        raise HTTPException(status_code=403, detail="Runtime configuration changes are disabled in production")

    user_agent = config.get("sec_user_agent")
    if not user_agent:
        raise HTTPException(status_code=400, detail="sec_user_agent is required")
    
    # Update current environment
    os.environ["SEC_USER_AGENT"] = user_agent
    
    # Re-initialize orchestrator's client with new user agent
    orch.client = SECClient(user_agent=user_agent)
    
    # Persist to .env file ONLY in development
    if os.environ.get("ENV") != "production":
        env_path = ".env"
        lines = []
        found = False
        
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                for line in f:
                    if line.startswith("SEC_USER_AGENT="):
                        lines.append(f"SEC_USER_AGENT={user_agent}\n")
                        found = True
                    else:
                        lines.append(line)
        
        if not found:
            lines.append(f"SEC_USER_AGENT={user_agent}\n")
            
        try:
            with open(env_path, "w") as f:
                f.writelines(lines)
        except Exception as e:
            logging.warning(f"Failed to persist .env: {e}")
        
    return {"status": "success"}



@api.get("/funds")
async def get_funds(tracked_only: bool = True, user_id: str = Depends(get_user_id)):
    return db.get_funds(tracked_only=tracked_only, user_id=user_id)

@api.post("/funds/{cik}/track")
async def track_fund(cik: str, background_tasks: BackgroundTasks, track: bool = True, user_id: str = Depends(get_user_id)):
    try:
        print(f"DEBUG: Tracking request for CIK {cik}, track={track}, user_id={user_id}")
        cik = db.normalize_cik(cik)
        if track:
            # 1. Ensure the fund exists in canonical table
            db.save_fund(cik, "")
            
            # 2. Add to user's tracked funds
            db.track_fund(user_id=user_id, cik=cik)
        else:
            db.untrack_fund(user_id=user_id, cik=cik)

        invalidate_dashboard_summary_cache(user_id)
        return {"status": "success", "cik": cik, "tracked": track}
    except Exception as e:
        import traceback
        print(f"ERROR in track_fund: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@api.get("/search")
async def global_search(q: str, user_id: str = Depends(get_user_id)):
    """Global search for funds and tickers."""
    try:
        return db.search_all(q, user_id=user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.post("/funds/reorder")
async def reorder_funds(orders: Dict[str, int]):
    try:
        db.reorder_funds(orders)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.get("/dashboard/summary")
async def get_dashboard_summary(group_id: int = None, refresh: bool = False, user_id: str = Depends(get_user_id)):
    try:
        ttl = dashboard_summary_cache_ttl_seconds()
        cache_key = (user_id, group_id)
        now = time.monotonic()

        if ttl > 0 and not refresh:
            cached = _dashboard_summary_cache.get(cache_key)
            if cached and now - cached["created_at"] < ttl:
                return cached["summary"]

        summary = db.get_dashboard_summary(group_id=group_id, user_id=user_id)
        if ttl > 0:
            _dashboard_summary_cache[cache_key] = {"created_at": now, "summary": summary}
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.get("/dashboard/performance")
async def get_dashboard_performance(group_id: int = None, user_id: str = Depends(get_user_id)):
    try:
        return db.get_all_funds_performance(group_id=group_id, user_id=user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.get("/funds/{cik}/mimic-performance")
async def get_mimic_performance(cik: str):
    try:
        return mimic_calc.get_mimic_performance(cik)
    except Exception as e:
        logger.error(f"Error calculating mimic performance for {cik}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api.get("/funds/{cik}/price-metrics")
async def get_fund_price_metrics(cik: str, user_id: str = Depends(get_user_id)):
    try:
        return {
            "cik": db.normalize_cik(cik),
            "metrics": db.get_fund_price_metrics(cik),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.get("/dashboard/groups")
async def get_groups(user_id: str = Depends(get_user_id)):
    try:
        return db.get_groups(user_id=user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.post("/dashboard/groups/reorder")
async def reorder_groups(orders: Dict[int, int], user_id: str = Depends(get_user_id)):
    try:
        db.reorder_groups(orders, user_id=user_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.post("/dashboard/groups")
async def create_group(name: str, user_id: str = Depends(get_user_id)):
    try:
        group_id = db.create_group(name, user_id=user_id)
        invalidate_dashboard_summary_cache(user_id)
        return {"status": "success", "group_id": group_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.delete("/dashboard/groups/{id}")
async def delete_group(id: int, user_id: str = Depends(get_user_id)):
    try:
        db.delete_group(id, user_id=user_id)
        invalidate_dashboard_summary_cache(user_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.post("/dashboard/groups/{id}/members")
async def add_group_member(id: int, cik: str, user_id: str = Depends(get_user_id)):
    try:
        db.add_fund_to_group(id, cik, user_id=user_id)
        invalidate_dashboard_summary_cache(user_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.delete("/dashboard/groups/{id}/members/{cik}")
async def remove_group_member(id: int, cik: str, user_id: str = Depends(get_user_id)):
    try:
        db.remove_fund_from_group(id, cik, user_id=user_id)
        invalidate_dashboard_summary_cache(user_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.get("/funds/{cik}/holdings")
async def get_holdings(cik: str, user_id: str = Depends(get_user_id)):
    holdings = db.get_latest_holdings(cik)
    if not holdings:
        # Check if fund exists
        funds = db.get_funds()
        if not any(f['cik'] == cik for f in funds):
            raise HTTPException(status_code=404, detail="Fund not found")
        return []
    return holdings

@api.get("/funds/{cik}/history")
async def get_history(cik: str, user_id: str = Depends(get_user_id)):
    try:
        history = db.get_historical_holdings(cik)
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def background_sync_task(cik: str, limit: int = None, force_all: bool = False, backfill: bool = False):
    """Worker function for background synchronization."""
    try:
        db.update_sync_status(cik, "processing")
        result = orch.process_fund(cik, limit=limit, force_refresh_all=force_all, backfill=backfill)
        db.update_sync_status(cik, "completed", newly_added=len(result.get("newly_added", [])))
    except Exception as e:
        import logging
        logging.error(f"Background sync failed for {cik}: {e}")
        db.update_sync_status(cik, "failed", error=str(e))

@api.post("/funds/{cik}/refresh")
async def refresh_fund(cik: str, background_tasks: BackgroundTasks, limit: int = None, force_all: bool = False, user_id: str = Depends(get_user_id)):
    try:
        # Check if already processing
        status = db.get_sync_status(cik)
        if status and status.get("status") == "processing":
            return {"status": "already_processing", "message": "Sync is already in progress for this fund."}

        backfill = limit is not None
        db.update_sync_status(cik, "pending")
        background_tasks.add_task(background_sync_task, cik, limit, force_all, backfill)
        
        return {"status": "accepted", "message": "Sync started in background."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.get("/funds/{cik}/sync-status")
async def get_sync_status(cik: str, user_id: str = Depends(get_user_id)):
    """Returns the current background sync status for a fund."""
    status = db.get_sync_status(cik)
    if not status:
        return {"status": "not_started"}
    return status

@api.get("/funds/{cik}/sector-attribution")
async def get_sector_attribution(cik: str, user_id: str = Depends(get_user_id)):
    """Returns sector-level portfolio weighting and shifts over time."""
    try:
        attribution = db.get_sector_attribution(cik)
        return attribution
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.get("/market/benchmark")
async def get_market_benchmark(start: str, end: str = None, user_id: str = Depends(get_user_id)):
    try:
        data = get_benchmark_data(start, end)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.delete("/funds/{cik}")
async def delete_fund(cik: str, user_id: str = Depends(get_user_id)):
    """Untracks a fund for the current user."""
    try:
        cik = db.normalize_cik(cik)
        db.untrack_fund(user_id=user_id, cik=cik)
        return {"status": "success", "message": f"Fund {cik} untracked."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.get("/fund-info/{cik}")
def get_fund_info(cik: str, user_id: str = Depends(get_user_id)):
    """Returns basic info for a specific fund, with is_tracked computed per-user."""
    normalized_cik = db.normalize_cik(cik)
    fund = db._execute("SELECT * FROM funds WHERE cik = ?", (normalized_cik,), fetch='one')
    if fund:
        tracked = db._execute("SELECT 1 FROM user_tracked_funds WHERE user_id = ? AND cik = ?", (user_id, normalized_cik), fetch='one')
        result = dict(fund)
        result['is_tracked'] = 1 if tracked else 0
        return result
    
    # If not in the local database, return a generic placeholder
    return {"cik": normalized_cik, "name": f"Fund {normalized_cik}", "is_tracked": 0}

@api.get("/funds/{cik}/filing-range")
async def get_filing_range(cik: str, user_id: str = Depends(get_user_id)):
    """Returns the date range and count of filings stored for a fund."""
    try:
        range_info = db.get_filing_range(cik)
        return range_info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.get("/prices/{ticker}")
async def get_ticker_prices(ticker: str, start: str = None, user_id: str = Depends(get_user_id)):
    """Returns high-resolution historical prices for a ticker."""
    try:
        prices = get_historical_prices(ticker, db, start)
        return prices
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.post("/sectors/update")
async def update_sectors(user_id: str = Depends(get_user_id)):
    """Backfill sector data for all holdings that are missing sectors."""
    try:
        updated_count = db.backfill_sectors(sector_mapper.get_sector)
        return {
            "status": "success",
            "updated": updated_count,
            "cached_total": sector_mapper.get_cached_count()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.get("/sectors/allocation")
async def get_sector_allocation(group_id: int = None, cik: str = None, user_id: str = Depends(get_user_id)):
    """Get aggregated sector allocation across all funds (or a group or single fund)."""
    try:
        # If cik is provided, only get sectors for that fund
        if cik:
            holdings = db.get_latest_holdings(cik)
            sector_totals = {}
            total_value = 0
            for h in holdings:
                sector = h.get("sector") or sector_mapper.get_sector(h.get("ticker", ""))
                value = h.get("value", 0)
                sector_totals[sector] = sector_totals.get(sector, 0) + value
                total_value += value
            
            allocation = []
            for sector, value in sorted(sector_totals.items(), key=lambda x: -x[1]):
                allocation.append({
                    "sector": sector,
                    "value": value,
                    "weight": (value * 100 / total_value) if total_value > 0 else 0
                })
            return {"allocation": allocation, "total_value": total_value}
        
        # Otherwise aggregate across all funds (or group)
        summary = db.get_dashboard_summary(group_id=group_id, user_id=user_id)
        
        # Aggregate sector weights from all fund holdings
        sector_totals = {}
        total_value = 0
        
        for fund in summary.get("fund_highlights", []):
            cik = fund.get("cik")
            if not cik:
                continue
            holdings = db.get_latest_holdings(cik)
            for h in holdings:
                sector = h.get("sector") or sector_mapper.get_sector(h.get("ticker", ""))
                value = h.get("value", 0)
                sector_totals[sector] = sector_totals.get(sector, 0) + value
                total_value += value
        
        # Convert to percentages
        allocation = []
        for sector, value in sorted(sector_totals.items(), key=lambda x: -x[1]):
            allocation.append({
                "sector": sector,
                "value": value,
                "weight": (value * 100 / total_value) if total_value > 0 else 0
            })
        
        return {"allocation": allocation, "total_value": total_value}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Cache for SEC company data
_sec_company_cache = {"data": None, "timestamp": 0}

@api.get("/search-cik")
async def search_cik(q: str, limit: int = 20, user_id: str = Depends(get_user_id)):
    """Search for companies/funds by name using SEC EDGAR search API."""
    import httpx
    
    query = q.strip()
    if not query:
        return []
    
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            # Use SEC EDGAR full-text search API for 13F filers
            resp = await client.get(
                "https://efts.sec.gov/LATEST/search-index",
                params={
                    "q": query,
                    "forms": "13F-HR",  # Only 13F filers
                    "from": 0,
                    "size": limit * 3,  # Fetch more to deduplicate
                },
                headers={"User-Agent": "StockScreener/1.0 (contact@stockscreener.app)"},
                timeout=30.0
            )
            resp.raise_for_status()
            data = resp.json()
            
            # Extract unique filers from search results
            seen_ciks = set()
            results = []
            
            hits = data.get("hits", {}).get("hits", [])
            for hit in hits:
                source = hit.get("_source", {})
                cik = source.get("ciks", [""])[0] if source.get("ciks") else ""
                name = source.get("display_names", [""])[0] if source.get("display_names") else ""
                
                if cik and cik not in seen_ciks:
                    seen_ciks.add(cik)
                    results.append({
                        "cik": cik.zfill(10),
                        "name": name,
                        "ticker": ""  # 13F filers typically don't have tickers
                    })
                    if len(results) >= limit:
                        break
            
            return results
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@api.post("/explorer/search")
async def explorer_search(request: Request, user_id: str = Depends(get_user_id)):
    criteria = await request.json()
    try:
        results = db.search_explorer(criteria, user_id=user_id)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Explorer search failed: {str(e)}")

@api.get("/explorer/stocks/favorites")
async def get_whale_favorites(limit: int = 100, user_id: str = Depends(get_user_id)):
    """Returns the top stocks held by 'whale' funds."""
    try:
        results = db.get_whale_favorites(limit)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.get("/explorer/stock/{ticker}/holders")
async def get_stock_holders(ticker: str, group_id: int = None, user_id: str = Depends(get_user_id)):
    """Returns a list of funds that hold a specific stock."""
    try:
        results = db.get_stock_holders(ticker, group_id=group_id, user_id=user_id)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- UI Serving ---
# This serves the built React frontend from the ui/dist directory
# html=True mode enables automatic index.html serving for / and SPA routing

ui_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ui", "dist")

# Include the API router with /api prefix
app.include_router(api)

# Mount static files AFTER all API routes are defined
# html=True ensures index.html is served for directories and unknown routes
if os.path.exists(ui_path):
    app.mount("/", StaticFiles(directory=ui_path, html=True), name="ui")

if __name__ == "__main__":
    import uvicorn
    # When running as a standalone app, we use a fixed port
    uvicorn.run(app, host="127.0.0.1", port=8000)
