# Stock Screener (Abrams13F)

A comprehensive tool for tracking, analyzing, and visualizing Hedge Fund 13F-HR filings from the SEC EDGAR database. This application allows users to monitor institutional portfolio changes, estimate performance, and detect crowding signals across multiple funds.

## 🚀 Key Features

*   **Automated Data Sync**: Fetches and parses 13F-HR and 13F-HR/A (amendments) directly from SEC EDGAR.
*   **Global Dashboard**: Aggregate view of all tracked funds, highlighting "Big Movers", "Portfolio Shifts", and "Crowding Signals".
*   **Deep Dive Analytics**:
    *   **Fund Summary**: Quarter-over-quarter KPI tiles (AUM, positions, new/exited), top movers, swoop opportunities, sector allocation.
    *   **Holdings Analysis**: Powerful data grid with QoQ diffing (Changed/New/Exited), expanded position history, and performance metrics.
    *   **Composition Chart**: Historical position-level stacked area chart with time range controls (2Q to MAX + CUSTOM).
    *   **Performance Estimation**: Time-Weighted Return (TWR) and IRR calculations based on public holdings.
*   **Mimic Performance**: Simulates what returns a retail investor would have achieved by copying a fund's 13F trades, with configurable initial investment, recurring contributions, and rebalancing.
*   **Institutional Explorer**: Multi-factor screener for searching the SEC 13F universe by AUM, concentration, sector, market cap DNA, and turnover. Supports AND/OR filter logic.
*   **Smart Parsing**: Handles XML formats, backfills missing tickers via CUSIP mapping, and correctly merges amendment filings. Includes smart scaling heuristic with auto-correction for values reported in thousands vs. actual dollars.
*   **Fund Groups**: Organize tracked funds into custom groups with drag-and-drop reordering.

## 🛠️ Technology Stack

### Backend
*   **Python 3.10+**
*   **FastAPI**: High-performance API framework.
*   **SQLite**: Lightweight, serverless relational database.
*   **lxml**: Efficient XML parsing for SEC documents.

### Frontend
*   **React 18** (Vite + TypeScript)
*   **Recharts**: Interactive financial charts.
*   **Lucide React**: Crisp icon set.
*   **CSS Modules**: Custom dark-mode styling.

## 🏁 Getting Started

### Prerequisites
*   Python 3.10 or higher
*   Node.js 16+ and npm

### Quick Start (Windows)

**Native Window (Electron-like)**:
```bash
./Abrams13F.bat
```

**Browser Mode (opens in Chrome/default browser)**:
```bash
./Open_in_Browser.bat
```

Both launchers will:
1.  Auto-install Python dependencies from `requirements.txt`.
2.  Start the FastAPI backend server on port 8000.
3.  Start the Vite frontend dev server.

### Manual Setup

#### 1. Backend Setup
```bash
pip install -r requirements.txt
python launcher.py          # Native window
python launcher.py --browser # Browser mode
```
*The API will be available at `http://localhost:8000`*

#### 2. Frontend Setup (Dev only)
```bash
cd ui
npm install
npm run dev
```
*The UI will be available at `http://localhost:5173`*

## 📂 Project Structure

```
/
├── backend/                # Python FastAPI Application
│   ├── data/              # SQLite database (tracker.db)
│   ├── services/          # Core business logic
│   │   ├── orchestrator.py   # Data lifecycle manager
│   │   ├── parser.py         # 13F XML parser with smart scaling
│   │   ├── database.py       # SQLite wrapper & query engine
│   │   ├── sec_client.py     # SEC EDGAR HTTP client
│   │   ├── cusip_mapper.py   # CUSIP → Ticker resolver
│   │   ├── whale_index.py    # Institutional fund metrics calculator
│   │   ├── mimic_performance.py  # Trade simulation engine
│   │   └── sector_mapper.py  # Ticker → Sector mapper
│   ├── scripts/           # Utility scripts (sync_whales, backfill_tickers)
│   ├── tests/             # Pytest test suite
│   └── main.py            # API entry point
├── ui/                     # React Frontend Application
│   ├── src/
│   │   ├── components/    # UI components
│   │   └── App.tsx        # Main application router/layout
├── Abrams13F.bat          # Native window launcher
├── Open_in_Browser.bat    # Browser mode launcher
├── launcher.py            # Python launcher script
└── requirements.txt       # Python dependencies
```

## 🧠 Core Concepts

### The Orchestrator
The `Orchestrator` service manages the data lifecycle. When you add a fund:
1.  It checks if the fund exists in the local DB.
2.  If new, it performs a **deep backfill** (default 10 years).
3.  If existing, it performs a **catch-up sync** (scanning only new filings since the last update).
4.  It handles **Amendments** by merging them with original filings to ensure data accuracy.
5.  It **auto-calculates quarterly metrics** for the Institutional Explorer.

### Smart Scaling
The parser uses a median-price heuristic to detect whether 13F values are in thousands or dollars. A secondary sanity check auto-corrects if the initial decision produces unreasonable implied share prices.

### Performance Calculation
The system calculates **Time-Weighted Returns (TWR)** to approximate fund performance. Note that this is an estimation based on quarterly snapshots and does not account for intra-quarter trading or short positions.

## 🤝 Contributing
1.  Fork the repository
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request
