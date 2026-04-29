# Institutional Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-performance institutional fund screener with multi-factor range filtering.

**Architecture:** Stat-Sync Hybrid approach. Pre-calculate 15+ fund metrics (AUM, Concentration, Turnover, etc.) into a `fund_quarterly_stats` table for instant querying. Background worker syncs the Top 2,000 "Whales" from the SEC.

**Tech Stack:** FastAPI, SQLite (indexed), React (TypeScript).

---

### Task 1: Database Schema Expansion

**Files:**
- Modify: `backend/services/database.py`
- Test: `backend/tests/test_database_explorer.py`

- [x] **Step 1: Add `fund_quarterly_stats` table creation to `DatabaseManager._init_db`**
- [x] **Step 2: Add `save_quarterly_stats` method to `DatabaseManager`**
- [x] **Step 3: Write test to verify table creation and data persistence**
- [x] **Step 4: Commit**

### Task 2: Whale Index Ingestor (Core Logic)

**Files:**
- Create: `backend/services/whale_index.py`
- Modify: `backend/services/orchestrator.py` (if needed for helper methods)
- Test: `backend/tests/test_whale_index.py`

- [x] **Step 1: Implement `WhaleIndexService.fetch_sec_filer_list()`** (Mock SEC response for testing)
- [x] **Step 2: Implement `WhaleIndexService.calculate_fund_metrics(cik, accession_number)`**
- [x] **Step 3: Implement `WhaleIndexService.sync_top_whales(limit=2000)`**
- [x] **Step 4: Write integration test for metrics calculation**
- [x] **Step 5: Commit**

### Task 3: Explorer Search API

**Files:**
- Modify: `backend/services/database.py` (Add `search_explorer` method)
- Modify: `backend/main.py` (Add `/api/explorer/search` endpoint)
- Test: `backend/tests/test_explorer_api.py`

- [x] **Step 1: Implement `search_explorer` with AND/OR logic support in SQL**
- [x] **Step 2: Create `/api/explorer/search` POST endpoint in `main.py`**
- [x] **Step 3: Write test for range-based filtering (e.g., AUM between 1B and 10B)**
- [x] **Step 4: Commit**

### Task 4: Institutional Explorer UI - Scaffolding & Routing

**Files:**
- Create: `ui/src/components/InstitutionalExplorer.tsx`
- Modify: `ui/src/App.tsx`

- [x] **Step 1: Add `explorer` view type and route to `App.tsx`**
- [x] **Step 2: Add "Institutional Explorer" link to sidebar with `Database` icon**
- [x] **Step 3: Create base `InstitutionalExplorer` component with a simple header**
- [x] **Step 4: Commit**

### Task 5: Institutional Explorer UI - Filter Builder & Results

**Files:**
- Modify: `ui/src/components/InstitutionalExplorer.tsx`

- [x] **Step 1: Build the dynamic Filter Builder (Metric/Op/Value rows)**
- [x] **Step 2: Implement the Results Table with AUM Sparklines (using `recharts`)**
- [x] **Step 3: Connect UI to `/api/explorer/search`**
- [x] **Step 4: Add "Deep Sync / Follow" button functionality**
- [x] **Step 5: Final validation of all filters**
- [x] **Step 6: Commit**
