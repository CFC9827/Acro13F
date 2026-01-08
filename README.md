# Stock Screener (Abrams13F)

A comprehensive tool for tracking, analyzing, and visualizing Hedge Fund 13F-HR filings from the SEC EDGAR database. This application allows users to monitor institutional portfolio changes, estimate performance, and detect crowding signals across multiple funds.

![Dashboard Preview](ui/public/dashboard_preview.png) *Note: Add a screenshot here if available.*

## 🚀 Key Features

*   **Automated Data Sync**: Fetches and parses 13F-HR and 13F-HR/A (amendments) directly from SEC EDGAR.
*   **Global Dashboard**: Aggregate view of all tracked funds, highlighting "Big Movers", "Portfolio Shifts", and "Crowding Signals".
*   **Deep Dive Analytics**:
    *   **Holdings Analysis**: Quarter-over-quarter changes in positions.
    *   **Performance Estimation**: Time-Weighted Return (TWR) logic to estimate fund performance based on public holdings.
    *   **Visualizations**: Sector allocation, concentration sizing, and historical trend charts.
*   **Smart Parsing**: Handles XML formats, backfills missing tickers via CUSIP mapping, and correctly merges amendment filings.

## 🛠️ Technology Stack

### Backend
*   **Python 3.10+**
*   **FastAPI**: High-performance API framework.
*   **SQLite**: Lightweight, serverless relational database.
*   **lxml**: Efficient XML parsing for SEC documents.
*   **Pandas**: Data manipulation and analysis.

### Frontend
*   **React 18** (Vite + TypeScript)
*   **Recharts**: Interactive financial charts.
*   **Lucide React**: Crisp icon set.
*   **CSS Modules**: Custom styling.

## 🏁 Getting Started

### Prerequisites
*   Python 3.10 or higher
*   Node.js 16+ and npm

### Quick Start (Windows)
The easiest way to start the application is using the included batch script:

```bash
./start_screener.bat
```

This will:
1.  Start the FastAPI backend server on port 8000.
2.  Start the Vite frontend development server (usually port 5173).

### Manual Setup

#### 1. Backend Setup
```bash
cd backend
python -m venv venv
# Activate venv: venv\Scripts\activate (Windows) or source venv/bin/activate (Linux/Mac)
pip install -r requirements.txt
python main.py
```
*The API will be available at `http://localhost:8000`*

#### 2. Frontend Setup
```bash
cd ui
npm install
npm run dev
```
*The UI will be available at `http://localhost:5173` (or similar)*

## 📂 Project Structure

```
/
├── backend/                # Python FastAPI Application
│   ├── data/              # SQLite database (tracker.db)
│   ├── services/          # Core business logic (Orchestrator, Parser, DB)
│   └── main.py            # API Entry point
├── ui/                     # React Frontend Application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   └── App.tsx        # Main application router/layout
├── start_screener.bat     # One-click launcher
└── requirements.txt       # Python dependencies
```

## 🧠 Core Concepts

### The Orchestrator
The `Orchestrator` service (`backend/services/orchestrator.py`) manages the data lifecycle. When you add a fund:
1.  It checks if the fund exists in the local DB.
2.  If new, it performs a **deep backfill** (default 10 years).
3.  If existing, it performs a **catch-up sync** (scanning only new filings since the last update).
4.  It handles **Amendments** by merging them with original filings to ensure data accuracy.

### Performance Calculation
The system calculates **Time-Weighted Returns (TWR)** to approximate fund performance. Note that this is an estimation based on quarterly snapshots and does not account for intra-quarter trading or short positions (which are not reported in 13Fs).

## 🤝 Contributing
1.  Fork the repository
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request
