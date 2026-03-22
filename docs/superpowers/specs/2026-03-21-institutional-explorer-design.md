# Design Spec: Institutional Explorer & Whale Index

## 1. Objective
Transform the Abrams13F tracker into a professional-grade "Institutional Explorer" capable of searching the entire SEC 13F universe (the "Whale Index") using complex, multi-factor range filters (AND/OR logic).

## 2. Architecture: The Stat-Sync Hybrid (Approach 1)
To ensure performance while handling thousands of funds, the system will use a **Pre-Indexed Metrics** strategy.

### 2.1 Database Schema
A new table `fund_quarterly_stats` will store pre-calculated metrics for every quarterly filing.

```sql
CREATE TABLE fund_quarterly_stats (
    cik TEXT,
    period_of_report TEXT,
    accession_number TEXT,
    -- Scale Metrics
    total_aum BIGINT,
    position_count INTEGER,
    -- Conviction Metrics
    top_10_concentration REAL, -- % of AUM in top 10
    avg_position_size REAL,     -- Mean weight
    -- Exposure Metrics
    primary_sector TEXT,
    primary_sector_weight REAL,
    mega_cap_pct REAL,   -- >$200B
    mid_cap_pct REAL,    -- $2B - $10B
    small_cap_pct REAL,  -- <$2B
    -- Manager DNA
    portfolio_turnover REAL,    -- % change vs prior quarter
    avg_holding_period REAL,    -- Average quarters held
    herding_score REAL,         -- % in "consensus" stocks
    PRIMARY KEY (cik, period_of_report)
);
```

### 2.2 Backend Services
*   **Whale Index Ingestor (`services/whale_index.py`)**: 
    *   Downloads the official SEC 13F Filer List.
    *   Fetches the **latest 4 quarters** for the Top 2,000 funds by AUM.
    *   Calculates and populates `fund_quarterly_stats`.
*   **Explorer API (`/api/explorer/search`)**:
    *   Accepts a complex JSON payload representing the filter tree.
    *   Example: `{"logic": "AND", "filters": [{"metric": "total_aum", "op": "between", "val": [1e9, 10e9]}, {"metric": "top_10_concentration", "op": "gt", "val": 60}]}`
    *   Returns a list of matching funds with their sparkline data.

## 3. UI/UX Design: The Explorer Screen
A new section in the sidebar ("Institutional Explorer") will house the screener.

### 3.1 The Filter Builder
*   Row-based interface to add/remove filters.
*   Supports ranges for all metrics (e.g., AUM, Concentration, Sector weight).
*   Toggle for "Match All" (AND) vs "Match Any" (OR).

### 3.2 The Results Table
*   **Sparklines**: Visual trend of AUM over the last 8 quarters.
*   **DNA Badges**: Automatic tags like "Concentrated Picker" or "Mega-Cap Heavy."
*   **Deep Sync Button**: Allows the user to "Follow" a fund, triggering a full 10-year backfill into their local database.

## 4. Implementation Phases
1.  **Phase 1**: Ingestion script for the Top 2,000 Whales + `fund_quarterly_stats` table.
2.  **Phase 2**: Search API with AND/OR range support.
3.  **Phase 3**: React Explorer UI and Sidebar integration.
