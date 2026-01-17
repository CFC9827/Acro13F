import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { TrendingUp, Activity, Info, RefreshCw, BarChart3, AlertCircle, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';

interface MimicDataPoint {
    date: string;
    period: string;
    return: number;
    label: string;
    benchmark_return: number;
}

interface MimicTrade {
    date: string;
    period: string;
    ticker: string;
    action: 'Buy' | 'Sell' | 'Add' | 'Reduce';
    shares_change: number;
    price: number;
    value: number;
}

interface MimicPerformanceResponse {
    cik: string;
    fund_name: string;
    series: MimicDataPoint[];
    trades?: MimicTrade[];
    error?: string;
}

interface MimicPerformanceChartProps {
    cik: string;
    fundName: string;
}

const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
};

const timeRanges = ['2Q', 'YTD', '1Y', '3Y', '5Y', '10Y', 'MAX', 'CUSTOM'];

export const MimicPerformanceChart: React.FC<MimicPerformanceChartProps> = ({ cik, fundName }) => {
    const [data, setData] = useState<MimicDataPoint[]>([]);
    const [trades, setTrades] = useState<MimicTrade[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showBenchmark, setShowBenchmark] = useState(true);
    const [timeRange, setTimeRange] = useState('1Y');
    const [offset, setOffset] = useState(0);
    const [showMethodologyTooltip, setShowMethodologyTooltip] = useState<{ x: number; y: number } | null>(null);

    // Custom Range State
    const [customStartQuarter, setCustomStartQuarter] = useState<string>('');
    const [customEndQuarter, setCustomEndQuarter] = useState<string>('');
    const [showStartDropdown, setShowStartDropdown] = useState(false);
    const [showEndDropdown, setShowEndDropdown] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/funds/${cik}/mimic-performance`);
                const result: MimicPerformanceResponse = await res.json();
                if (result.error) {
                    setError(result.error);
                } else {
                    setData(result.series || []);
                    setTrades(result.trades || []);
                }
            } catch (err) {
                setError("Failed to fetch mimic performance data");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (cik) fetchData();
    }, [cik]);

    // Derived periods for custom dropdowns
    const availableQuarters = useMemo(() => {
        if (!data) return [];
        // Sort descending by date
        return [...data]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(d => d.date); // Using filing date as ID
    }, [data]);

    // Initialize custom range defaults when data loads
    useEffect(() => {
        if (availableQuarters.length > 0) {
            if (!customStartQuarter) setCustomStartQuarter(availableQuarters[availableQuarters.length - 1]); // Earliest
            if (!customEndQuarter) setCustomEndQuarter(availableQuarters[0]); // Latest
        }
    }, [availableQuarters]);

    const filteredData = useMemo(() => {
        if (!data || data.length === 0) return [];

        // Determine available range based on data
        // Sort data by date ascending for processing
        const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // 1. Determine Window End Date based on offset
        let endDate: Date;

        if (timeRange === 'CUSTOM') {
            // Use customEndQuarter if valid
            if (customEndQuarter) endDate = new Date(customEndQuarter);
            else endDate = new Date(sortedData[sortedData.length - 1].date);
        } else {
            // Offset 0 = Latest available date
            // Offset 1 = 1 period back
            const latestIdx = sortedData.length - 1 - offset;

            // Need at least 2 points to show a line
            if (latestIdx < 1) return [];

            endDate = new Date(sortedData[latestIdx].date);
        }

        // 2. Determine Window Start Date based on timeRange
        let startDate: Date;

        if (timeRange === 'CUSTOM') {
            if (customStartQuarter) startDate = new Date(customStartQuarter);
            else startDate = new Date(sortedData[0].date);
        } else if (timeRange === 'MAX') {
            startDate = new Date(0);
        } else if (timeRange === 'YTD') {
            startDate = new Date(endDate.getFullYear(), 0, 1);
        } else {
            // Quarter-based calculation logic aligned with Reported Chart
            // 1Y = 4 quarters. 3Y = 12 quarters.

            let monthsToSubtract = 0;
            if (timeRange === '2Q') monthsToSubtract = 3; // (2-1)*3
            else if (timeRange === '1Y') monthsToSubtract = 9; // (4-1)*3
            else if (timeRange === '3Y') monthsToSubtract = 33; // (12-1)*3
            else if (timeRange === '5Y') monthsToSubtract = 57; // (20-1)*3
            else if (timeRange === '10Y') monthsToSubtract = 117; // (40-1)*3 = 117 months

            startDate = new Date(endDate);
            startDate.setMonth(startDate.getMonth() - monthsToSubtract);
        }

        // Filter data points: Must be >= startDate AND <= endDate
        const filtered = sortedData.filter(d => {
            const dt = new Date(d.date);
            return dt >= startDate && dt <= endDate;
        });

        if (filtered.length < 2) return [];

        // Rebase returns to 0 at the start of the period
        const startVal = filtered[0].return;
        const startBench = filtered[0].benchmark_return;

        const baseVal = 1 + (startVal / 100);
        const baseBench = 1 + (startBench / 100);

        return filtered.map(d => ({
            ...d,
            return: (((1 + d.return / 100) / baseVal) - 1) * 100,
            benchmark_return: (((1 + d.benchmark_return / 100) / baseBench) - 1) * 100
        }));

    }, [data, timeRange, offset, customStartQuarter, customEndQuarter]);


    const stats = useMemo(() => {
        if (filteredData.length === 0) return { totalReturn: 0, benchmarkTotal: 0, outperformance: 0 };
        const last = filteredData[filteredData.length - 1];
        return {
            totalReturn: last.return,
            benchmarkTotal: last.benchmark_return,
            outperformance: last.return - last.benchmark_return
        };
    }, [filteredData]);

    // Group trades by period
    const tradesByPeriod = useMemo(() => {
        const groups = new Map<string, MimicTrade[]>();
        // Filter trades to match the visible chart data range (approx)
        // Or keep all trades? Let's keep all trades for now, but maybe only show relevant ones?
        // Actually user usually wants to see history. Let's keep all trades but sort better.

        // Sort trades by date descending (already done by backend, but good to ensure)
        // Then within each period, sort by Absolute Value (Impact)

        // We can't easily re-sort the flat list without losing period grouping if we don't group first.

        // 1. Group first
        const tempGroups = new Map<string, MimicTrade[]>();
        for (const trade of trades) {
            if (!tempGroups.has(trade.period)) {
                tempGroups.set(trade.period, []);
            }
            tempGroups.get(trade.period)!.push(trade);
        }

        // 2. Sort within groups
        for (const [period, items] of tempGroups) {
            items.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
        }

        return tempGroups;
    }, [trades]);

    // Map filing dates to period labels for chart axis
    const dateToLabelMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const item of data) {
            if (item.period) {
                const d = new Date(item.period);
                const q = Math.floor(d.getMonth() / 3) + 1;
                map.set(item.date, `Q${q} '${d.getFullYear().toString().slice(2)}`);
            } else {
                const d = new Date(item.date);
                const q = Math.floor((d.getMonth() + 3) / 3);
                map.set(item.date, `Q${q} '${d.getFullYear().toString().slice(2)}*`);
            }
        }
        return map;
    }, [data]);

    const formatQ = (dateStr: string) => {
        const d = new Date(dateStr);
        const q = Math.floor(d.getMonth() / 3) + 1;
        return `Q${q} ${d.getFullYear()}`;
    };

    if (loading) {
        return (
            <div className="loading-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '100px' }}>
                <RefreshCw className="spin" size={48} style={{ color: '#3b82f6' }} />
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#94a3b8' }}>Simulating Mimic Portfolio...</div>
                <div style={{ fontSize: '14px', color: '#64748b' }}>Calculating returns based on 13F filing dates</div>
            </div>
        );
    }

    if (error || data.length < 2) {
        return (
            <div className="loading-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '100px' }}>
                <AlertCircle size={48} style={{ color: '#ef4444', opacity: 0.5 }} />
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#94a3b8' }}>
                    {error || "Insufficient Data for Simulation"}
                </div>
                <div style={{ fontSize: '14px', color: '#64748b', maxWidth: '400px', textAlign: 'center' }}>
                    We need at least two historical filings with valid price data to simulate a mimicked portfolio.
                    {error && " " + error}
                </div>
            </div>
        );
    }

    return (
        <div className="portfolio-dashboard-v2">
            <div className="performance-summary-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '30px' }}>
                <div className="summary-card">
                    <div className="summary-label">Mimic Portfolio Return ({timeRange})</div>
                    <div className={`summary-value ${stats.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                        {stats.totalReturn >= 0 ? '+' : ''}{stats.totalReturn.toFixed(2)}%
                    </div>
                    <div className="summary-subtext">Return for selected period</div>
                </div>

                <div className="summary-card">
                    <div className="summary-label">S&P 500 (SPY) Return</div>
                    <div className={`summary-value ${stats.benchmarkTotal >= 0 ? 'positive' : 'negative'}`} style={{ color: '#6366f1' }}>
                        {stats.benchmarkTotal >= 0 ? '+' : ''}{stats.benchmarkTotal.toFixed(2)}%
                    </div>
                    <div className="summary-subtext">Benchmark performance</div>
                </div>

                <div className="summary-card">
                    <div className="summary-label">Alpha (vs Benchmark)</div>
                    <div className={`summary-value ${stats.outperformance >= 0 ? 'positive' : 'negative'}`}>
                        {stats.outperformance >= 0 ? '+' : ''}{stats.outperformance.toFixed(2)}%
                    </div>
                    <div className="summary-subtext">Excess return</div>
                </div>
            </div>

            <div className="chart-panel-v2" style={{ height: '550px', position: 'relative', marginBottom: '32px' }}>
                <div className="chart-header-v2" style={{ justifyContent: 'space-between' }}>
                    <div className="chart-title-v2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Mimic Portfolio Tracker
                        <Info
                            size={16}
                            style={{ color: '#94a3b8', cursor: 'help' }}
                            onMouseEnter={(e) => setShowMethodologyTooltip({ x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setShowMethodologyTooltip(null)}
                        />
                        <button
                            className={`quarter-nav-btn ${showBenchmark ? 'active' : ''}`}
                            onClick={() => setShowBenchmark(!showBenchmark)}
                            style={{
                                fontSize: '12px',
                                marginLeft: '12px',
                                padding: '4px 8px',
                                border: '1px solid #334155',
                                borderRadius: '4px',
                                color: showBenchmark ? '#818cf8' : '#64748b',
                                background: showBenchmark ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                borderColor: showBenchmark ? '#6366f1' : '#334155'
                            }}
                        >
                            {showBenchmark ? 'Hide S&P 500' : 'Compare S&P 500'}
                        </button>
                    </div>

                    <div className="time-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="nav-arrows" style={{ display: 'flex', gap: '4px', marginRight: '8px' }}>
                            <button className="time-btn" onClick={() => {
                                if (timeRange === 'CUSTOM') {
                                    // Navigate Custom Range
                                    const sIdx = availableQuarters.indexOf(customStartQuarter);
                                    const eIdx = availableQuarters.indexOf(customEndQuarter);
                                    if (sIdx < availableQuarters.length - 1) {
                                        setCustomStartQuarter(availableQuarters[sIdx + 1]);
                                        if (eIdx < availableQuarters.length - 1) setCustomEndQuarter(availableQuarters[eIdx + 1]);
                                    }
                                } else {
                                    setOffset(offset + 1)
                                }
                            }}>
                                <ChevronLeft size={16} />
                            </button>
                            <button className="time-btn" onClick={() => {
                                if (timeRange === 'CUSTOM') {
                                    // Navigate Custom Range
                                    const sIdx = availableQuarters.indexOf(customStartQuarter);
                                    const eIdx = availableQuarters.indexOf(customEndQuarter);
                                    if (eIdx > 0) {
                                        setCustomEndQuarter(availableQuarters[eIdx - 1]);
                                        if (sIdx > 0) setCustomStartQuarter(availableQuarters[sIdx - 1]);
                                    }
                                } else {
                                    setOffset(Math.max(0, offset - 1));
                                }
                            }} disabled={timeRange !== 'CUSTOM' && offset === 0}>
                                <ChevronRight size={16} />
                            </button>
                        </div>
                        {timeRanges.map(range => (
                            <button
                                key={range}
                                onClick={() => { setTimeRange(range); setOffset(0); }}
                                className={`time-btn ${timeRange === range ? 'active' : ''}`}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Custom Range Dropdowns Overlay */}
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
                                    {formatQ(customStartQuarter)}
                                    <ChevronDown size={14} style={{ opacity: 0.6 }} />
                                </div>
                                {showStartDropdown && (
                                    <div className="quarter-dropdown" style={{
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
                                        boxShadow: '0 -10px 25px rgba(0,0,0,0.1)' // Adjusted shadow for light theme
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
                                                {formatQ(q)}
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
                                    {formatQ(customEndQuarter)}
                                    <ChevronDown size={14} style={{ opacity: 0.6 }} />
                                </div>
                                {showEndDropdown && (
                                    <div className="quarter-dropdown" style={{
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
                                                {formatQ(q)}
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
                        <ComposedChart data={filteredData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <defs>
                                <linearGradient id="colorMimic" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(str: string) => {
                                    return dateToLabelMap.get(str) || str;
                                }}
                                tick={{ fontSize: 11, fill: '#94a3b8' }}
                                axisLine={false}
                                tickLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                tickFormatter={(val) => `${val > 0 ? '+' : ''}${val.toFixed(0)}%`}
                                tick={{ fontSize: 12, fill: '#94a3b8' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        const qLabel = dateToLabelMap.get(label as string) || label;
                                        const item = payload[0].payload;

                                        return (
                                            <div style={{
                                                backgroundColor: '#0f172a',
                                                border: '1px solid #334155',
                                                borderRadius: '8px',
                                                padding: '12px',
                                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                                minWidth: '200px'
                                            }}>
                                                <div style={{ fontWeight: 600, marginBottom: '8px', color: '#f1f5f9', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>
                                                    {qLabel} (Filing: {item.date})
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span style={{ color: '#3b82f6', fontSize: '12px' }}>Mimic Return:</span>
                                                    <span style={{ fontWeight: 600, color: item.return >= 0 ? '#10b981' : '#ef4444' }}>
                                                        {item.return >= 0 ? '+' : ''}{item.return.toFixed(2)}%
                                                    </span>
                                                </div>
                                                {showBenchmark && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#6366f1', fontSize: '12px' }}>S&P 500:</span>
                                                        <span style={{ fontWeight: 600, color: item.benchmark_return >= 0 ? '#6366f1' : '#ef4444' }}>
                                                            {item.benchmark_return >= 0 ? '+' : ''}{item.benchmark_return.toFixed(2)}%
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Area
                                name="Mimic Portfolio"
                                type="monotone"
                                dataKey="return"
                                stroke="#3b82f6"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorMimic)"
                            />
                            {showBenchmark && (
                                <Line
                                    name="S&P 500"
                                    type="monotone"
                                    dataKey="benchmark_return"
                                    stroke="#6366f1"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                />
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Simulated Trades Table */}
            <div className="activity-view" style={{
                background: '#0f172a',
                borderRadius: '8px',
                border: '1px solid #334155',
                padding: '20px',
                marginTop: '12px'
            }}>
                <div className="activity-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', marginBottom: '4px' }}>Simulated Trade Log</h3>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                            Major portfolio changes executing on filing dates
                        </div>
                    </div>
                </div>

                {trades.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                        No trades recorded during the simulation period.
                    </div>
                ) : (
                    <div className="activity-table-container">
                        <table className="activity-table">
                            <thead>
                                <tr>
                                    {/* Date column removed as requested */}
                                    <th style={{ background: '#0f172a', paddingLeft: '16px' }}>Ticker</th>
                                    <th style={{ background: '#0f172a' }}>Action</th>
                                    <th style={{ textAlign: 'right', background: '#0f172a' }}>Shares</th>
                                    <th style={{ textAlign: 'right', background: '#0f172a' }}>Price</th>
                                    <th style={{ textAlign: 'right', background: '#0f172a', paddingRight: '16px' }}>Transaction Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from(tradesByPeriod.entries()).map(([period, items]) => (
                                    <React.Fragment key={period}>
                                        <tr className="activity-period-header">
                                            <td colSpan={5} style={{
                                                color: '#e2e8f0',
                                                background: '#1e293b',
                                                borderBottom: '1px solid #334155',
                                                padding: '8px 16px',
                                                fontSize: '13px',
                                                fontWeight: 600
                                            }}>
                                                {formatQ(items[0].period)} Filing ({items[0].date})
                                            </td>
                                        </tr>
                                        {items.map((trade, idx) => (
                                            <tr key={`${trade.date}-${trade.ticker}-${idx}`} className="activity-row" style={{ height: '44px' }}>
                                                <td className="activity-stock" style={{ paddingLeft: '16px' }}>
                                                    <span className="activity-ticker" style={{ fontWeight: 700, color: '#f8fafc' }}>{trade.ticker}</span>
                                                </td>
                                                <td>
                                                    <span style={{
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.05em',
                                                        background: (trade.action === 'Buy' || trade.action === 'Add') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                        color: (trade.action === 'Buy' || trade.action === 'Add') ? '#34d399' : '#f87171',
                                                        border: '1px solid',
                                                        borderColor: (trade.action === 'Buy' || trade.action === 'Add') ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                                                    }}>
                                                        {trade.action}
                                                    </span>
                                                </td>
                                                <td className={`activity-shares`} style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>
                                                    {trade.shares_change > 0 ? '+' : ''}
                                                    {Math.abs(trade.shares_change) >= 1000000
                                                        ? (trade.shares_change / 1000000).toFixed(2) + 'M'
                                                        : trade.shares_change.toLocaleString()}
                                                </td>
                                                <td className="activity-value" style={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                                                    ${trade.price.toFixed(2)}
                                                </td>
                                                <td className="activity-impact" style={{ color: '#f8fafc', fontWeight: 600, paddingRight: '16px', fontFamily: 'monospace' }}>
                                                    {formatCurrency(trade.value)}
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

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
                    <div className="tooltip-title">Mimic Portfolio Methodology</div>
                    <div style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.6, marginBottom: '12px' }}>
                        This simulation aims to replicate the performance of a user following a fund's 13F filings.
                        <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                            <li><strong>Entry/Exit:</strong> Simulated trades occur on the exact <span style={{ color: '#e2e8f0', fontWeight: 600 }}>Filing Release Date</span>.</li>
                            <li><strong>Weights:</strong> Position sizes are determined by the shares reported in the most recent filing.</li>
                            <li><strong>Execution Price:</strong> Uses the market closing price on the filing day.</li>
                        </ul>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.5, borderTop: '1px solid #334155', paddingTop: '10px' }}>
                        This differs from TWR by reflecting the <span style={{ fontStyle: 'italic' }}>delay</span> between a quarter ending and the filing becoming public (up to 45 days).
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
