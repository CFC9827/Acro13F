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

- [ ] **Step 1: Add `fund_quarterly_stats` table creation to `DatabaseManager._init_db`**
- [ ] **Step 2: Add `save_quarterly_stats` method to `DatabaseManager`**
- [ ] **Step 3: Write test to verify table creation and data persistence**
- [ ] **Step 4: Commit**

### Task 2: Whale Index Ingestor (Core Logic)

**Files:**
- Create: `backend/services/whale_index.py`
- Modify: `backend/services/orchestrator.py` (if needed for helper methods)
- Test: `backend/tests/test_whale_index.py`

- [ ] **Step 1: Implement `WhaleIndexService.fetch_sec_filer_list()`** (Mock SEC response for testing)
- [ ] **Step 2: Implement `WhaleIndexService.calculate_fund_metrics(cik, accession_number)`**
- [ ] **Step 3: Implement `WhaleIndexService.sync_top_whales(limit=2000)`**
- [ ] **Step 4: Write integration test for metrics calculation**
- [ ] **Step 5: Commit**

### Task 3: Explorer Search API

**Files:**
- Modify: `backend/services/database.py` (Add `search_explorer` method)
- Modify: `backend/main.py` (Add `/api/explorer/search` endpoint)
- Test: `backend/tests/test_explorer_api.py`

- [ ] **Step 1: Implement `search_explorer` with AND/OR logic support in SQL**
- [ ] **Step 2: Create `/api/explorer/search` POST endpoint in `main.py`**
- [ ] **Step 3: Write test for range-based filtering (e.g., AUM between 1B and 10B)**
- [ ] **Step 4: Commit**

### Task 4: Institutional Explorer UI - Scaffolding & Routing

**Files:**
- Create: `ui/src/components/InstitutionalExplorer.tsx`
- Modify: `ui/src/App.tsx`

- [ ] **Step 1: Add `explorer` view type and route to `App.tsx`**
- [ ] **Step 2: Add "Institutional Explorer" link to sidebar with `Database` icon**
- [ ] **Step 3: Create base `InstitutionalExplorer` component with a simple header**
- [ ] **Step 4: Commit**

### Task 5: Institutional Explorer UI - Filter Builder & Results

**Files:**
- Modify: `ui/src/components/InstitutionalExplorer.tsx`

- [ ] **Step 1: Build the dynamic Filter Builder (Metric/Op/Value rows)**
- [ ] **Step 2: Implement the Results Table with AUM Sparklines (using `recharts`)**
- [ ] **Step 3: Connect UI to `/api/explorer/search`**
- [ ] **Step 4: Add "Deep Sync / Follow" button functionality**
- [ ] **Step 5: Final validation of all filters**
- [ ] **Step 6: Commit**
