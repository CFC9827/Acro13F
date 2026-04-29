# Stock Screener UI

The frontend is a modern Single Page Application (SPA) built with **React** and **Vite**. It provides a responsive, dark-mode interface for exploring complex financial data.

## 🧱 Component Architecture

The application is structured around a main layout (`App.tsx`) with specialized view components:

### Core Views
*   **`GlobalDashboard.tsx`**: The landing page. Displays KPI tiles (fund count, AUM, new/exited positions), fund highlight cards, "Big Movers", "Crowding Signals" (most-held, gaining/losing), new/exited position lists, and a comparative performance chart with S&P 500 benchmark overlay. Supports fund groups with drag-and-drop reordering.
*   **`FundSummary.tsx`**: A detailed "Fact Sheet" for a single fund. Shows KPI tiles (positions, AUM, new/exited counts), top 10 holdings with weight bars, top movers (value/shares toggle), swoop opportunities (conviction price dips), sector allocation bars, and key metrics (concentration, turnover).
*   **`HoldingsTable.tsx`**: A powerful data grid showing every position with QoQ diffing (Changed/New/Exited), expandable position history, search filtering, and sortable columns. Supports both value and shares delta modes.
*   **`PortfolioChart.tsx`**: Historical stacked area chart showing position-level composition over time. Features time range controls (2Q/YTD/1Y/3Y/5Y/10Y/MAX/CUSTOM), quarter-by-quarter navigation, and detailed tooltips with per-position values. Also contains the position performance table with IRR calculations.
*   **`MimicPerformanceChart.tsx`**: Simulates retail investor returns by replaying a fund's 13F trades. Configurable initial investment, recurring contributions, and includes detailed trade-by-trade breakdown with portfolio value tracking.
*   **`InstitutionalExplorer.tsx`**: Multi-factor fund screener with dynamic filter builder (AND/OR logic), searchable results table, and support for all fund metrics (AUM, concentration, sector, cap DNA, turnover).

### Shared Components
*   **`CikSearchModal.tsx`**: Modal dialog for searching and adding new funds. Connects to the backend `/search-cik` endpoint.
*   **`SplashScreen.tsx`**: Initial loading animation.

### Shared Utilities
*   **`formatCurrency()`**: Formats numbers as `$1.2B`, `$350.5M`, `$12.3K`, etc. Exported from `PortfolioChart.tsx` and reused across components.
*   **`formatQ()`**: Converts date strings (YYYY-MM-DD) to quarter strings (e.g., "1Q '25").

## 🎨 Styling & Design System

The app uses **raw CSS** (`index.css` and component-level styles) for fine-grained control over the "Financial Terminal" aesthetic.

*   **Theme**: Dark mode by default (Slate/Gray palette).
*   **Colors**: Semantic colors for financial data:
    *   Green (`#10b981`): Positive change.
    *   Red (`#ef4444`): Negative change.
    *   Blue (`#3b82f6`): Neutral/Info.
    *   Amber (`#eab308`): Warning/Swoop opportunities.

## 🔄 State Management

State is managed via React's `useState` and `useEffect` within `App.tsx` and propagated down via props.
*   **`funds`**: List of all available funds.
*   **`selectedCik`**: The currently active fund.
*   **`view`**: The current active tab (`dashboard`, `summary`, `table`, `chart`, `mimic`, `explorer`).

## 📦 Scripts
*   `npm run dev`: Start dev server.
*   `npm run build`: Production build (outputs to `dist/`).
*   `npm run preview`: Preview the production build locally.
