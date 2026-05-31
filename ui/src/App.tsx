import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layout, LayoutGrid, TrendingUp, Search, RefreshCw, ChevronRight, ChevronLeft, Trash2, AlertCircle, BarChart3, PieChart, Activity, Info, ChevronDown, PanelLeftClose, PanelLeft, List, Database, PlusCircle, ExternalLink, Command, Check, Plus } from 'lucide-react'
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from 'recharts'
import { PortfolioChart, formatCurrency } from './components/PortfolioChart'
import { PerformanceChart } from './components/PerformanceChart'
import { HoldingsTable } from './components/HoldingsTable'
import { GlobalDashboard } from './components/GlobalDashboard'
import { FundSummary } from './components/FundSummary'
import { CommandPalette } from './components/CommandPalette'
import { AboutPage } from './components/AboutPage'
import { InstitutionalExplorer } from './components/InstitutionalExplorer'
import { SplashScreen } from './components/SplashScreen'
import { ActivityView } from './components/ActivityView'
import { Onboarding } from './components/Onboarding'
import { calculateIRR } from './utils/performanceUtils'
import { MimicPerformanceChart } from './components/MimicPerformanceChart'
import { PerformanceExportModal } from './components/PerformanceExportModal'
import { useAuth } from './contexts/AuthContext'
import { LoginPage } from './components/LoginPage'
import { LogOut } from 'lucide-react'
import { fetchWithAuth } from './utils/api'

// Type for view states
type ViewType = 'table' | 'chart' | 'performance' | 'mimic' | 'about' | 'dashboard' | 'summary' | 'activity' | 'explorer';

// Parse URL path to extract view and CIK
function parseUrlPath(pathname: string): { view: ViewType; cik: string | null } {
    const segments = pathname.split('/').filter(Boolean);

    if (segments.length === 0) {
        return { view: 'dashboard', cik: null };
    }

    if (segments[0] === 'about') {
        return { view: 'about', cik: null };
    }

    if (segments[0] === 'explorer') {
        return { view: 'explorer', cik: null };
    }

    if (segments[0] === 'fund' && segments[1]) {
        const cik = segments[1];
        const subView = segments[2] as ViewType | undefined;
        if (subView && ['table', 'chart', 'performance', 'mimic', 'activity'].includes(subView)) {
            return { view: subView, cik };
        }
        return { view: 'summary', cik };
    }

    return { view: 'dashboard', cik: null };
}

// Build URL path from view and CIK
function buildUrlPath(view: ViewType, cik: string | null): string {
    if (view === 'dashboard') return '/';
    if (view === 'about') return '/about';
    if (view === 'explorer') return '/explorer';
    if (cik) {
        if (view === 'summary') return `/fund/${cik}`;
        return `/fund/${cik}/${view}`;
    }
    return '/';
}

const getFundEdgarUrl = (cik?: string) => {
    if (!cik) return undefined;
    const cleanCik = cik.replace(/^0+/, ''); // Remove leading zeros
    return `https://www.sec.gov/edgar/browse/?CIK=${cleanCik}`;
};

interface Fund {
    cik: string;
    name: string;
}

interface Holding {
    id: number;
    issuer_name: string;
    cusip: string;
    ticker?: string;
    shares: number;
    value: number;
}

interface HistoricalHolding extends Holding {
    period_of_report: string;
}

interface BenchmarkData {
    date: string;
    value: number;
    return: number;
}

const COLORS = [
    '#fb7185', // Rose 400
    '#38bdf8', // Sky 400
    '#fbbf24', // Amber 400
    '#a78bfa', // Violet 400
    '#f472b6', // Pink 400
    '#fb923c', // Orange 400
    '#22d3ee', // Cyan 400
    '#db2777', // Pink 600
    '#ea580c', // Orange 600
    '#0891b2', // Cyan 600
    '#2563eb', // Blue 600
    '#9333ea', // Purple 600
    '#dc2626', // Red 600
    '#ca8a04'  // Yellow 600
];

