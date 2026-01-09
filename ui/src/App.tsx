import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layout, LayoutGrid, TrendingUp, Search, RefreshCw, ChevronRight, ChevronLeft, Trash2, AlertCircle, BarChart3, PieChart, Activity, Info, ChevronDown, PanelLeftClose, PanelLeft, List, Database, PlusCircle, ExternalLink } from 'lucide-react'
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from 'recharts'
import { PortfolioChart, formatCurrency } from './components/PortfolioChart'
import { HoldingsTable } from './components/HoldingsTable'
import { GlobalDashboard } from './components/GlobalDashboard'
import { FundSummary } from './components/FundSummary'
import { AboutPage } from './components/AboutPage'
import { SplashScreen } from './components/SplashScreen'
import { CikSearchModal } from './components/CikSearchModal'
import { calculateIRR } from './utils/performanceUtils'

// Type for view states
type ViewType = 'table' | 'chart' | 'performance' | 'about' | 'dashboard' | 'summary';

// Parse URL path to extract view and CIK
function parseUrlPath(pathname: string): { view: ViewType; cik: string | null } {
    const segments = pathname.split('/').filter(Boolean);

    if (segments.length === 0) {
        return { view: 'dashboard', cik: null };
    }

    if (segments[0] === 'about') {
        return { view: 'about', cik: null };
    }

    if (segments[0] === 'fund' && segments[1]) {
        const cik = segments[1];
        const subView = segments[2] as ViewType | undefined;
        if (subView && ['table', 'chart', 'performance'].includes(subView)) {
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

const getColorForString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return COLORS[Math.abs(hash) % COLORS.length];
};

function App() {
    const reactNavigate = useNavigate();
    const location = useLocation();

    // Derive view and selectedCik from URL
    const { view, cik: selectedCik } = parseUrlPath(location.pathname);

    // Navigation helper that updates URL (which triggers re-render with new view/cik)
    const navigate = (newView: ViewType, newCik: string | null = null) => {
        const path = buildUrlPath(newView, newCik);
        reactNavigate(path);
    };

    const [funds, setFunds] = useState<Fund[]>([])
    const [holdings, setHoldings] = useState<Holding[]>([])

    const formatQ = (dateStr: string) => {
        const d = new Date(dateStr);
        const q = Math.floor((d.getMonth() + 3) / 3);
        return `Q${q} '${d.getFullYear().toString().slice(2)}`;
    };
    const [history, setHistory] = useState<HistoricalHolding[]>([])
    const [loading, setLoading] = useState(false)
    const [loadingMessage, setLoadingMessage] = useState("")
    const [refreshCik, setRefreshCik] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [notification, setNotification] = useState<{ message: string, type: 'success' | 'info' } | null>(null)
    const [dashboardSummary, setDashboardSummary] = useState<any>(null)
    const [timeRange, setTimeRange] = useState('1Y')
    const [offset, setOffset] = useState(0) // Number of quarters to offset from latest
    const [filingRange, setFilingRange] = useState<{ earliest: string | null, latest: string | null, total: number } | null>(null)
    const [legacyInfo, setLegacyInfo] = useState<{ count: number, start: string, end: string } | null>(null)
    const [showLegacyTooltip, setShowLegacyTooltip] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [showSplash, setShowSplash] = useState(true)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [showCikSearch, setShowCikSearch] = useState(false)

    // Auto-clear notification after 5s
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 5000)
            return () => clearTimeout(timer)
        }
    }, [notification])

    useEffect(() => {
        fetchFunds()
    }, [])

    const fetchFunds = async () => {
        try {
            const res = await fetch('/api/funds')
            const data = await res.json()
            setFunds(data)
        } catch (err) {
            console.error("Failed to fetch funds", err)
        }
    }

    useEffect(() => {
        if (view === 'dashboard' && !dashboardSummary) {
            fetchDashboardSummary();
        }
    }, [view]);

    const fetchDashboardSummary = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/dashboard/summary');
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
        if (selectedCik) {
            // Note: View is already set via URL, just load data
            setLoading(true)
            setError(null)
            setLegacyInfo(null)

            const p1 = fetch(`/api/funds/${selectedCik}/holdings`)
                .then(res => res.json())
                .then(data => setHoldings(data))

            const p2 = fetch(`/api/funds/${selectedCik}/history`)
                .then(res => res.json())
                .then(data => setHistory(data))

            const p3 = fetch(`/api/funds/${selectedCik}/filing-range`)
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
    }, [selectedCik])

    const loadMoreHistory = async () => {
        if (!selectedCik || !filingRange) return
        setLoadingMore(true)
        try {
            // Request 20 more than we currently have
            const nextLimit = (filingRange.total || 0) + 20
            const res = await fetch(`/api/funds/${selectedCik}/refresh?limit=${nextLimit}`, { method: 'POST' })
            if (res.ok) {
                const result = await res.json()
                const addedCount = result.newly_added?.length || 0
                if (addedCount > 0 || (result.skipped_legacy || 0) > 0) {
                    // Reload data
                    const [histRes, rangeRes] = await Promise.all([
                        fetch(`/api/funds/${selectedCik}/history`).then(r => r.json()),
                        fetch(`/api/funds/${selectedCik}/filing-range`).then(r => r.json())
                    ])
                    setHistory(histRes)
                    setFilingRange(rangeRes)

                    const skippedLegacy = result.skipped_legacy || 0;
                    let msg = "";

                    if (addedCount > 0) {
                        msg = `Loaded ${addedCount} additional quarters of history.`;
                        if (skippedLegacy > 0) {
                            const start = result.skipped_legacy_start ? formatQ(result.skipped_legacy_start) : '';
                            const end = result.skipped_legacy_end ? formatQ(result.skipped_legacy_end) : '';
                            msg += ` (${skippedLegacy} more from ${start} - ${end} were legacy and skipped)`;
                            setLegacyInfo({ count: skippedLegacy, start, end });
                        }
                        setNotification({ message: msg, type: 'success' });
                    } else if (skippedLegacy > 0) {
                        const start = result.skipped_legacy_start ? formatQ(result.skipped_legacy_start) : '';
                        const end = result.skipped_legacy_end ? formatQ(result.skipped_legacy_end) : '';
                        msg = `Found ${skippedLegacy} older filings (${start} - ${end}), but they were skipped due to legacy format.`;
                        setLegacyInfo({ count: skippedLegacy, start, end });
                        setNotification({ message: msg, type: 'info' });
                    }
                } else {
                    setNotification({ message: 'No additional history available on SEC.', type: 'info' })
                }
            }
        } catch (err) {
            console.error('Failed to load more history', err)
        } finally {
            setLoadingMore(false)
        }
    }

    const handleRefresh = async (cikToAdd?: string) => {
        const cik = cikToAdd || refreshCik;
        if (!cik) return
        setLoading(true)
        setLoadingMessage("Syncing fund data from SEC EDGAR...")
        setError(null)
        setNotification(null)
        try {
            // New fund: Orchestrator automatically detects and pulls history.
            const res = await fetch(`/api/funds/${cik}/refresh`, { method: 'POST' })
            if (res.ok) {
                const result = await res.json()
                const addedCount = result.newly_added?.length || 0
                setRefreshCik('')
                await fetchFunds()
                navigate('summary', result.cik || refreshCik)
                let msg = `Successfully added ${result.fund_name}. ${addedCount} historical filings processed.`
                const skippedLegacy = result.skipped_legacy || 0
                if (skippedLegacy > 0) {
                    const start = result.skipped_legacy_start ? formatQ(result.skipped_legacy_start) : '';
                    const end = result.skipped_legacy_end ? formatQ(result.skipped_legacy_end) : '';
                    msg += ` Note: ${skippedLegacy} more (${start} - ${end}) were legacy format and skipped.`
                }
                setNotification({
                    message: msg,
                    type: 'success'
                })
            } else {
                const errData = await res.json()
                setError(errData.detail || "Failed to add fund")
            }
        } catch (err) {
            setError("Network error adding fund")
        } finally {
            setLoading(false)
            setLoadingMessage("")
        }
    }

    const handleCurrentRefresh = async () => {
        if (!selectedCik) return
        setLoading(true)
        setLoadingMessage("Checking for new filings and updates...")
        setError(null)
        setNotification(null)
        try {
            // Refreshing existing: Automatic point-in-time sync.
            const res = await fetch(`/api/funds/${selectedCik}/refresh`, { method: 'POST' })
            if (res.ok) {
                const result = await res.json()
                const addedCount = result.newly_added?.length || 0
                const verifiedCount = result.verified_count || 0

                const p1 = fetch(`/api/funds/${selectedCik}/holdings`)
                    .then(res => res.json())
                    .then(data => setHoldings(data))

                const p2 = fetch(`/api/funds/${selectedCik}/history`)
                    .then(res => res.json())
                    .then(data => setHistory(data))

                await Promise.all([p1, p2])

                const skippedLegacy = result.skipped_legacy || 0

                let msg = "";
                if (addedCount > 0) {
                    msg = `Sync complete: Added ${addedCount} new filing(s).`
                } else if (verifiedCount > 0) {
                    msg = `Everything up to date! Verified last ${verifiedCount} filings.`
                } else {
                    msg = "Sync complete! No new filings found."
                }

                if (skippedLegacy > 0) {
                    const start = result.skipped_legacy_start ? formatQ(result.skipped_legacy_start) : '';
                    const end = result.skipped_legacy_end ? formatQ(result.skipped_legacy_end) : '';
                    msg += ` Skipped ${skippedLegacy} legacy filings (${start} - ${end}).`
                }

                setNotification({
                    message: msg,
                    type: 'success'
                })
            } else {
                const errData = await res.json()
                setError(errData.detail || "Failed to refresh fund")
            }
        } catch (err) {
            setError("Network error refreshing fund")
        } finally {
            setLoading(false)
            setLoadingMessage("")
        }
    }

    const handleDelete = async (e: React.MouseEvent, cik: string) => {
        e.stopPropagation()
        if (!window.confirm("Are you sure you want to delete this fund?")) return

        setLoading(true)
        try {
            const res = await fetch(`/api/funds/${cik}`, { method: 'DELETE' })
            if (res.ok) {
                if (selectedCik === cik) {
                    navigate('dashboard', null)
                    setHoldings([])
                    setHistory([])
                }
                await fetchFunds()
            } else {
                setError("Failed to delete fund")
            }
        } catch (err) {
            setError("Network error deleting fund")
        } finally {
            setLoading(false)
        }
    }

    const handleGlobalRefresh = async () => {
        if (loading) return
        setLoading(true)
        setLoadingMessage("Refreshing all funds...")
        setError(null)
        setNotification(null)

        let updatedCount = 0
        let totalProcessed = 0

        try {
            for (const fund of funds) {
                setLoadingMessage(`Refreshing ${fund.name} (${totalProcessed + 1}/${funds.length})...`)
                const res = await fetch(`/api/funds/${fund.cik}/refresh`, { method: 'POST' })
                if (res.ok) {
                    const result = await res.json()
                    if ((result.newly_added?.length || 0) > 0) {
                        updatedCount++
                    }
                }
                totalProcessed++
            }

            // Reload the currently selected fund's data if it exists
            if (selectedCik) {
                const p1 = fetch(`/api/funds/${selectedCik}/holdings`).then(res => res.json()).then(data => setHoldings(data))
                const p2 = fetch(`/api/funds/${selectedCik}/history`).then(res => res.json()).then(data => setHistory(data))
                await Promise.all([p1, p2])
            }

            setNotification({
                message: `Refresh complete. Scanned ${totalProcessed} funds. ${updatedCount > 0 ? `Updated ${updatedCount} funds with new filings.` : 'No new filings found.'}`,
                type: 'success'
            })

        } catch (err) {
            setError("Error during global refresh")
        } finally {
            setLoading(false)
            setLoadingMessage("")
        }
    }

    return (
        <>
            {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
            <div className="app-container" style={{ opacity: showSplash ? 0 : 1, transition: 'opacity 0.3s ease-in' }}>
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
                            onClick={handleGlobalRefresh}
                            disabled={loading}
                            className="refresh-all-btn"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 16px',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                fontSize: '13px',
                                fontWeight: 500
                            }}
                        >
                            <RefreshCw className={loading ? 'spin' : ''} size={16} />
                            {loading ? 'Refreshing All...' : 'Refresh All Funds'}
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
                            onMouseOver={(e) => {
                                if (view !== 'about') {
                                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
                                    e.currentTarget.style.color = '#60a5fa';
                                    e.currentTarget.style.borderColor = '#3b82f6';
                                }
                            }}
                            onMouseOut={(e) => {
                                if (view !== 'about') {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = '#94a3b8';
                                    e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                                }
                            }}
                        >
                            <Info size={16} />
                            About
                        </button>
                        <button
                            onClick={() => setShowCikSearch(true)}
                            className="add-fund-btn"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 16px',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 600,
                                transition: 'all 0.2s',
                                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.background = '#2563eb')}
                            onMouseOut={(e) => (e.currentTarget.style.background = '#3b82f6')}
                        >
                            <PlusCircle size={16} />
                            Add Fund
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
                                {!sidebarCollapsed && <span>Global Overview</span>}
                            </button>
                            <button
                                className="sidebar-toggle"
                                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            >
                                {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
                            </button>
                            {!sidebarCollapsed && (
                                <button
                                    className="dashboard-nav-btn add-fund-sidebar"
                                    onClick={() => setShowCikSearch(true)}
                                >
                                    <PlusCircle size={18} />
                                    Add New Fund
                                </button>
                            )}
                        </div>
                        <div className="divider"></div>
                        <div className="sidebar-content">

                            <div className="section-title">
                                {!sidebarCollapsed && <span>TRACKED FUNDS</span>}
                                {!sidebarCollapsed && (
                                    <button
                                        className="refresh-all-small"
                                        onClick={handleGlobalRefresh}
                                        title="Refresh all funds"
                                        disabled={loading}
                                    >
                                        <RefreshCw className={loading ? 'spin' : ''} size={12} />
                                    </button>
                                )}
                            </div>
                            {!sidebarCollapsed && (
                                <ul>
                                    {funds.map((f: Fund) => (
                                        <li
                                            key={f.cik}
                                            className={selectedCik === f.cik ? 'active' : ''}
                                            onClick={() => navigate('summary', f.cik)}
                                        >
                                            <div className="fund-info">
                                                <span className="fund-name">{f.name}</span>
                                                <span className="fund-cik">{f.cik}</span>
                                            </div>
                                            <div className="fund-actions">
                                                <Trash2
                                                    size={16}
                                                    className="delete-btn"
                                                    onClick={(e) => handleDelete(e, f.cik)}
                                                />
                                                <ChevronRight size={14} className="chevron" />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </aside>

                    <CikSearchModal
                        isOpen={showCikSearch}
                        onClose={() => setShowCikSearch(false)}
                        onSelectCik={(cik) => {
                            setRefreshCik(cik);
                            handleRefresh(cik);
                        }}
                    />

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
                                summary={dashboardSummary || { fund_highlights: [], big_movers: [], portfolio_shifts: [] }}
                                onSelectFund={(cik) => {
                                    navigate('summary', cik);
                                }}
                                allFunds={funds}
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
                                            Holdings for {funds.find(f => f.cik === selectedCik)?.name}
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
                                            className="tab refresh-btn-context"
                                            onClick={handleCurrentRefresh}
                                            disabled={loading}
                                        >
                                            <RefreshCw className={loading ? 'spin' : ''} size={14} />
                                            {loading ? 'Refreshing...' : 'Refresh Data'}
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
                                            <LayoutGrid size={16} /> Table
                                        </button>
                                        <button
                                            className={`tab ${view === 'chart' ? 'active' : ''}`}
                                            onClick={() => navigate('chart', selectedCik)}
                                        >
                                            <PieChart size={18} /> Composition
                                        </button>
                                        <button
                                            className={`tab ${view === 'performance' ? 'active' : ''}`}
                                            onClick={() => navigate('performance', selectedCik)}
                                        >
                                            <TrendingUp size={18} /> Performance
                                        </button>
                                    </div>
                                </div>

                                {/* Data Range Info Bar: High Contrast and Fixed to Top of View Area */}
                                {filingRange && filingRange.earliest && (
                                    <div style={{
                                        display: 'inline-flex',
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
                                        width: 'fit-content'
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

                                        <button
                                            onClick={loadMoreHistory}
                                            disabled={loadingMore}
                                            style={{
                                                fontSize: '12px',
                                                padding: '8px 16px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                backgroundColor: '#38bdf8', // Solid Electric blue
                                                color: '#0f172a', // Dark bg color for contrast
                                                fontWeight: '600',
                                                cursor: loadingMore ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                transition: 'all 0.2s',
                                                minHeight: '32px',
                                                lineHeight: '1',
                                                marginLeft: '4px'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!loadingMore) {
                                                    e.currentTarget.style.backgroundColor = '#0ea5e9'; // Darker blue hover (Sky 500)
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!loadingMore) {
                                                    e.currentTarget.style.backgroundColor = '#38bdf8';
                                                }
                                            }}
                                        >
                                            {loadingMore ? (
                                                <><RefreshCw size={12} className="spin" /> Scanning...</>
                                            ) : (
                                                <>Fetch Older Filings</>
                                            )}
                                        </button>

                                    </div>
                                )}

                                {loading ? (
                                    <div className="loading">
                                        <RefreshCw className="spin" style={{ marginBottom: 16 }} />
                                        <div>{loadingMessage || "Loading data..."}</div>
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
                                        fundName={funds.find(f => f.cik === selectedCik)?.name || 'Fund'}
                                    />
                                ) : view === 'performance' ? (
                                    <PerformanceChart
                                        data={history}
                                        timeRange={timeRange}
                                        onTimeRangeChange={(r) => { setTimeRange(r); setOffset(0); }}
                                        offset={offset}
                                        onOffsetChange={setOffset}
                                    />
                                ) : (
                                    <HoldingsTable
                                        history={history}
                                        fundName={funds.find(f => f.cik === selectedCik)?.name || 'Hedge Fund Portfolio'}
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
            </div>
        </>
    )
}

function PerformanceChart({ data, timeRange, onTimeRangeChange, offset, onOffsetChange }: {
    data: HistoricalHolding[],
    timeRange: string,
    onTimeRangeChange: (r: string) => void,
    offset: number,
    onOffsetChange: (o: number) => void
}) {
    const [showBenchmark, setShowBenchmark] = useState(false);
    const [benchmarkData, setBenchmarkData] = useState<BenchmarkData[]>([]);
    const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
    const [linkToPortfolio, setLinkToPortfolio] = useState(false);
    const [metricTooltip, setMetricTooltip] = useState<{ key: string; x: number; y: number } | null>(null);
    const [showMethodologyTooltip, setShowMethodologyTooltip] = useState<{ x: number; y: number } | null>(null);

    // Custom date range state
    const [customStartQuarter, setCustomStartQuarter] = useState<string>('');
    const [customEndQuarter, setCustomEndQuarter] = useState<string>('');
    const [showStartDropdown, setShowStartDropdown] = useState(false);
    const [showEndDropdown, setShowEndDropdown] = useState(false);

    // Metric explanations for tooltips
    const metricExplanations: { [key: string]: { title: string; description: string; formula?: string } } = {
        twr: {
            title: "Time-Weighted Return (TWR)",
            description: "Measures the compound rate of growth independent of cash flows. It isolates genuine investment performance by removing the impact of deposits and withdrawals, making it ideal for comparing manager skill.",
            formula: "TWR = Π(1 + Rₜ) - 1"
        },
        irr: {
            title: "Annualized Internal Rate of Return",
            description: "The discount rate that makes the net present value of all cash flows equal to zero. Unlike TWR, IRR accounts for the timing and size of cash flows, reflecting your actual dollar-weighted experience.",
            formula: "NPV = Σ CFₜ/(1+IRR)ᵗ = 0"
        },
        roi: {
            title: "Return on Investment (ROI)",
            description: "Simple ratio of total profit relative to total capital ever invested. Shows how much wealth was created per dollar committed, expressed as both a multiple (e.g., 1.16x) and percentage.",
            formula: "ROI = Total PnL / Total Committed"
        },
        pnl: {
            title: "Estimated Price P&L",
            description: "Measures wealth generated purely from price appreciation on held positions. Calculated as (Ending Price - Starting Price) × Shares Held. Does not include dividends or trading profits.",
            formula: "PnL = Σ (P₂ - P₁) × Shares"
        },
        committed: {
            title: "Total Committed Capital",
            description: "The cumulative amount of cash ever deployed into the portfolio. Includes initial investment plus all subsequent purchases. Shows the total capital that was put at risk over time.",
        }
    };

    // Helper to format quarter
    const formatQuarter = (dateStr: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        const q = Math.floor(d.getMonth() / 3) + 1;
        return `${q}Q '${d.getFullYear().toString().slice(2)}`;
    };

    // Available quarters
    const availableQuarters = useMemo(() => {
        const quarters = Array.from(new Set(data.map(h => h.period_of_report)))
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        return quarters;
    }, [data]);

    // Initialize custom quarters when available
    useEffect(() => {
        if (availableQuarters.length > 0 && (!customStartQuarter || !customEndQuarter)) {
            setCustomStartQuarter(availableQuarters[availableQuarters.length - 1]);
            setCustomEndQuarter(availableQuarters[0]);
        }
    }, [availableQuarters]);

    const toggleTicker = (ticker: string) => {
        const newSet = new Set(selectedTickers);
        if (newSet.has(ticker)) newSet.delete(ticker);
        else newSet.add(ticker);
        setSelectedTickers(newSet);
    };



    useEffect(() => {
        if (showBenchmark && benchmarkData.length === 0 && data.length > 0) {
            const sortedDates = data.map(d => new Date(d.period_of_report).getTime()).sort((a, b) => a - b);
            if (sortedDates.length < 2) return;

            const startStr = new Date(sortedDates[0]).toISOString().slice(0, 10);
            const today = new Date().toISOString().slice(0, 10);

            fetch(`/api/market/benchmark?start=${startStr}&end=${today}`)
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) setBenchmarkData(data);
                })
                .catch(err => console.error("Failed to fetch benchmark", err));
        }
    }, [showBenchmark, data]);

    if (!data || data.length === 0) {
        return (
            <div className="loading-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '40px' }}>
                <Activity size={48} style={{ color: '#64748b', opacity: 0.5 }} />
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#94a3b8' }}>No Performance Data Available</div>
                <div style={{ fontSize: '14px', color: '#64748b', maxWidth: '400px', lineHeight: 1.5, textAlign: 'center' }}>
                    We need at least two quarterly filings to calculate performance trends and IRR.
                    Try fetching older filings to build a history.
                </div>
            </div>
        );
    }

    const { filteredData, stats } = useMemo(() => {
        // 1. Group holdings by period
        const periods: { [key: string]: HistoricalHolding[] } = {};
        data.forEach(h => {
            if (!periods[h.period_of_report]) periods[h.period_of_report] = [];
            periods[h.period_of_report].push(h);
        });

        const sortedPeriodsFull = Object.keys(periods).sort();
        if (sortedPeriodsFull.length < 2) return { filteredData: [], stats: { totalReturn: 0, irr: 0, benchmarkTotal: null, benchmarkIrr: null, totalPnL: 0, totalCommitted: 0, portfolioRoi: 0 } };

        // 1b. Apply offset to the end point
        // If offset is 0, we use all data up to the latest.
        // If offset is 1, we exclude the latest quarter.
        const availableLen = sortedPeriodsFull.length;
        // We need at least 2 periods to calculate a return.
        // End index must be at least 1 (second item).
        const endIndex = Math.max(1, availableLen - 1 - offset);

        // If offset pushes us back too far where we have < 2 periods, we handle gracefully
        if (endIndex < 1) return { filteredData: [], stats: { totalReturn: 0, irr: 0, benchmarkTotal: null, benchmarkIrr: null, totalPnL: 0, totalCommitted: 0, portfolioRoi: 0 } };

        const latestPeriodDateInWindow = sortedPeriodsFull[endIndex];
        const latestDate = new Date(latestPeriodDateInWindow);

        // Determine cutoff for timeRange RELATIVE to the window end
        let cutoffDate = new Date();
        if (timeRange === 'YTD') {
            cutoffDate = new Date(latestDate.getFullYear(), 0, 1);
        } else if (timeRange === 'CUSTOM' || timeRange === 'MAX') {
            cutoffDate = new Date(0); // CUSTOM and MAX show all data
        } else if (timeRange.endsWith('Q')) {
            // Quarter-based range (e.g., "2Q" = show 2 quarters of data)
            // To show N quarters, go back (N-1) quarters from latest period
            const quarters = parseInt(timeRange);
            cutoffDate = new Date(latestDate);
            cutoffDate.setMonth(cutoffDate.getMonth() - ((quarters - 1) * 3));
        } else {
            const years = parseInt(timeRange);
            cutoffDate = new Date(latestDate);
            cutoffDate.setFullYear(cutoffDate.getFullYear() - years);
        }

        // Filter periods: Must be within the time window
        const sortedPeriods = sortedPeriodsFull.filter((p, idx) => {
            const d = new Date(p);

            // For CUSTOM, filter by selected range
            if (timeRange === 'CUSTOM' && customStartQuarter && customEndQuarter) {
                const startDate = new Date(customStartQuarter);
                const endDate = new Date(customEndQuarter);
                return d >= startDate && d <= endDate;
            }

            // For quarter-based ranges, use index directly (N quarters = N periods)
            if (timeRange.endsWith('Q')) {
                const quarters = parseInt(timeRange);
                const startIdx = Math.max(0, endIndex - quarters + 1);
                return idx >= startIdx && idx <= endIndex;
            }

            return d >= cutoffDate && idx <= endIndex;
        });

        if (sortedPeriods.length < 2) return { filteredData: [], stats: { totalReturn: 0, irr: 0, benchmarkTotal: null, benchmarkIrr: null, totalPnL: 0, totalCommitted: 0, portfolioRoi: 0 } };

        // 2. Calculate returns per period & Cash Flows for IRR
        // Cash Flow 0: -InitialValue
        // Cash Flow i: -NetFlow_i
        // Terminal Value: FinalValue

        // 2. Calculate returns per period & Cash Flows for IRR
        // Cash Flow 0: -InitialValue
        // Cash Flow i: -NetFlow_i
        // Terminal Value: FinalValue

        const cashFlows: number[] = [];
        let cumulativeReturn = 0;
        let totalPnL = 0;
        let totalCommitted = 0;

        // Find match for benchmark start
        let benchStartVal: number | null = null;
        if (showBenchmark && benchmarkData.length > 0) {
            const startD = new Date(sortedPeriods[0]).getTime();
            // Simple closest match
            const closest = benchmarkData.reduce((prev, curr) => {
                return (Math.abs(new Date(curr.date).getTime() - startD) < Math.abs(new Date(prev.date).getTime() - startD) ? curr : prev);
            });
            benchStartVal = closest ? closest.value : null;
        }

        // Allow flexible type for chart data to include benchmark
        const chartData: any[] = [{
            period: sortedPeriods[0],
            return: 0,
            irr: 0,
            benchmarkReturn: 0,
            benchmarkRaw: benchStartVal || 0
        }];

        // Track cumulative TWR for selected tickers
        const tickerTwrMap = new Map<string, number>();
        const tickerStarted = new Set<string>(); // Track which tickers have been held at least once
        const tickerExited = new Set<string>(); // Track which tickers have been fully exited

        // Check which tickers are held in the first period
        const initialHoldingsForTickers = periods[sortedPeriods[0]];
        selectedTickers.forEach(t => {
            const held = initialHoldingsForTickers.some(h => (h.ticker || h.issuer_name || h.cusip) === t && h.shares > 0);
            if (held) {
                tickerTwrMap.set(t, 0);
                tickerStarted.add(t);
                chartData[0][t] = 0;
            }
            // If not held initially, don't add to chartData[0] - will show as gap
        });

        // Initial setup for IRR & ROI
        const initialHoldings = periods[sortedPeriods[0]];
        let initialValue = 0;
        initialHoldings.forEach(h => initialValue += h.value);
        cashFlows.push(-initialValue);
        totalCommitted = initialValue;

        for (let i = 1; i < sortedPeriods.length; i++) {
            const currentPeriod = sortedPeriods[i];
            const prevPeriod = sortedPeriods[i - 1];

            const currentHoldings = periods[currentPeriod];
            const prevHoldings = periods[prevPeriod];

            let totalValue_t = 0;
            let totalValue_prev = 0;
            let netFlow_t = 0;

            const prevMap = new Map<string, number>();
            prevHoldings.forEach(h => {
                prevMap.set(h.ticker || h.cusip, h.shares);
                totalValue_prev += h.value;
            });

            currentHoldings.forEach(h => {
                const key = h.ticker || h.cusip;
                const shares_t = h.shares;
                const price_t = h.value / h.shares;
                const shares_prev = prevMap.get(key) || 0;

                totalValue_t += h.value;
                const flow = (shares_t - shares_prev) * price_t;
                netFlow_t += flow;
                if (flow > 0) totalCommitted += flow;

                // Portfolio PnL logic: (P2 - P1) * Shares_prev, with split detection
                let price_prev = shares_prev > 0 ? (prevHoldings.find(ph => (ph.ticker || ph.cusip) === key)?.value || 0) / shares_prev : price_t;
                const prevVal = shares_prev > 0 ? (prevHoldings.find(ph => (ph.ticker || ph.cusip) === key)?.value || 0) : h.value;

                // Split Detection: shares > 1.4x, price < 0.72x, value stable (0.5x - 2.5x)
                if (shares_prev > 0) {
                    const shareRatio = shares_t / shares_prev;
                    const priceRatio = price_t / price_prev;
                    const valueRatio = h.value / prevVal;
                    if (shareRatio > 1.4 && priceRatio < 0.72 && valueRatio > 0.5 && valueRatio < 2.5) {
                        price_prev = price_prev / shareRatio; // Adjust for split
                    }
                }
                totalPnL += (price_t - price_prev) * shares_prev;
            });

            prevHoldings.forEach(h => {
                const key = h.ticker || h.cusip;
                const isExited = !currentHoldings.some(ch => (ch.ticker || ch.cusip) === key);
                if (isExited) {
                    const price_prev = h.value / h.shares;
                    netFlow_t += (0 - h.shares) * price_prev;
                }
            });

            // Calculate TWR for selected tickers
            const periodTickerReturns: { [key: string]: number | null } = {};
            selectedTickers.forEach(ticker => {
                const curH = currentHoldings.find(h => (h.ticker || h.issuer_name || h.cusip) === ticker);
                const prevH = prevHoldings.find(h => (h.ticker || h.issuer_name || h.cusip) === ticker);

                const curHeld = curH && curH.shares > 0;
                const prevHeld = prevH && prevH.shares > 0;

                if (curHeld && prevHeld) {
                    // Position held in both periods - calculate return
                    const price_t = curH.value / curH.shares;
                    let price_prev = prevH.value / prevH.shares;

                    // Split Detection: shares > 1.4x, price < 0.72x, value stable (0.5x - 2.5x)
                    const shareRatio = curH.shares / prevH.shares;
                    const priceRatio = price_t / price_prev;
                    const valueRatio = curH.value / prevH.value;
                    if (shareRatio > 1.4 && priceRatio < 0.72 && valueRatio > 0.5 && valueRatio < 2.5) {
                        price_prev = price_prev / shareRatio; // Adjust for split
                    }

                    const periodRet = (price_t / price_prev) - 1;
                    const prevCum = tickerTwrMap.get(ticker) || 0;
                    const newCum = (1 + prevCum / 100) * (1 + periodRet) - 1;
                    tickerTwrMap.set(ticker, newCum * 100);
                    tickerStarted.add(ticker);
                    tickerExited.delete(ticker);
                    periodTickerReturns[ticker] = newCum * 100;
                } else if (curHeld && !prevHeld) {
                    // New position or re-entry - continue from last value (stay flat through gap)
                    const lastValue = tickerTwrMap.get(ticker) ?? 0;
                    tickerStarted.add(ticker);
                    tickerExited.delete(ticker);
                    periodTickerReturns[ticker] = lastValue; // Continue from where we left off
                } else if (!curHeld && prevHeld) {
                    // Position was sold - show last value, mark as exited
                    periodTickerReturns[ticker] = tickerTwrMap.get(ticker) || 0;
                    tickerExited.add(ticker);
                } else {
                    // Not held in either period
                    if (tickerStarted.has(ticker)) {
                        // Was held before (now exited or between trades) - stay flat at last value
                        periodTickerReturns[ticker] = tickerTwrMap.get(ticker) ?? 0;
                    } else {
                        // Never held yet - don't show line
                        periodTickerReturns[ticker] = null;
                    }
                }
            });

            // For chart: simple geometric link
            if (totalValue_prev > 0) {
                const periodReturn = (totalValue_t - netFlow_t) / totalValue_prev - 1;
                cumulativeReturn = (1 + cumulativeReturn / 100) * (1 + periodReturn) - 1;
                cumulativeReturn *= 100;
            }

            // For IRR: net flow at time i
            cashFlows.push(-netFlow_t); // Intermediate flow

            // Calculate rolling IRR: use flows up to now + terminal value at current period
            const rollingCashFlows = [...cashFlows];
            // Replace last flow with terminal value (current portfolio value)
            rollingCashFlows[rollingCashFlows.length - 1] = totalValue_t;
            const rollingIrr = (Math.pow(1 + calculateIRR(rollingCashFlows), 4) - 1) * 100;

            // Benchmark Return logic
            let benchRet = 0;
            if (benchStartVal !== null && showBenchmark) {
                const currD = new Date(currentPeriod).getTime();
                const closest = benchmarkData.reduce((prev, curr) => {
                    return (Math.abs(new Date(curr.date).getTime() - currD) < Math.abs(new Date(prev.date).getTime() - currD) ? curr : prev);
                });
                if (closest) {
                    benchRet = (closest.value / benchStartVal) * 100 - 100;
                }
            }

            chartData.push({
                period: currentPeriod,
                return: cumulativeReturn,
                irr: rollingIrr,
                benchmarkReturn: benchRet,
                benchmarkRaw: (benchStartVal !== null && showBenchmark) ? (() => {
                    const currD = new Date(currentPeriod).getTime();
                    const closest = benchmarkData.reduce((prev, curr) => {
                        return (Math.abs(new Date(curr.date).getTime() - currD) < Math.abs(new Date(prev.date).getTime() - currD) ? curr : prev);
                    });
                    return closest ? closest.value : 0;
                })() : 0,
                ...periodTickerReturns
            });
        }

        // Post-processing: For each selected ticker, find if/when it was finally exited
        // and null out values AFTER the exit period (not including the exit period itself)
        selectedTickers.forEach(ticker => {
            // Find the last period where this ticker was held
            let lastHeldIndex = -1;
            for (let i = chartData.length - 1; i >= 0; i--) {
                const period = sortedPeriods[i];
                const holdings = periods[period];
                const isHeld = holdings && holdings.some((h: any) =>
                    (h.ticker || h.issuer_name || h.cusip) === ticker && h.shares > 0
                );
                if (isHeld) {
                    lastHeldIndex = i;
                    break;
                }
            }

            // If ticker was held at some point but not in the final period, null out values after last held
            if (lastHeldIndex >= 0 && lastHeldIndex < chartData.length - 1) {
                // Keep one period after exit (shows the exit value), then null the rest
                for (let i = lastHeldIndex + 2; i < chartData.length; i++) {
                    chartData[i][ticker] = null;
                }
            }
        });

        // Re-index chartData to 0 at the start of the view range
        let finalChartData = chartData;
        if (finalChartData.length > 0) {
            const baseReturn = finalChartData[0].return;
            const validBenchPoints = finalChartData.filter(d => d.benchmarkRaw > 0);
            const baseBenchRaw = validBenchPoints.length > 0 ? validBenchPoints[0].benchmarkRaw : 0;

            // First pass: Calculate re-indexed returns and find entry points for each ticker
            const tickerEntryIndices: { [ticker: string]: number } = {};

            finalChartData = finalChartData.map((d, idx) => {
                const updated: any = {
                    ...d,
                    return: (1 + d.return / 100) / (1 + baseReturn / 100) * 100 - 100,
                    benchmarkReturn: (showBenchmark && baseBenchRaw > 0) ? ((d.benchmarkRaw / baseBenchRaw) - 1) * 100 : 0
                };
                selectedTickers.forEach(t => {
                    // Preserve null values - only re-index if value exists
                    if (d[t] === null || d[t] === undefined) {
                        updated[t] = null;
                    } else {
                        // Track when this ticker first appears
                        if (tickerEntryIndices[t] === undefined) {
                            tickerEntryIndices[t] = idx;
                        }
                        const baseTick = chartData[0][t] ?? 0;
                        updated[t] = (1 + d[t] / 100) / (1 + baseTick / 100) * 100 - 100;
                    }
                });
                return updated;
            });

            // Second pass: If linking to portfolio, offset tickers by portfolio value at their entry point
            // Also store original values for tooltip display
            if (linkToPortfolio) {
                finalChartData = finalChartData.map((d, idx) => {
                    const updated = { ...d };
                    selectedTickers.forEach(t => {
                        if (d[t] !== null && d[t] !== undefined) {
                            // Store original value for tooltip
                            updated[`${t}_original`] = d[t];

                            const entryIdx = tickerEntryIndices[t] ?? 0;
                            // Only add offset if stock didn't exist at T0
                            if (entryIdx > 0) {
                                const portfolioAtEntry = finalChartData[entryIdx].return;
                                updated[t] = d[t] + portfolioAtEntry;
                            }
                            // If entryIdx === 0, stock existed at T0, no offset needed
                        }
                    });
                    return updated;
                });
            }
        }

        // Final metrics at the last data point
        const irr = finalChartData.length > 0 ? finalChartData[finalChartData.length - 1].irr : 0;
        const totalBench = (finalChartData.length > 0 && showBenchmark) ? finalChartData[finalChartData.length - 1].benchmarkReturn : 0;

        let benchIrr = 0;
        if (sortedPeriods.length >= 2 && showBenchmark) {
            const startDetails = new Date(sortedPeriods[0]).getTime();
            const endDetails = new Date(sortedPeriods[sortedPeriods.length - 1]).getTime();
            const years = (endDetails - startDetails) / (1000 * 60 * 60 * 24 * 365.25);
            if (years > 0) {
                benchIrr = (Math.pow(1 + totalBench / 100, 1 / years) - 1) * 100;
            }
        }

        const stats = {
            totalReturn: cumulativeReturn,
            irr: irr,
            benchmarkTotal: (showBenchmark ? totalBench : null),
            benchmarkIrr: (showBenchmark ? benchIrr : null),
            portfolioRoi: (totalCommitted > 0 ? (totalPnL / totalCommitted) * 100 : 0),
            totalPnL: totalPnL,
            totalCommitted: totalCommitted
        };

        return { filteredData: finalChartData, stats };
    }, [data, timeRange, offset, showBenchmark, benchmarkData, selectedTickers, customStartQuarter, customEndQuarter, linkToPortfolio]);

    // Don't return null - let the chart render but be empty

    return (
        <div className="portfolio-dashboard-v2">
            <div className="performance-summary-grid">
                {/* TIME-WEIGHTED RETURN */}
                <div className="summary-card">
                    <div className="summary-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Time-Weighted Return
                        <Info size={14} style={{ color: '#94a3b8', cursor: 'help' }} onMouseEnter={(e) => setMetricTooltip({ key: 'twr', x: e.clientX, y: e.clientY })} onMouseLeave={() => setMetricTooltip(null)} />
                    </div>
                    <div>
                        <div className={`summary-value ${stats.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                            {stats.totalReturn >= 0 ? '+' : ''}{stats.totalReturn.toFixed(2)}%
                        </div>
                        {stats.benchmarkTotal === null && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Portfolio</div>}
                    </div>
                    {stats.benchmarkTotal !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #f1f5f9' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1' }}>S&P 500:</span>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#6366f1' }}>
                                {stats.benchmarkTotal >= 0 ? '+' : ''}{typeof stats.benchmarkTotal === 'number' ? stats.benchmarkTotal.toFixed(2) : '0.00'}%
                            </span>
                        </div>
                    )}
                    <div className="summary-subtext" style={{ marginTop: '8px' }}>Investment skill (ignores cash flows)</div>
                </div>

                {/* ANNUALIZED IRR */}
                <div className="summary-card">
                    <div className="summary-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Annualized IRR
                        <Info size={14} style={{ color: '#94a3b8', cursor: 'help' }} onMouseEnter={(e) => setMetricTooltip({ key: 'irr', x: e.clientX, y: e.clientY })} onMouseLeave={() => setMetricTooltip(null)} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <div className={`summary-value ${stats.irr >= 0 ? 'positive' : 'negative'}`}>
                            {stats.irr >= 0 ? '+' : ''}{stats.irr.toFixed(2)}%
                        </div>
                    </div>
                    {stats.benchmarkIrr !== null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '12px', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #f1f5f9' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1' }}>S&P 500:</span>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#6366f1' }}>
                                {stats.benchmarkIrr >= 0 ? '+' : ''}{typeof stats.benchmarkIrr === 'number' ? stats.benchmarkIrr.toFixed(2) : '0.00'}%
                            </span>
                        </div>
                    )}
                    <div className="summary-subtext" style={{ marginTop: '8px' }}>Internal Rate of Return</div>
                </div>

                {/* EST. ROI % */}
                <div className="summary-card">
                    <div className="summary-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Est. ROI %
                        <Info size={14} style={{ color: '#94a3b8', cursor: 'help' }} onMouseEnter={(e) => setMetricTooltip({ key: 'roi', x: e.clientX, y: e.clientY })} onMouseLeave={() => setMetricTooltip(null)} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <div className={`summary-value ${stats.portfolioRoi >= 0 ? 'positive' : 'negative'}`}>
                            <span style={{ fontSize: '14px', fontWeight: 500, opacity: 0.7, marginRight: '4px' }}>
                                ({(1 + (stats.portfolioRoi / 100)).toFixed(2)}x)
                            </span>
                            {stats.portfolioRoi >= 0 ? '+' : ''}{stats.portfolioRoi.toFixed(1)}%
                        </div>
                    </div>
                    <div className="summary-subtext" style={{ marginTop: '8px' }}>Return on Committed Capital</div>
                </div>

                {/* EST. PNL (PRICE) */}
                <div className="summary-card">
                    <div className="summary-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Est. PnL (Price)
                        <Info size={14} style={{ color: '#94a3b8', cursor: 'help' }} onMouseEnter={(e) => setMetricTooltip({ key: 'pnl', x: e.clientX, y: e.clientY })} onMouseLeave={() => setMetricTooltip(null)} />
                    </div>
                    <div className={`summary-value ${stats.totalPnL >= 0 ? 'positive' : 'negative'}`}>
                        {stats.totalPnL >= 0 ? '+' : ''}{formatCurrency(stats.totalPnL)}
                    </div>
                    <div className="summary-subtext" style={{ marginTop: '8px' }}>Wealth from holding assets</div>
                </div>

                {/* TOTAL COMMITTED */}
                <div className="summary-card">
                    <div className="summary-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Total Committed
                        <Info size={14} style={{ color: '#94a3b8', cursor: 'help' }} onMouseEnter={(e) => setMetricTooltip({ key: 'committed', x: e.clientX, y: e.clientY })} onMouseLeave={() => setMetricTooltip(null)} />
                    </div>
                    <div className="summary-value" style={{ color: '#64748b' }}>
                        {formatCurrency(stats.totalCommitted)}
                    </div>
                    <div className="summary-subtext" style={{ marginTop: '8px' }}>Total cash ever put at risk</div>
                </div>
            </div>

            {/* Metric Tooltip Portal */}
            {metricTooltip && createPortal(
                <div
                    className="kpi-tooltip"
                    style={{
                        left: metricTooltip.x > window.innerWidth - 320 ? 'auto' : metricTooltip.x + 15,
                        right: metricTooltip.x > window.innerWidth - 320 ? window.innerWidth - metricTooltip.x + 15 : 'auto',
                        top: metricTooltip.y + 20
                    }}
                >
                    <div className="tooltip-title">{metricExplanations[metricTooltip.key].title}</div>
                    <div style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.5 }}>
                        {metricExplanations[metricTooltip.key].description}
                    </div>
                    {metricExplanations[metricTooltip.key].formula && (
                        <div style={{ marginTop: '10px', fontFamily: 'monospace', color: '#94a3b8', fontSize: '11px' }}>
                            {metricExplanations[metricTooltip.key].formula}
                        </div>
                    )}
                </div>,
                document.body
            )}

            <div className="chart-panel-v2" style={{ height: '500px', position: 'relative' }}>
                <div className="chart-header-v2">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="chart-title-v2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Compound Performance Index
                            <Info
                                size={16}
                                style={{ color: '#94a3b8', cursor: 'help' }}
                                onMouseEnter={(e) => setShowMethodologyTooltip({ x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setShowMethodologyTooltip(null)}
                            />
                        </div>
                        <button
                            className={`quarter-nav-btn ${showBenchmark ? 'active' : ''}`}
                            onClick={() => setShowBenchmark(!showBenchmark)}
                            style={{
                                fontSize: '13px',
                                border: '1px solid #e2e8f0',
                                color: showBenchmark ? '#2563eb' : '#64748b',
                                background: showBenchmark ? '#eff6ff' : 'transparent',
                                borderColor: showBenchmark ? '#bfdbfe' : '#e2e8f0'
                            }}
                        >
                            <Activity size={14} style={{ marginRight: 6 }} />
                            {showBenchmark ? 'Hide S&P 500' : 'Compare S&P 500'}
                        </button>
                        <button
                            className={`quarter-nav-btn ${linkToPortfolio ? 'active' : ''}`}
                            onClick={() => selectedTickers.size > 0 && setLinkToPortfolio(!linkToPortfolio)}
                            disabled={selectedTickers.size === 0}
                            style={{
                                fontSize: '13px',
                                border: '1px solid #e2e8f0',
                                color: selectedTickers.size === 0 ? '#cbd5e1' : (linkToPortfolio ? '#f59e0b' : '#64748b'),
                                background: linkToPortfolio ? '#fffbeb' : 'transparent',
                                borderColor: linkToPortfolio ? '#fcd34d' : '#e2e8f0',
                                cursor: selectedTickers.size === 0 ? 'not-allowed' : 'pointer',
                                opacity: selectedTickers.size === 0 ? 0.6 : 1
                            }}
                            title={selectedTickers.size === 0
                                ? "Select stocks from the table below to enable this feature"
                                : "When enabled, stock lines start at the portfolio's return value instead of 0%"}
                        >
                            <TrendingUp size={14} style={{ marginRight: 6 }} />
                            {linkToPortfolio ? 'Unlink Stocks' : 'Link to Portfolio'}
                        </button>
                    </div>
                    <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 16px' }}></div>
                    <div className="time-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="nav-arrows" style={{ display: 'flex', gap: '4px', marginRight: '8px' }}>
                            <button className="time-btn" onClick={() => {
                                if (timeRange === 'CUSTOM') {
                                    const sIdx = availableQuarters.indexOf(customStartQuarter);
                                    const eIdx = availableQuarters.indexOf(customEndQuarter);
                                    if (sIdx < availableQuarters.length - 1) {
                                        setCustomStartQuarter(availableQuarters[sIdx + 1]);
                                        if (eIdx < availableQuarters.length - 1) setCustomEndQuarter(availableQuarters[eIdx + 1]);
                                    }
                                } else {
                                    onOffsetChange(offset + 1);
                                }
                            }}>
                                <ChevronLeft size={16} />
                            </button>
                            <button className="time-btn" onClick={() => {
                                if (timeRange === 'CUSTOM') {
                                    const sIdx = availableQuarters.indexOf(customStartQuarter);
                                    const eIdx = availableQuarters.indexOf(customEndQuarter);
                                    if (eIdx > 0) {
                                        setCustomEndQuarter(availableQuarters[eIdx - 1]);
                                        if (sIdx > 0) setCustomStartQuarter(availableQuarters[sIdx - 1]);
                                    }
                                } else {
                                    onOffsetChange(Math.max(0, offset - 1));
                                }
                            }} disabled={timeRange !== 'CUSTOM' && offset === 0}>
                                <ChevronRight size={16} />
                            </button>
                        </div>
                        {(['2Q', 'YTD', '1Y', '3Y', '5Y', '10Y', 'MAX', 'CUSTOM'] as const).map(range => (
                            <button
                                key={range}
                                className={`time-btn ${timeRange === range ? 'active' : ''}`}
                                onClick={() => onTimeRangeChange(range)}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Custom Range Dropdowns - Absolute positioned overlay */}
                {timeRange === 'CUSTOM' && (
                    <div style={{
                        position: 'absolute',
                        top: '40px',
                        right: '0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        background: '#ffffff',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        zIndex: 30
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>FROM:</span>
                            <div style={{ position: 'relative' }}>
                                <div
                                    onClick={() => { setShowStartDropdown(!showStartDropdown); setShowEndDropdown(false); }}
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #cbd5e1',
                                        color: '#334155',
                                        fontSize: '11px',
                                        fontWeight: 500,
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        minWidth: '70px',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {formatQuarter(customStartQuarter)}
                                    <ChevronDown size={14} style={{ opacity: 0.6 }} />
                                </div>
                                {showStartDropdown && (
                                    <div className="quarter-dropdown-light" style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        marginTop: '4px',
                                        background: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        padding: '4px',
                                        zIndex: 1000,
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        boxShadow: '0 -10px 25px rgba(0,0,0,0.1)'
                                    }}>
                                        {availableQuarters.map(q => (
                                            <div
                                                key={q}
                                                onClick={() => { setCustomStartQuarter(q); setShowStartDropdown(false); }}
                                                style={{
                                                    padding: '6px 12px',
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                    borderRadius: '4px',
                                                    whiteSpace: 'nowrap',
                                                    background: q === customStartQuarter ? '#eff6ff' : 'transparent',
                                                    color: q === customStartQuarter ? '#2563eb' : '#334155'
                                                }}
                                                onMouseEnter={e => { if (q !== customStartQuarter) (e.target as HTMLElement).style.background = '#f1f5f9' }}
                                                onMouseLeave={e => { if (q !== customStartQuarter) (e.target as HTMLElement).style.background = 'transparent' }}
                                            >
                                                {formatQuarter(q)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ width: '1px', height: '16px', background: '#e2e8f0' }}></div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>TO:</span>
                            <div style={{ position: 'relative' }}>
                                <div
                                    onClick={() => { setShowEndDropdown(!showEndDropdown); setShowStartDropdown(false); }}
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #cbd5e1',
                                        color: '#334155',
                                        fontSize: '11px',
                                        fontWeight: 500,
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        minWidth: '70px',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {formatQuarter(customEndQuarter)}
                                    <ChevronDown size={14} style={{ opacity: 0.6 }} />
                                </div>
                                {showEndDropdown && (
                                    <div className="quarter-dropdown-light" style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        marginTop: '4px',
                                        background: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        padding: '4px',
                                        zIndex: 1000,
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        boxShadow: '0 -10px 25px rgba(0,0,0,0.1)'
                                    }}>
                                        {availableQuarters.map(q => (
                                            <div
                                                key={q}
                                                onClick={() => { setCustomEndQuarter(q); setShowEndDropdown(false); }}
                                                style={{
                                                    padding: '6px 12px',
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                    borderRadius: '4px',
                                                    whiteSpace: 'nowrap',
                                                    background: q === customEndQuarter ? '#eff6ff' : 'transparent',
                                                    color: q === customEndQuarter ? '#2563eb' : '#334155'
                                                }}
                                                onMouseEnter={e => { if (q !== customEndQuarter) (e.target as HTMLElement).style.background = '#f1f5f9' }}
                                                onMouseLeave={e => { if (q !== customEndQuarter) (e.target as HTMLElement).style.background = 'transparent' }}
                                            >
                                                {formatQuarter(q)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                <div className="chart-content-v2">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={filteredData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorReturn" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="period"
                                tickFormatter={(str: string) => {
                                    const d = new Date(str);
                                    // Format as "Qx 'YY"
                                    const q = Math.floor((d.getMonth() + 3) / 3);
                                    return `Q${q} '${d.getFullYear().toString().slice(2)}`;
                                }}
                                tick={{ fontSize: 11 }}
                                interval={0}
                                angle={-45}
                                textAnchor="end"
                                height={50}
                            />
                            <YAxis
                                tickFormatter={(val) => `${val > 0 ? '+' : ''}${val.toFixed(0)}%`}
                                tick={{ fontSize: 12 }}
                            />
                            <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        const d = new Date(label);
                                        const qLabel = `Q${Math.floor(d.getMonth() / 3) + 1} '${d.getFullYear().toString().slice(2)}`;

                                        const pfItem = payload.find(p => p.dataKey === 'return');
                                        const bnchItem = payload.find(p => p.dataKey === 'benchmarkReturn');

                                        // Find any ticker-specific items
                                        const tickerItems = payload.filter(p => selectedTickers && selectedTickers.has(p.dataKey as string));

                                        const pfVal = pfItem ? (pfItem.value as number) : 0;
                                        const irrVal = pfItem ? (pfItem.payload.irr as number) : 0;
                                        const bnchVal = bnchItem ? (bnchItem.value as number) : null;

                                        return (
                                            <div style={{
                                                backgroundColor: '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                padding: '12px',
                                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                                minWidth: '200px',
                                                zIndex: 3000
                                            }}>
                                                <div style={{ fontWeight: 600, marginBottom: '8px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
                                                    {qLabel}
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span style={{ color: '#10b981', fontSize: '12px', fontWeight: 600 }}>Portfolio TWR:</span>
                                                    <span style={{ fontWeight: 600, color: pfVal >= 0 ? '#10b981' : '#ef4444' }}>
                                                        {pfVal >= 0 ? '+' : ''}{pfVal.toFixed(2)}%
                                                    </span>
                                                </div>
                                                {bnchVal !== null && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                        <span style={{ color: '#6366f1', fontSize: '12px', fontWeight: 600 }}>S&P 500 TWR:</span>
                                                        <span style={{ fontWeight: 600, color: bnchVal >= 0 ? '#6366f1' : '#ef4444' }}>
                                                            {bnchVal >= 0 ? '+' : ''}{bnchVal.toFixed(2)}%
                                                        </span>
                                                    </div>
                                                )}

                                                {tickerItems.length > 0 && (
                                                    <div style={{ marginTop: 4, borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>
                                                        {tickerItems.map(item => {
                                                            // Use original value if available (when linked), otherwise use displayed value
                                                            const originalKey = `${item.dataKey}_original`;
                                                            const displayValue = item.payload[originalKey] !== undefined
                                                                ? item.payload[originalKey]
                                                                : (item.value as number);
                                                            return (
                                                                <div key={item.dataKey as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px', gap: '8px' }}>
                                                                    <span style={{ color: item.color, fontSize: '11px', fontWeight: 600, maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.dataKey}:</span>
                                                                    <span style={{ fontWeight: 600, fontSize: '11px', color: displayValue >= 0 ? '#10b981' : '#ef4444' }}>
                                                                        {displayValue >= 0 ? '+' : ''}{displayValue.toFixed(2)}%
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                                    <span style={{ color: '#94a3b8', fontSize: '11px' }}>Rolling IRR (Annualized):</span>
                                                    <span style={{ fontWeight: 500, fontSize: '11px', color: irrVal >= 0 ? '#10b981' : '#ef4444' }}>
                                                        {irrVal >= 0 ? '+' : ''}{irrVal.toFixed(2)}%
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                            <Area
                                name="Portfolio TWR"
                                type="monotone"
                                dataKey="return"
                                stroke="#10b981"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorReturn)"
                            />
                            {showBenchmark && (
                                <Line
                                    name="S&P 500"
                                    type="monotone"
                                    dataKey="benchmarkReturn"
                                    stroke="#6366f1"
                                    strokeWidth={3}
                                    strokeDasharray="4 4"
                                    dot={false}
                                />
                            )}
                            {Array.from(selectedTickers).map((ticker) => (
                                <Line
                                    key={ticker}
                                    name={ticker}
                                    type="monotone"
                                    dataKey={ticker}
                                    stroke={getColorForString(ticker)}
                                    strokeWidth={3}
                                    dot={false}
                                    connectNulls={false}
                                />
                            ))}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
            {/* Methodology Tooltip Portal */}
            {showMethodologyTooltip && createPortal(
                <div
                    className="kpi-tooltip"
                    style={{
                        left: showMethodologyTooltip.x > window.innerWidth - 400 ? 'auto' : showMethodologyTooltip.x + 15,
                        right: showMethodologyTooltip.x > window.innerWidth - 400 ? window.innerWidth - showMethodologyTooltip.x + 15 : 'auto',
                        top: showMethodologyTooltip.y + 20,
                        maxWidth: '380px'
                    }}
                >
                    <div className="tooltip-title">Performance Methodology</div>
                    <div style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.6, marginBottom: '12px' }}>
                        The chart shows <strong style={{ color: '#e2e8f0' }}>Time-Weighted Return (TWR)</strong>, which measures investment skill independent of cash flows.
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.5, marginBottom: '10px', borderTop: '1px solid #334155', paddingTop: '10px' }}>
                        <strong style={{ color: '#cbd5e1' }}>Est. PnL</strong> = Wealth from price changes<br />
                        <strong style={{ color: '#cbd5e1' }}>Est. ROI %</strong> = Return vs committed capital<br />
                        <strong style={{ color: '#cbd5e1' }}>IRR</strong> = Dollar-weighted annualized return
                    </div>
                    <div style={{ color: '#64748b', fontSize: '10px', fontStyle: 'italic' }}>
                        Based on 13F filings. Excludes intra-quarter trades, shorts, dividends, and fees.
                    </div>
                </div>,
                document.body
            )}

            {/* Holdings Table with IRR for Performance View */}
            <PortfolioChart
                data={data}
                timeRange={timeRange as any}
                onTimeRangeChange={onTimeRangeChange as any}
                offset={offset}
                onOffsetChange={onOffsetChange}
                hideChart={true}
                showIRR={true}
                selectedTickers={selectedTickers}
                onToggleTicker={toggleTicker}
                customStart={customStartQuarter}
                customEnd={customEndQuarter}
            />
        </div>
    );
}

export default App
