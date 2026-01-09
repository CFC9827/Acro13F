from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
from services.database import DatabaseManager
from services.orchestrator import Orchestrator
from services.benchmark import get_benchmark_data
from services.prices import get_historical_prices
from services.sector_mapper import SectorMapper
import os

app = FastAPI(title="Stock Screener API")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database and orchestrator
db = DatabaseManager()
orch = Orchestrator(db)
sector_mapper = SectorMapper()

@app.get("/")
async def root():
    return {"message": "Stock Screener API is running"}

@app.get("/funds")
async def get_funds():
    return db.get_funds()

@app.get("/dashboard/summary")
async def get_dashboard_summary(group_id: int = None):
    try:
        summary = db.get_dashboard_summary(group_id=group_id)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/dashboard/performance")
async def get_dashboard_performance(group_id: int = None):
    try:
        return db.get_all_funds_performance(group_id=group_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/dashboard/groups")
async def get_groups():
    try:
        return db.get_groups()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/dashboard/groups/reorder")
async def reorder_groups(orders: Dict[int, int]):
    try:
        db.reorder_groups(orders)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/dashboard/groups")
async def create_group(name: str):
    try:
        group_id = db.create_group(name)
        return {"status": "success", "group_id": group_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/dashboard/groups/{id}")
async def delete_group(id: int):
    try:
        db.delete_group(id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/dashboard/groups/{id}/members")
async def add_group_member(id: int, cik: str):
    try:
        db.add_fund_to_group(id, cik)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/dashboard/groups/{id}/members/{cik}")
async def remove_group_member(id: int, cik: str):
    try:
        db.remove_fund_from_group(id, cik)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/funds/{cik}/holdings")
async def get_holdings(cik: str):
    holdings = db.get_latest_holdings(cik)
    if not holdings:
        # Check if fund exists
        funds = db.get_funds()
        if not any(f['cik'] == cik for f in funds):
            raise HTTPException(status_code=404, detail="Fund not found")
        return []
    return holdings

@app.get("/funds/{cik}/history")
async def get_history(cik: str):
    try:
        history = db.get_historical_holdings(cik)
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/funds/{cik}/refresh")
async def refresh_fund(cik: str, limit: int = None, force_all: bool = False):
    try:
        # Dynamic refresh: Automatically detects news vs existing.
        # If limit is explicitly provided, we assume the user wants to fetch *older* history (backfill),
        # so we disable the "caught up" optimization.
        backfill = limit is not None
        result = orch.process_fund(cik, limit=limit, force_refresh_all=force_all, backfill=backfill)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/market/benchmark")
async def get_market_benchmark(start: str, end: str = None):
    try:
        data = get_benchmark_data(start, end)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/funds/{cik}")
async def delete_fund(cik: str):
    try:
        db.delete_fund(cik)
        return {"status": "success", "message": f"Fund {cik} and its holdings deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/funds/{cik}/filing-range")
async def get_filing_range(cik: str):
    """Returns the date range and count of filings stored for a fund."""
    try:
        range_info = db.get_filing_range(cik)
        return range_info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/prices/{ticker}")
async def get_ticker_prices(ticker: str, start: str = None):
    """Returns high-resolution historical prices for a ticker."""
    try:
        prices = get_historical_prices(ticker, db, start)
        return prices
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/sectors/update")
async def update_sectors():
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

@app.get("/sectors/allocation")
async def get_sector_allocation(group_id: int = None):
    """Get aggregated sector allocation across all funds (or a group)."""
    try:
        summary = db.get_dashboard_summary(group_id=group_id)
        
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

@app.get("/search-cik")
async def search_cik(q: str, limit: int = 20):
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
