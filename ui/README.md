# Stock Screener UI

The frontend is a modern Single Page Application (SPA) built with **React** and **Vite**. It provides a responsive, dark-mode interface for exploring complex financial data.

## 🧱 Component Architecture

The application is structured around a main layout (`App.tsx`) with specialized view components:

### Core Views
*   **`GlobalDashboard.tsx`**: The landing page. Displays high-level cards for "Fund Highlights", "Crowding Signals", and "Big Movers". Aggregates data from all tracked funds.
*   **`FundSummary.tsx`**: A detailed "Fact Sheet" for a single fund. Shows top holdings, concentration metrics, and recent activity.
*   **`HoldingsTable.tsx`**: A powerful data grid showing every position.
    *   **Features/Logic**: Supports "Diffing" against the previous quarter to show Changed/New/Exited positions.
*   **`PortfolioChart.tsx`**: Visualizes asset allocation (Sector/Industry) and historical value trends over time.

### Shared Components
*   **`CikSearchModal.tsx`**: A modal dialog for searching and adding new funds. Connects to the backend `/search-cik` endpoint.
*   **`SplashScreen.tsx`**: Initial loading animation.

## 🎨 Styling & Design System

The app uses **raw CSS modules** (imported in `index.css` and component-specific styles) rather than a utility library like Tailwind. This allows for fine-grained control over the "Financial Terminal" aesthetic.

*   **Theme**: Dark mode by default (Slate/Gray palette).
*   **Colors**: Semantic colors for financial data:
    *   Green (`#10b981`): Positive change.
    *   Red (`#ef4444`): Negative change.
    *   Blue (`#3b82f6`): Neutral/Info.

## 🔄 State Management

State is primarily managed via React's `useState` and `useEffect` within `App.tsx` and propagated down via props.
*   **`funds`**: List of all available funds.
*   **`selectedCik`**: The currently active fund being viewed.
*   **`view`**: The current active tab ('dashboard', 'summary', 'table', 'chart').

For larger scale state in the future, we might consider Context API or Redux, but the current prop-drilling is sufficient for the app's complexity.

## 🚀 Development Tips

### Adding a New Chart
Use **Recharts** for all visualizations.
1.  Import the chart components (e.g., `<BarChart>`, `<PieChart>`).
2.  Format your data into a flat array of objects (e.g., `[{name: 'Tech', value: 100}, ...]`).
3.  Add the component to `ui/src/components/`.

### Date Formatting
Use the standard helper `formatQ` (in `App.tsx`) to convert date strings (YYYY-MM-DD) into Quarter strings (e.g., "Q4 '24").

## 📦 Scripts
*   `npm run dev`: Start dev server.
*   `npm run build`: Production build (outputs to `dist/`).
*   `npm run preview`: Preview the production build locally.