function App() {
    const { user, session, loading: authLoading, signOut } = useAuth();
    const reactNavigate = useNavigate();
    const location = useLocation();

    // Derive view and selectedCik from URL
    const { view, cik: selectedCik } = parseUrlPath(location.pathname);



    // Navigation helper that updates URL (which triggers re-render with new view/cik)
    const navigate = (newView: ViewType, newCik: string | null = null) => {
        const path = buildUrlPath(newView, newCik);
        reactNavigate(path);
        // Refresh tracked list on major navigation to ensure state is fresh
        if (newView === 'dashboard' || newView === 'explorer' || newView === 'summary') {
            fetchFunds(true);
        }
    };

    const [showSplash, setShowSplash] = useState(true);
    const handleSplashComplete = useCallback(() => {
        console.log("App.tsx: Splash animation complete callback triggered");
        setShowSplash(false);
    }, []);

    // The app is truly ready when auth is done and the splash timer has finished
    const isSplashActive = authLoading || showSplash;

    const [funds, setFunds] = useState<Fund[]>([])
    const [holdings, setHoldings] = useState<Holding[]>([])

    const formatQ = (dateStr: string) => {
        const d = new Date(dateStr);
        const q = Math.floor((d.getMonth() + 3) / 3);
        return `Q${q} '${d.getFullYear().toString().slice(2)}`;
    };
    const [history, setHistory] = useState<HistoricalHolding[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notification, setNotification] = useState<{ message: string, type: 'success' | 'info' } | null>(null)
    const [activeFundName, setActiveFundName] = useState<string | null>(null)
    const [dashboardSummary, setDashboardSummary] = useState<any>(null)
    const [isTrackingSyncing, setIsTrackingSyncing] = useState(false)

    const isCurrentFundTracked = useMemo(() => {
        if (!selectedCik || !funds) return false;
        const cleanCik = selectedCik.replace(/^0+/, '');
        return funds.some(f => f.cik.replace(/^0+/, '') === cleanCik);
    }, [selectedCik, funds]);

    const toggleTrack = async (cik: string, currentStatus: boolean) => {
        setIsTrackingSyncing(true);
        try {
            const res = await fetchWithAuth(`/api/funds/${cik}/track?track=${!currentStatus}`, {
                method: 'POST'
            }, session);
            if (res.ok) {
                await fetchFunds(true); // Always refresh tracked list
                setNotification({ 
                    message: !currentStatus ? "Fund added to tracked list" : "Fund removed from tracked list", 
                    type: 'success' 
                });
                // If we added it, we should probably refresh dashboard summary too
                if (!currentStatus) fetchDashboardSummary();
            }
        } catch (err) {
            console.error("Failed to toggle track", err);
            setError("Failed to update tracking status");
        } finally {
            setIsTrackingSyncing(false);
        }
    };

    const [timeRange, setTimeRange] = useState('1Y')
    const [offset, setOffset] = useState(0) // Number of quarters to offset from latest
    const [filingRange, setFilingRange] = useState<{ earliest: string | null, latest: string | null, total: number } | null>(null)
    const [legacyInfo, setLegacyInfo] = useState<{ count: number, start: string, end: string } | null>(null)
    const [showLegacyTooltip, setShowLegacyTooltip] = useState(false)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [draggedFundCik, setDraggedFundCik] = useState<string | null>(null)
    const [showOnboarding, setShowOnboarding] = useState(false)
    const [isConfigured, setIsConfigured] = useState(true) // Default to true until checked
    const [showCommandPalette, setShowCommandPalette] = useState(false);

    // DIAGNOSTIC LOGS
    useEffect(() => {
        console.log("App.tsx Auth State:", { 
            authLoading, 
            hasUser: !!user, 
            email: user?.email,
            showSplash 
        });
    }, [authLoading, user, showSplash]);

    useEffect(() => {
        console.log("App.tsx View State:", { view, selectedCik });
    }, [view, selectedCik]);

    // Keyboard shortcut for Command Palette
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setShowCommandPalette(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Auto-clear notification after 5s
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 5000)
            return () => clearTimeout(timer)
        }
    }, [notification])

    useEffect(() => {
        if (!user) return;
        checkConfig()
        fetchFunds()
    }, [user])

    const checkConfig = async () => {
        try {
            const res = await fetchWithAuth('/api/config', {}, session)
            const data = await res.json()
            setIsConfigured(data.is_configured)
            if (!data.is_configured) {
                setShowOnboarding(true)
            }
        } catch (err) {
            console.error("Failed to check config", err)
        }
    }

    const fetchFunds = async (trackedOnly: boolean = true) => {
        try {
            const res = await fetchWithAuth(`/api/funds?tracked_only=${trackedOnly}`, {}, session)
            const data = await res.json()
            setFunds(data)
        } catch (err) {
            console.error("Failed to fetch funds", err)
        }
    }

    useEffect(() => {
        if (!user) return;
        if (view === 'dashboard' && !dashboardSummary) {
            fetchDashboardSummary();
        }
    }, [view, user, dashboardSummary]);

    const fetchDashboardSummary = async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth('/api/dashboard/summary', {}, session);
            const data = await res.json();
            setDashboardSummary(data);
        } catch (err) {
            console.error("Failed to fetch dashboard summary", err);
            setError("Failed to load dashboard data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedCik && user) {
            // Note: View is already set via URL, just load data
            setLoading(true)
            setError(null)
            setLegacyInfo(null)

            if (!funds.some(f => f.cik.replace(/^0+/, '') === selectedCik.replace(/^0+/, ''))) {
                fetchWithAuth(`/api/fund-info/${selectedCik}`, {}, session)
                    .then(res => res.json())
                    .then(data => {
                        if (data.name) setActiveFundName(data.name);
                    })
                    .catch(e => console.error("Failed to fetch fund info", e));
            } else {
                setActiveFundName(null);
            }

            const p1 = fetchWithAuth(`/api/funds/${selectedCik}/holdings`, {}, session)
                .then(res => res.json())
                .then(data => setHoldings(data))

            const p2 = fetchWithAuth(`/api/funds/${selectedCik}/history`, {}, session)
                .then(res => res.json())
                .then(data => setHistory(data))

            const p3 = fetchWithAuth(`/api/funds/${selectedCik}/filing-range`, {}, session)
                .then(res => {
                    if (!res.ok) throw new Error(`Filing range failed: ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    console.log('Filing range loaded:', data);
                    setFilingRange(data);
                })
                .catch(err => console.error("Filing range error:", err));

            Promise.all([p1, p2, p3]).then(() => setLoading(false)).catch(() => {
                setError("Failed to load data")
                setLoading(false)
            })
        }
    }, [selectedCik, user]);

    const handleDeleteFromList = async (e: React.MouseEvent, cik: string) => {
        e.stopPropagation()
        await toggleTrack(cik, true);
    }

    // Fund drag-and-drop handlers
    const handleFundDragStart = (e: React.DragEvent, cik: string) => {
        setDraggedFundCik(cik);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', cik);
        // Add slight opacity to dragged item
        setTimeout(() => {
            (e.target as HTMLElement).style.opacity = '0.4';
        }, 0);
    };

    const handleFundDragEnd = (e: React.DragEvent) => {
        setDraggedFundCik(null);
        (e.target as HTMLElement).style.opacity = '1';
    };

    const handleFundDragOver = (e: React.DragEvent, targetCik: string) => {
        e.preventDefault();
        if (draggedFundCik === null || draggedFundCik === targetCik) return;

        setFunds(prevFunds => {
            const dragIndex = prevFunds.findIndex(f => f.cik === draggedFundCik);
            const targetIndex = prevFunds.findIndex(f => f.cik === targetCik);

            if (dragIndex === -1 || targetIndex === -1) return prevFunds;

            const newFunds = [...prevFunds];
            const [draggedItem] = newFunds.splice(dragIndex, 1);
            newFunds.splice(targetIndex, 0, draggedItem);
            return newFunds;
        });
    };

    const handleFundDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        // Build orders object mapping cik to new sort_order
        const orders: { [key: string]: number } = {};
        funds.forEach((f, index) => { orders[f.cik] = index; });

        try {
            await fetchWithAuth('/api/funds/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orders)
            }, session);
        } catch (err) {
            console.error("Failed to save fund order", err);
        }
    };

    // Boot Sequence Logic
    // 1. Show splash while auth is loading
    if (authLoading) {
        return <SplashScreen onComplete={handleSplashComplete} />;
    }

    // 2. If no user, go to login immediately (skip splash if desired, or keep it)
    if (!user) {
        return <LoginPage />;
    }

    // 3. If user exists, keep splash until timer finishes
    if (showSplash) {
        return <SplashScreen onComplete={handleSplashComplete} />;
    }

    return (
        <>
            <div className="app-container" style={{ 
                animation: 'fadeIn 0.5s ease-out',
                background: '#020617',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100vh',
                width: '100%'
            }}>
                <header className="app-header">
                    <div className="logo">
                        <TrendingUp size={24} />
                        <span style={{
                            marginLeft: '8px',
                            fontSize: '1.2rem',
                            fontWeight: 700,
                            color: '#f8fafc',
                            letterSpacing: '-0.02em'
                        }}>Abrams13F</span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <button
                            onClick={() => setShowCommandPalette(true)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                background: 'rgba(51, 65, 85, 0.5)',
                                color: '#94a3b8',
                                border: '1px solid rgba(148, 163, 184, 0.2)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.borderColor = '#3b82f6'}
                            onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)'}
                        >
                            <Search size={16} />
                            <span style={{ opacity: 0.7 }}>Search...</span>
                            <span style={{ 
                                marginLeft: '8px', 
                                background: '#1e293b', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                fontSize: '10px',
                                border: '1px solid #334155'
                            }}>CTRL K</span>
                        </button>
                        <button
                            onClick={() => navigate('about', null)}
                            className={`tab ${view === 'about' ? 'active' : ''}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 16px',
                                background: view === 'about' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                                color: view === 'about' ? '#60a5fa' : '#94a3b8',
                                border: `1px solid ${view === 'about' ? '#3b82f6' : 'rgba(148, 163, 184, 0.2)'}`,
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 500,
                                transition: 'all 0.2s'
                            }}
                        >
                            <Info size={16} />
                            About
                        </button>
                        
                        {user?.email && (
                            <span
                                title={user.email}
                                style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600 }}
                            >
                                {user.email}
                            </span>
                        )}

                        <button
                            onClick={() => signOut()}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: '#f87171',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 500,
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                            onMouseOut={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                        >
                            <LogOut size={16} />
                            Sign Out
                        </button>
                    </div>
                </header>

                <main className="app-main">
                    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
                        <div className="sidebar-header">
                            <button
                                className={`dashboard-nav-btn ${view === 'dashboard' ? 'active' : ''}`}
                                onClick={() => {
                                    navigate('dashboard', null);
                                }}
                            >
                                <LayoutGrid size={18} />
                                {!sidebarCollapsed && <span>Tracked Funds</span>}
                            </button>
                            <button
                                className={`dashboard-nav-btn ${view === 'explorer' ? 'active' : ''}`}
                                onClick={() => {
                                    navigate('explorer', null);
                                }}
                            >
                                <Database size={18} />
                                {!sidebarCollapsed && <span>Discovery Explorer</span>}
                            </button>
                            <button
                                className="sidebar-toggle"
                                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            >
                                {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
                            </button>
                        </div>
                        <div className="divider"></div>
                        <div className="sidebar-content">

                            <div className="section-title">
                                {!sidebarCollapsed && <span>TRACKED FUNDS</span>}
                                 {!sidebarCollapsed && (
                                    <div style={{ flex: 1 }}></div>
                                )}
                            </div>
                            {!sidebarCollapsed && (
                                <ul className="fund-list">
                                    {funds.map((f: Fund) => (
                                        <li
                                            key={f.cik}
                                            className={`${selectedCik === f.cik ? 'active' : ''} ${draggedFundCik === f.cik ? 'dragging' : ''}`}
                                            onClick={() => navigate('summary', f.cik)}
                                            draggable
                                            onDragStart={(e) => handleFundDragStart(e, f.cik)}
                                            onDragEnd={handleFundDragEnd}
                                            onDragOver={(e) => handleFundDragOver(e, f.cik)}
                                            onDrop={handleFundDrop}
                                        >
                                            <div className="fund-info">
                                                <span className="fund-name">{f.name}</span>
                                                <span className="fund-cik">{f.cik}</span>
                                            </div>
                                            <div className="fund-actions">
                                                 <Trash2
                                                    size={16}
                                                    className="delete-btn"
                                                    onClick={(e) => handleDeleteFromList(e, f.cik)}
                                                />
                                                <ChevronRight size={14} className="chevron" />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </aside>

                    <section className="content">
                        {error && (
                            <div className="error-banner">
                                <AlertCircle size={20} />
                                <span>{error}</span>
                            </div>
                        )}

                        {notification && (
                            <div className={`notification-banner ${notification.type}`}>
                                <TrendingUp size={18} />
                                <span>{notification.message}</span>
                            </div>
                        )}

                        {view === 'dashboard' ? (
                            <GlobalDashboard
                                summary={dashboardSummary || { fund_highlights: [], big_movers: [], portfolio_shifts: [], consensus_stocks: [], kpis: { fund_count: 0, total_aum: 0, prior_aum: 0 } }}
                                onSelectFund={(cik) => {
                                    navigate('summary', cik);
                                }}
                                allFunds={funds}
                            />
                        ) : view === 'explorer' ? (
                            <InstitutionalExplorer 
                                onFollow={(cik) => navigate('summary', cik)} 
                                onTrackToggle={async () => { await fetchFunds(true); await fetchDashboardSummary(); }}
                            />
                        ) : selectedCik && view !== 'about' ? (
                            <div className="holdings-view">
                                <div className="view-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flexShrink: 1 }}>
                                        <h2 style={{
                                            maxWidth: '450px',
                                            margin: 0,
                                            lineHeight: 1.3
                                        }}>
                                            Holdings for {(activeFundName || funds.find(f => f.cik.replace(/^0+/, '') === selectedCik?.replace(/^0+/, ''))?.name)}
                                        </h2>
                                        {selectedCik && (
                                            <a
                                                href={getFundEdgarUrl(selectedCik)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="sec-link-btn"
                                                title="View on SEC EDGAR"
                                                style={{ flexShrink: 0 }}
                                            >
                                                <ExternalLink size={18} />
                                            </a>
                                        )}
                                    </div>
                                    <div className="view-tabs">
                                        <button
                                            className={`tab track-btn-context ${isCurrentFundTracked ? 'active-tracked' : ''}`}
                                            onClick={() => selectedCik && toggleTrack(selectedCik, isCurrentFundTracked)}
                                            disabled={isTrackingSyncing}
                                            style={{
                                                background: isCurrentFundTracked ? 'rgba(16, 185, 129, 0.1)' : 'rgba(56, 189, 248, 0.05)',
                                                color: isCurrentFundTracked ? '#10b981' : '#38bdf8',
                                                border: `1px solid ${isCurrentFundTracked ? 'rgba(16, 185, 129, 0.3)' : 'rgba(56, 189, 248, 0.2)'}`,
                                                borderRadius: '8px',
                                                padding: '4px 12px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                marginRight: '8px',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {isTrackingSyncing ? (
                                                <Loader2 className="spin" size={14} />
                                            ) : isCurrentFundTracked ? (
                                                <Check size={14} />
                                            ) : (
                                                <Plus size={14} />
                                            )}
                                            {isCurrentFundTracked ? 'Tracked' : 'Track Fund'}
                                        </button>
                                        <div className="tab-divider"></div>

                                        <button
                                            className={view === 'summary' ? 'tab active' : 'tab'}
                                            onClick={() => navigate('summary', selectedCik)}
                                        >
                                            <Activity size={16} /> Summary
                                        </button>
                                        <button
                                            className={view === 'table' ? 'tab active' : 'tab'}
                                            onClick={() => navigate('table', selectedCik)}
                                        >
                                            <LayoutGrid size={16} /> Holdings
                                        </button>
                                        <button
                                            className={`tab ${view === 'activity' ? 'active' : ''}`}
                                            onClick={() => navigate('activity', selectedCik)}
                                        >
                                            <List size={18} /> Activity
                                        </button>
                                        <button
                                            className={`tab ${view === 'chart' ? 'active' : ''}`}
                                            onClick={() => navigate('chart', selectedCik)}
                                        >
                                            <PieChart size={18} /> Composition
                                        </button>
                                        <button
                                            className={`tab ${(view === 'performance' || view === 'mimic') ? 'active' : ''}`}
                                            onClick={() => navigate('performance', selectedCik)}
                                        >
                                            <TrendingUp size={14} />
                                            Performance
                                        </button>
                                    </div>
                                </div>

                                {/* Data Range Info Bar: High Contrast and Fixed to Top of View Area */}
                                {filingRange && filingRange.earliest && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '6px 0', // Reduced padding since no border
                                        borderRadius: '8px',
                                        // border: '1px solid #38bdf8', // Removed border
                                        color: '#38bdf8', // Electric blue
                                        fontSize: '13px',
                                        fontWeight: '500',
                                        marginTop: '8px',
                                        marginBottom: '8px',
                                        width: '100%'
                                    }}>

                                        <div
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: legacyInfo ? 'help' : 'default', position: 'relative' }}
                                            onMouseEnter={() => legacyInfo && setShowLegacyTooltip(true)}
                                            onMouseLeave={() => setShowLegacyTooltip(false)}
                                        >
                                            <Info size={16} color={legacyInfo ? '#38bdf8' : 'currentColor'} />
                                            <span>
                                                Coverage Range: {(() => {
                                                    return `${formatQ(filingRange.earliest!)} - ${formatQ(filingRange.latest!)} (${filingRange.total} quarterly filings)`;
                                                })()}
                                            </span>
                                            {showLegacyTooltip && legacyInfo && (
                                                <div style={{
                                                    position: 'absolute',
                                                    bottom: '100%',
                                                    left: '50%',
                                                    transform: 'translateX(-50%)',
                                                    marginBottom: '8px',
                                                    backgroundColor: '#0f172a',
                                                    color: '#f8fafc',
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #334155',
                                                    fontSize: '11px',
                                                    whiteSpace: 'nowrap',
                                                    zIndex: 100,
                                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                                                }}>
                                                    Skipped {legacyInfo.count} legacy filings ({legacyInfo.start} - {legacyInfo.end})
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '100%',
                                                        left: '50%',
                                                        transform: 'translateX(-50%)',
                                                        borderWidth: '4px',
                                                        borderStyle: 'solid',
                                                        borderColor: '#0f172a transparent transparent transparent'
                                                    }} />
                                                </div>
                                            )}
                                        </div>


                                        {(view === 'performance' || view === 'mimic') && (
                                            <div style={{ marginLeft: 'auto' }}>
                                                <div style={{
                                                    display: 'flex',
                                                    background: '#e2e8f0',
                                                    padding: '3px',
                                                    borderRadius: '10px',
                                                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)'
                                                }}>
                                                    <button
                                                        onClick={() => navigate('performance', selectedCik)}
                                                        style={{
                                                            padding: '6px 16px',
                                                            borderRadius: '8px',
                                                            fontSize: '12px',
                                                            fontWeight: 600,
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            background: view === 'performance' ? '#ffffff' : 'transparent',
                                                            color: view === 'performance' ? '#0f172a' : '#64748b',
                                                            boxShadow: view === 'performance' ? '0 2px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' : 'none',
                                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px'
                                                        }}
                                                    >
                                                        <TrendingUp size={14} style={{ opacity: view === 'performance' ? 1 : 0.6 }} />
                                                        Reported
                                                    </button>
                                                    <button
                                                        onClick={() => navigate('mimic', selectedCik)}
                                                        style={{
                                                            padding: '6px 16px',
                                                            borderRadius: '8px',
                                                            fontSize: '12px',
                                                            fontWeight: 600,
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            background: view === 'mimic' ? '#ffffff' : 'transparent',
                                                            color: view === 'mimic' ? '#0f172a' : '#64748b',
                                                            boxShadow: view === 'mimic' ? '0 2px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' : 'none',
                                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px'
                                                        }}
                                                    >
                                                        <BarChart3 size={14} style={{ opacity: view === 'mimic' ? 1 : 0.6 }} />
                                                        Mimic 13F
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {loading ? (
                                    <div className="loading-state">
                                        <RefreshCw className="spin" style={{ marginBottom: 16 }} />
                                <div>Loading data...</div>
                                    </div>
                                ) : view === 'chart' ? (
                                    <PortfolioChart
                                        data={history}
                                        timeRange={timeRange as any}
                                        onTimeRangeChange={(r) => { setTimeRange(r); setOffset(0); }}
                                        offset={offset}
                                        onOffsetChange={setOffset}
                                    />
                                ) : view === 'summary' ? (
                                    <FundSummary
                                        history={history}
                                        fundName={(activeFundName || funds.find(f => f.cik.replace(/^0+/, '') === selectedCik?.replace(/^0+/, ''))?.name) || 'Fund'}
                                        cik={selectedCik || undefined}
                                        onOpenHoldings={() => navigate('table', selectedCik)}
                                        onOpenActivity={() => navigate('activity', selectedCik)}
                                        onOpenComposition={() => navigate('chart', selectedCik)}
                                        onOpenPerformance={() => navigate('performance', selectedCik)}
                                    />
                                ) : (view === 'performance' || view === 'mimic') ? (
                                    <div className="performance-view-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            {view === 'performance' ? (
                                                <PerformanceChart
                                                    data={history}
                                                    timeRange={timeRange}
                                                    onTimeRangeChange={(r) => { setTimeRange(r); setOffset(0); }}
                                                    offset={offset}
                                                    onOffsetChange={setOffset}
                                                    fundName={(activeFundName || funds.find(f => f.cik.replace(/^0+/, '') === selectedCik?.replace(/^0+/, ''))?.name) || 'Fund'}
                                                />
                                            ) : (
                                                <MimicPerformanceChart
                                                    cik={selectedCik || ''}
                                                    fundName={(activeFundName || funds.find(f => f.cik.replace(/^0+/, '') === selectedCik?.replace(/^0+/, ''))?.name) || 'Fund'}
                                                />
                                            )}
                                        </div>
                                    </div>
                                ) : view === 'activity' ? (
                                    <ActivityView history={history} fundName={(activeFundName || funds.find(f => f.cik.replace(/^0+/, '') === selectedCik?.replace(/^0+/, ''))?.name) || 'Fund'} />
                                ) : (
                                    <HoldingsTable
                                        history={history}
                                        fundName={(activeFundName || funds.find(f => f.cik.replace(/^0+/, '') === selectedCik?.replace(/^0+/, ''))?.name) || 'Hedge Fund Portfolio'}
                                        onFollow={(cik) => navigate('summary', cik)}
                                    />
                                )}
                            </div>
                        ) : view === 'about' ? (
                            <div className="holdings-view">
                                <div className="view-header">
                                    <h2>Methodology & Metrics</h2>
                                    {selectedCik && (
                                        <div className="view-tabs">
                                            <button
                                                className="tab"
                                                onClick={() => navigate('table', selectedCik)}
                                            >
                                                <Layout size={16} /> Table
                                            </button>
                                            <button
                                                className="tab"
                                                onClick={() => navigate('chart', selectedCik)}
                                            >
                                                <PieChart size={18} /> Composition
                                            </button>
                                            <button
                                                className="tab"
                                                onClick={() => navigate('performance', selectedCik)}
                                            >
                                                <TrendingUp size={18} /> Performance
                                            </button>
                                            <button
                                                className="tab"
                                                onClick={() => navigate('mimic', selectedCik)}
                                            >
                                                <BarChart3 size={18} /> Mimic
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <AboutPage />
                            </div>
                        ) : (
                            <div className="empty-state">
                                <Layout size={48} />
                                <p>Select a fund from the sidebar or add a new CIK to start.</p>
                            </div>
                        )}
                    </section>
                </main>
            </div >
            {showOnboarding && (
                <Onboarding onComplete={() => {
                    setShowOnboarding(false);
                    setIsConfigured(true);
                    fetchFunds();
                    fetchDashboardSummary();
                }} />
            )
            }
            <CommandPalette 
                isOpen={showCommandPalette} 
                onClose={() => setShowCommandPalette(false)} 
                onNavigate={navigate} 
            />
        </>
    )
}

export default App
