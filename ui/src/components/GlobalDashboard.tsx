import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Activity, ChevronRight, ChevronDown, ArrowUp, ArrowDown, Info, LayoutGrid, Briefcase, DollarSign, PlusCircle, MinusCircle, Users, Sparkles, LineChart as LineIcon } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts';

interface Holding {
    ticker?: string;
    issuer_name: string;
    value: number;
    shares: number;
    weight?: number;
    weight_change?: number;
}

interface FundHighlight {
    cik: string;
    name: string;
    total_value: number;
    prior_value?: number;
    value_change?: number;
    value_change_pct?: number;
    period: string;
    position_count?: number;
    concentration?: number;
    concentration_change?: number;
    new_count?: number;
    exit_count?: number;
    top_add?: {
        ticker?: string;
        issuer_name: string;
        weight_change: number;
        curr_weight: number;
    } | null;
    top_holdings: Holding[];
}

interface Mover {
    fund_name: string;
    ticker?: string;
    issuer_name: string;
    val_change: number;
    pct_of_fund?: number;
    curr_weight?: number;
    value: number;
}

interface Shift {
    fund_name: string;
    ticker?: string;
    issuer_name: string;
    weight_delta: number;
    curr_weight: number;
    prev_weight?: number;
}

interface KPIs {
    fund_count: number;
    total_aum: number;
    prior_aum: number;
    new_positions: number;
    exited_positions: number;
}

interface CrowdingItem {
    ticker?: string;
    issuer_name: string;
    fund_count?: number;
    funds?: string[];
    curr_count?: number;
    prev_count?: number;
    change?: number;
}

interface CrowdingSignals {
    most_held: CrowdingItem[];
    gaining_funds: CrowdingItem[];
    losing_funds: CrowdingItem[];
}

interface NewPosition {
    ticker?: string;
    issuer_name: string;
    fund_name: string;
    value: number;
    weight: number;
}

interface TickerFundActivity {
    [ticker: string]: {
        buying: number;
        selling: number;
        ticker?: string;
        issuer?: string;
        buying_funds?: string[];
        selling_funds?: string[];
    };
}

interface ExitedPosition {
    ticker?: string;
    issuer_name: string;
    fund_name: string;
    value: number;
    weight: number;
}

interface DashboardSummary {
    fund_highlights: FundHighlight[];
    big_movers: Mover[];
    portfolio_shifts: Shift[];
    latest_period?: string;
    prior_period?: string;
    fund_periods?: string[];  // All unique periods across funds
    periods_aligned?: boolean;  // True if all funds have same latest period
    kpis?: KPIs;
    crowding_signals?: CrowdingSignals;
    new_positions?: NewPosition[];
    exited_positions?: ExitedPosition[];
    ticker_fund_activity?: TickerFundActivity;
}

interface GlobalDashboardProps {
    summary: DashboardSummary;
    onSelectFund: (cik: string) => void;
}

const formatCurrency = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (absValue >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (absValue >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
};

const formatQ = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const q = Math.floor((d.getMonth() + 3) / 3);
    return `${q}Q '${d.getFullYear().toString().slice(2)}`;
};

const COLORS = [
    '#38bdf8', // Sky 400
    '#10b981', // Emerald 500
    '#fb7185', // Rose 400
    '#f472b6', // Pink 400
    '#a78bfa', // Violet 400
    '#fbbf24', // Amber 400
    '#fb923c', // Orange 400
    '#22d3ee', // Cyan 400
];

const PerformanceComparisonChart: React.FC = () => {
    const [data, setData] = useState<{ chart_data: any[], funds: string[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [showBenchmark, setShowBenchmark] = useState(true);
    const [benchmarkData, setBenchmarkData] = useState<any[]>([]);
    const [timeRange, setTimeRange] = useState<'2Q' | 'YTD' | '1Y' | '3Y' | '5Y' | '10Y' | 'CUSTOM' | 'MAX'>('1Y');
    const [selectedFunds, setSelectedFunds] = useState<string[]>([]);
    const [customStart, setCustomStart] = useState<string>('');
    const [customEnd, setCustomEnd] = useState<string>('');
    const [showStartDropdown, setShowStartDropdown] = useState(false);
    const [showEndDropdown, setShowEndDropdown] = useState(false);

    const availableQuarters = useMemo(() => {
        if (!data?.chart_data) return [];
        return data.chart_data.map(d => d.period).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [data]);

    useEffect(() => {
        if (availableQuarters.length > 0 && (!customStart || !customEnd)) {
            setCustomStart(availableQuarters[Math.min(availableQuarters.length - 1, 4)]); // Default to last 4-5 quarters
            setCustomEnd(availableQuarters[0]);
        }
    }, [availableQuarters, customStart, customEnd]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/dashboard/performance');
                const result = await res.json();
                setData(result);
                if (result.funds) setSelectedFunds(result.funds);

                if (result.chart_data?.length > 0) {
                    const start = result.chart_data[0].period;
                    const end = result.chart_data[result.chart_data.length - 1].period;
                    fetchBenchmark(start, end);
                }
            } catch (err) {
                console.error("Failed to fetch performance comparison", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const fetchBenchmark = async (start: string, end: string) => {
        try {
            const res = await fetch(`/api/market/benchmark?start=${start}&end=${end}`);
            const bData = await res.json();
            if (Array.isArray(bData)) setBenchmarkData(bData);
        } catch (err) {
            console.error("Failed to fetch benchmark", err);
        }
    };

    const filteredAndIndexedData = useMemo(() => {
        if (!data || !data.chart_data) return [];

        let filtered = [...data.chart_data];
        const latestDateInAll = new Date(filtered[filtered.length - 1].period);

        if (timeRange !== 'MAX') {
            if (timeRange === 'CUSTOM' && customStart && customEnd) {
                const startDate = new Date(customStart);
                const endDate = new Date(customEnd);
                filtered = filtered.filter(d => {
                    const dDate = new Date(d.period);
                    return dDate >= startDate && dDate <= endDate;
                });
            } else {
                let startLimit = new Date(latestDateInAll);
                if (timeRange === '2Q') {
                    startLimit.setMonth(latestDateInAll.getMonth() - 4);
                } else if (timeRange === 'YTD') {
                    startLimit = new Date(latestDateInAll.getFullYear(), 0, 1);
                } else if (timeRange === '1Y') {
                    startLimit.setFullYear(latestDateInAll.getFullYear() - 1);
                    startLimit.setDate(startLimit.getDate() + 1);
                } else if (timeRange === '3Y') {
                    startLimit.setFullYear(latestDateInAll.getFullYear() - 3);
                    startLimit.setDate(startLimit.getDate() + 1);
                } else if (timeRange === '5Y') {
                    startLimit.setFullYear(latestDateInAll.getFullYear() - 5);
                    startLimit.setDate(startLimit.getDate() + 1);
                } else if (timeRange === '10Y') {
                    startLimit.setFullYear(latestDateInAll.getFullYear() - 10);
                    startLimit.setDate(startLimit.getDate() + 1);
                }
                filtered = filtered.filter(d => new Date(d.period) >= startLimit);
            }
        }

        if (filtered.length === 0) return [];

        const baseValues: { [key: string]: number } = {};
        data.funds.forEach(fund => {
            const idxInAll = data.chart_data.findIndex(d => d.period === filtered[0].period);
            let val = filtered[0][fund];
            if (val === null || val === undefined) {
                // Search backwards in data.chart_data for the last known value
                for (let i = idxInAll - 1; i >= 0; i--) {
                    if (data.chart_data[i][fund] !== null && data.chart_data[i][fund] !== undefined) {
                        val = data.chart_data[i][fund];
                        break;
                    }
                }
            }
            baseValues[fund] = val ?? 0;
        });

        let benchBase = 1;
        if (showBenchmark && benchmarkData.length > 0) {
            const firstDate = new Date(filtered[0].period).getTime();
            const closest = benchmarkData.reduce((prev, curr) => {
                return Math.abs(new Date(curr.date).getTime() - firstDate) < Math.abs(new Date(prev.date).getTime() - firstDate) ? curr : prev;
            });
            benchBase = closest.value || 1;
        }

        return filtered.map(d => {
            const row: any = { period: d.period };
            data.funds.forEach(fund => {
                const val = d[fund];
                if (val !== null && val !== undefined) {
                    row[fund] = ((1 + val / 100) / (1 + baseValues[fund] / 100) - 1) * 100;
                } else {
                    row[fund] = null;
                }
            });
            if (showBenchmark && benchmarkData.length > 0) {
                const dDate = new Date(d.period).getTime();
                const closest = benchmarkData.reduce((prev, curr) => {
                    return Math.abs(new Date(curr.date).getTime() - dDate) < Math.abs(new Date(prev.date).getTime() - dDate) ? curr : prev;
                });
                row["S&P 500"] = ((closest.value / benchBase) - 1) * 100;
            }
            return row;
        });
    }, [data, benchmarkData, showBenchmark, timeRange, customStart, customEnd]);

    const toggleFund = (fund: string) => {
        setSelectedFunds(prev =>
            prev.includes(fund) ? prev.filter(f => f !== fund) : [...prev, fund]
        );
    };

    if (loading) return (
        <div className="dashboard-section performance-section" style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span>Loading performance comparison...</span>
        </div>
    );

    if (!data || data.chart_data.length === 0) return null;

    return (
        <section className="dashboard-section performance-section" style={{ marginTop: '20px', padding: '16px' }}>
            <div className="section-header" style={{ marginBottom: timeRange === 'CUSTOM' ? '2px' : '8px', gap: '12px' }}>
                <div className="section-icon-box" style={{ color: '#38bdf8', minWidth: '40px' }}>
                    <LineIcon size={20} />
                </div>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                    <h3 className="section-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '1.1rem' }}>Performance Comparison</h3>
                    <p className="section-desc" style={{ fontSize: '0.85rem' }}>Cumulative TWR across portfolios (Indexed to 0%)</p>
                </div>
                <div className="header-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="time-controls-group" style={{ display: 'flex', gap: '2px', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {(['2Q', 'YTD', '1Y', '3Y', '5Y', '10Y', 'MAX', 'CUSTOM'] as const).map(range => (
                            <button
                                key={range}
                                className={`control-btn-mini ${timeRange === range ? 'active' : ''}`}
                                onClick={() => setTimeRange(range)}
                                style={{ padding: '4px 8px', fontSize: '10px' }}
                            >
                                {range}
                            </button>
                        ))}
                    </div>

                    <button
                        className={`control-btn-mini ${showBenchmark ? 'active' : ''}`}
                        onClick={() => setShowBenchmark(!showBenchmark)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: showBenchmark ? '#6366f1' : '#94a3b8',
                            borderColor: showBenchmark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255,255,255,0.05)',
                            background: showBenchmark ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                            borderRadius: '20px',
                            padding: '4px 12px',
                            whiteSpace: 'nowrap',
                            minWidth: 'auto'
                        }}
                    >
                        <Activity size={14} />
                        <span style={{ fontSize: '10px', fontWeight: 600 }}>S&P 500</span>
                    </button>
                </div>
            </div>

            {timeRange === 'CUSTOM' && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px',
                    marginBottom: '6px',
                    marginTop: '-4px', // Pull up significantly
                    alignItems: 'center',
                    paddingRight: '4px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em' }}>FROM</span>
                        <div style={{ position: 'relative' }}>
                            <button
                                className="control-btn-mini"
                                onClick={() => { setShowStartDropdown(!showStartDropdown); setShowEndDropdown(false); }}
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 8px' }}
                            >
                                {formatQ(customStart)} <ChevronDown size={10} />
                            </button>
                            {showStartDropdown && (
                                <div className="quarter-dropdown" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto', marginTop: '4px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}>
                                    {availableQuarters.map(q => (
                                        <div
                                            key={q}
                                            className="dropdown-item"
                                            onClick={() => { setCustomStart(q); setShowStartDropdown(false); }}
                                            style={{ padding: '8px 16px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                                        >
                                            {formatQ(q)}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em' }}>TO</span>
                        <div style={{ position: 'relative' }}>
                            <button
                                className="control-btn-mini"
                                onClick={() => { setShowEndDropdown(!showEndDropdown); setShowStartDropdown(false); }}
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 8px' }}
                            >
                                {formatQ(customEnd)} <ChevronDown size={10} />
                            </button>
                            {showEndDropdown && (
                                <div className="quarter-dropdown" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto', marginTop: '4px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}>
                                    {availableQuarters.map(q => (
                                        <div
                                            key={q}
                                            className="dropdown-item"
                                            onClick={() => { setCustomEnd(q); setShowEndDropdown(false); }}
                                            style={{ padding: '8px 16px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
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

            <div className="comparison-chart-container" style={{ height: '400px', marginTop: '8px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={filteredAndIndexedData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis
                            dataKey="period"
                            stroke="#64748b"
                            tickFormatter={(val) => {
                                const d = new Date(val);
                                const q = Math.floor((d.getMonth() + 3) / 3);
                                return `Q${q} '${d.getFullYear().toString().slice(2)}`;
                            }}
                            tick={{ fontSize: 11 }}
                        />
                        <YAxis
                            stroke="#64748b"
                            tickFormatter={(val) => `${val >= 0 ? '+' : ''}${val.toFixed(0)}%`}
                            tick={{ fontSize: 11 }}
                        />
                        <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#0f172a',
                                border: '1px solid #1e293b',
                                borderRadius: '12px',
                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
                            }}
                            itemStyle={{ fontSize: '11px', padding: '2px 0' }}
                            labelStyle={{ color: '#f8fafc', fontWeight: 600, fontSize: '12px', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}
                            formatter={(value: number, name: string) => [
                                <span style={{ color: value >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                                    {value >= 0 ? '+' : ''}{value.toFixed(2)}%
                                </span>,
                                name
                            ]}
                            labelFormatter={(label) => formatQ(label)}
                        />
                        <Legend
                            content={({ payload }) => (
                                <div className="custom-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
                                    {payload?.map((entry: any, index: number) => {
                                        if (entry.value === 'S&P 500') return null;
                                        const isActive = selectedFunds.includes(entry.value);
                                        return (
                                            <div
                                                key={`item-${index}`}
                                                className={`legend-item ${isActive ? 'active' : 'inactive'}`}
                                                onClick={() => toggleFund(entry.value)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    cursor: 'pointer',
                                                    opacity: isActive ? 1 : 0.4,
                                                    transition: 'all 0.2s ease',
                                                    padding: '4px 8px',
                                                    borderRadius: '6px',
                                                    background: isActive ? 'rgba(255,255,255,0.03)' : 'transparent'
                                                }}
                                            >
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.color }}></div>
                                                <span style={{ fontSize: '11px', fontWeight: 600, color: isActive ? '#f1f5f9' : '#94a3b8' }}>{entry.value}</span>
                                            </div>
                                        );
                                    })}
                                    {showBenchmark && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 1, padding: '4px 8px' }}>
                                            <div style={{ width: '12px', height: '0', borderTop: '2px dashed #6366f1' }}></div>
                                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#f1f5f9' }}>S&P 500</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        />
                        {data.funds.map((fund, idx) => (
                            <Line
                                key={fund}
                                type="monotone"
                                dataKey={fund}
                                stroke={COLORS[idx % COLORS.length]}
                                strokeWidth={selectedFunds.includes(fund) ? 2.5 : 0}
                                dot={false}
                                activeDot={selectedFunds.includes(fund) ? { r: 5, strokeWidth: 0 } : false}
                                connectNulls
                                hide={!selectedFunds.includes(fund)}
                            />
                        ))}
                        {showBenchmark && (
                            <Line
                                type="monotone"
                                dataKey="S&P 500"
                                stroke="#6366f1"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                dot={false}
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </section>
    );
};

type MoversMode = 'dollar' | 'percent' | 'funds';

export const GlobalDashboard: React.FC<GlobalDashboardProps> = ({ summary, onSelectFund }) => {
    const [moversMode, setMoversMode] = useState<MoversMode>('dollar');
    const [moverTooltip, setMoverTooltip] = useState<{ x: number, y: number, ticker: string } | null>(null);
    const [crowdingTooltip, setCrowdingTooltip] = useState<{ x: number, y: number, ticker: string } | null>(null);
    const [kpiTooltip, setKpiTooltip] = useState<{ x: number, y: number, type: string } | null>(null);
    const [newPosSort, setNewPosSort] = useState<'value' | 'weight'>('value');
    const [exitPosSort, setExitPosSort] = useState<'value' | 'weight'>('value');
    const kpis = summary.kpis;
    const aumChange = kpis ? kpis.total_aum - kpis.prior_aum : 0;
    const aumChangePercent = kpis && kpis.prior_aum > 0 ? ((aumChange / kpis.prior_aum) * 100).toFixed(1) : '0';
    const crowding = summary.crowding_signals;
    const newPositions = summary.new_positions || [];
    const exitedPositions = summary.exited_positions || [];
    const tickerActivity = summary.ticker_fund_activity || {};
    const fundHighlights = summary.fund_highlights || [];
    const sortedFundsByAUM = [...fundHighlights].sort((a, b) => b.total_value - a.total_value);
    const sortedFundsByChange = [...fundHighlights].sort((a, b) => (b.value_change_pct || 0) - (a.value_change_pct || 0));

    const weightSortedNew = [...newPositions].sort((a, b) => b.weight - a.weight);
    const weightSortedExited = [...exitedPositions].sort((a, b) => b.weight - a.weight);

    const displayNewPositions = [...newPositions].sort((a, b) =>
        newPosSort === 'value' ? b.value - a.value : b.weight - a.weight
    );
    const displayExitedPositions = [...exitedPositions].sort((a, b) =>
        exitPosSort === 'value' ? b.value - a.value : b.weight - a.weight
    );

    const handleMoverTooltipEnter = (e: React.MouseEvent, ticker: string) => {
        setMoverTooltip({ x: e.clientX, y: e.clientY, ticker });
    };

    const handleMoverTooltipLeave = () => {
        setMoverTooltip(null);
    };

    const handleCrowdingTooltipEnter = (e: React.MouseEvent, ticker: string) => {
        setCrowdingTooltip({ x: e.clientX, y: e.clientY, ticker });
    };

    const handleCrowdingTooltipLeave = () => {
        setCrowdingTooltip(null);
    };

    const handleKpiTooltipEnter = (e: React.MouseEvent, type: string) => {
        setKpiTooltip({ x: e.clientX, y: e.clientY, type });
    };

    const handleKpiTooltipLeave = () => {
        setKpiTooltip(null);
    };

    const getMoverDisplay = (mover: Mover) => {
        const ticker = mover.ticker || 'N/A';
        const activity = tickerActivity[ticker];
        switch (moversMode) {
            case 'percent':
                return `${mover.pct_of_fund !== undefined && mover.pct_of_fund >= 0 ? '+' : ''}${(mover.pct_of_fund || 0).toFixed(1)}%`;
            case 'funds':
                if (activity) {
                    return `${activity.buying}B / ${activity.selling}S`;
                }
                return '-';
            default:
                return formatCurrency(mover.val_change);
        }
    };

    const getMoverDescription = () => {
        switch (moversMode) {
            case 'percent':
                return 'Weight change (%)';
            case 'funds':
                return 'Buying / Selling';
            default:
                return '$ change (QoQ)';
        }
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <div className="dashboard-badge">GLOBAL OVERVIEW</div>
                <h1 className="dashboard-title">Portfolio Intelligence</h1>
                <p className="dashboard-subtitle">Aggregated insights across all tracked hedge funds</p>
                {summary.latest_period && (
                    summary.periods_aligned ? (
                        <p className="dashboard-time-context">
                            Data reflects latest filed 13Fs ({formatQ(summary.latest_period)}).
                            {summary.prior_period && ` Changes are vs ${formatQ(summary.prior_period)}.`}
                        </p>
                    ) : (
                        <p className="dashboard-time-context mixed-periods">
                            <span className="period-warning">⚠️ Filing periods vary across funds.</span>
                            {' '}Each fund reflects its latest 13F. Compare with caution.
                        </p>
                    )
                )}
            </div>

            {/* KPI Tiles */}
            {kpis && (
                <div className="kpi-tiles-row">
                    {/* Tracked Funds */}
                    <div
                        className="kpi-tile has-tooltip"
                        onMouseEnter={(e) => handleKpiTooltipEnter(e, 'funds')}
                        onMouseLeave={handleKpiTooltipLeave}
                    >
                        <div className="kpi-icon"><Briefcase size={18} /></div>
                        <div className="kpi-content">
                            <span className="kpi-value">{kpis.fund_count}</span>
                            <span className="kpi-label">Tracked Funds</span>
                        </div>
                        {kpiTooltip && kpiTooltip.type === 'funds' && (
                            <div className="kpi-tooltip" style={{ left: kpiTooltip.x - 100, top: kpiTooltip.y + 20 }}>
                                <div className="tooltip-title">Tracked Funds</div>
                                {sortedFundsByAUM.map((fund, i) => (
                                    <div key={i} className="tooltip-fund-row two-col">
                                        <span className="fund-name">{fund.name}</span>
                                        <span className="fund-aum">{formatCurrency(fund.total_value)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {/* Total AUM */}
                    <div
                        className="kpi-tile has-tooltip"
                        onMouseEnter={(e) => handleKpiTooltipEnter(e, 'aum')}
                        onMouseLeave={handleKpiTooltipLeave}
                    >
                        <div className="kpi-icon"><DollarSign size={18} /></div>
                        <div className="kpi-content">
                            <span className="kpi-value">{formatCurrency(kpis.total_aum)}</span>
                            <span className="kpi-label">Total AUM</span>
                        </div>
                        {kpiTooltip && kpiTooltip.type === 'aum' && (
                            <div className="kpi-tooltip" style={{ left: kpiTooltip.x - 150, top: kpiTooltip.y + 20 }}>
                                <div className="tooltip-title">AUM by Fund</div>
                                {sortedFundsByAUM.map((fund, i) => (
                                    <div key={i} className="tooltip-fund-row">
                                        <span className="fund-name">{fund.name}</span>
                                        <span className="fund-aum">{formatCurrency(fund.total_value)}</span>
                                        <span className={`fund-change ${(fund.value_change || 0) >= 0 ? 'positive' : 'negative'}`}>
                                            {(fund.value_change || 0) >= 0 ? '+' : ''}{formatCurrency(fund.value_change || 0)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {/* AUM Change */}
                    <div
                        className="kpi-tile has-tooltip"
                        onMouseEnter={(e) => handleKpiTooltipEnter(e, 'delta')}
                        onMouseLeave={handleKpiTooltipLeave}
                    >
                        <div className={`kpi-icon ${aumChange >= 0 ? 'positive' : 'negative'}`}>
                            {aumChange >= 0 ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                        </div>
                        <div className="kpi-content">
                            <span className={`kpi-value ${aumChange >= 0 ? 'positive' : 'negative'}`}>
                                {aumChange >= 0 ? '+' : ''}{aumChangePercent}%
                            </span>
                            <span className="kpi-label">AUM Δ QoQ</span>
                        </div>
                        {kpiTooltip && kpiTooltip.type === 'delta' && (
                            <div className="kpi-tooltip" style={{ left: kpiTooltip.x - 150, top: kpiTooltip.y + 20 }}>
                                <div className="tooltip-title">AUM Δ QoQ by Fund</div>
                                {sortedFundsByChange.map((fund, i) => (
                                    <div key={i} className="tooltip-fund-row">
                                        <span className="fund-name">{fund.name}</span>
                                        <span className={`fund-change ${(fund.value_change_pct || 0) >= 0 ? 'positive' : 'negative'}`}>
                                            {(fund.value_change_pct || 0) >= 0 ? '+' : ''}{(fund.value_change_pct || 0).toFixed(1)}%
                                        </span>
                                        <span className={`fund-change ${(fund.value_change || 0) >= 0 ? 'positive' : 'negative'}`} style={{ fontWeight: 500, fontSize: '0.75rem' }}>
                                            {(fund.value_change || 0) >= 0 ? '+' : ''}{formatCurrency(fund.value_change || 0)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {/* New Positions */}
                    <div
                        className="kpi-tile has-tooltip"
                        onMouseEnter={(e) => handleKpiTooltipEnter(e, 'new')}
                        onMouseLeave={handleKpiTooltipLeave}
                    >
                        <div className="kpi-icon positive"><PlusCircle size={18} /></div>
                        <div className="kpi-content">
                            <span className="kpi-value positive">{kpis.new_positions}</span>
                            <span className="kpi-label">New Positions</span>
                        </div>
                        {kpiTooltip && kpiTooltip.type === 'new' && newPositions.length > 0 && (
                            <div className="kpi-tooltip" style={{ left: kpiTooltip.x - 200, top: kpiTooltip.y + 20 }}>
                                <div className="tooltip-title">New Positions</div>
                                {weightSortedNew.slice(0, 8).map((pos, i) => (
                                    <div key={i} className="tooltip-position-row">
                                        <span className="pos-ticker">{pos.ticker || 'N/A'}</span>
                                        <span className="pos-fund">{pos.fund_name}</span>
                                        <span className="pos-weight">+{pos.weight.toFixed(1)}%</span>
                                    </div>
                                ))}
                                {newPositions.length > 8 && (
                                    <span className="tooltip-more">+{newPositions.length - 8} more</span>
                                )}
                            </div>
                        )}
                    </div>
                    {/* Exited Positions */}
                    <div
                        className="kpi-tile has-tooltip"
                        onMouseEnter={(e) => handleKpiTooltipEnter(e, 'exited')}
                        onMouseLeave={handleKpiTooltipLeave}
                    >
                        <div className="kpi-icon negative"><MinusCircle size={18} /></div>
                        <div className="kpi-content">
                            <span className="kpi-value negative">{kpis.exited_positions}</span>
                            <span className="kpi-label">Exited</span>
                        </div>
                        {kpiTooltip && kpiTooltip.type === 'exited' && exitedPositions.length > 0 && (
                            <div className="kpi-tooltip" style={{ left: kpiTooltip.x - 200, top: kpiTooltip.y + 20 }}>
                                <div className="tooltip-title">Exited Positions</div>
                                {weightSortedExited.slice(0, 8).map((pos, i) => (
                                    <div key={i} className="tooltip-position-row">
                                        <span className="pos-ticker">{pos.ticker || 'N/A'}</span>
                                        <span className="pos-fund">{pos.fund_name}</span>
                                        <span className="pos-weight negative">-{pos.weight.toFixed(1)}%</span>
                                    </div>
                                ))}
                                {exitedPositions.length > 8 && (
                                    <span className="tooltip-more">+{exitedPositions.length - 8} more</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

            )}

            <div className="dashboard-grid">
                {/* Left Column: Fund Highlights */}
                <div className="dashboard-main">
                    <section className="dashboard-section">
                        <div className="section-header">
                            <div className="section-icon-box">
                                <LayoutGrid className="section-icon" />
                            </div>
                            <div>
                                <h3 className="section-title">Fund Summaries</h3>
                                <p className="section-desc">
                                    Top positions by reported market value
                                </p>
                            </div>
                        </div>

                        <div className="fund-highlights-grid">
                            {summary.fund_highlights.map((fund) => (
                                <div
                                    key={fund.cik}
                                    className="fund-summary-card"
                                    onClick={() => onSelectFund(fund.cik)}
                                >
                                    <div className="card-header">
                                        <div className="fund-info">
                                            <h4 className="fund-name">{fund.name}</h4>
                                            <div className="fund-meta">
                                                <span className="fund-period">{formatQ(fund.period)}</span>
                                                {(fund.new_count !== undefined || fund.exit_count !== undefined) && (
                                                    <div className="activity-badges">
                                                        {(fund.new_count || 0) > 0 && <span className="badge new">{fund.new_count} New</span>}
                                                        {(fund.exit_count || 0) > 0 && <span className="badge exited">{fund.exit_count} Exit</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="fund-aum-block">
                                            <div className="fund-value">{formatCurrency(fund.total_value)}</div>
                                            {fund.value_change !== undefined && fund.value_change !== 0 && (
                                                <div className={`fund-change ${fund.value_change >= 0 ? 'positive' : 'negative'}`}>
                                                    {fund.value_change >= 0 ? '↑' : '↓'} {fund.value_change_pct?.toFixed(1)}%
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="fund-stats-row">
                                        <div className="fund-stat">
                                            <span className="stat-value">{fund.position_count || '—'}</span>
                                            <span className="stat-label">positions</span>
                                        </div>
                                        <div className="fund-stat">
                                            <span className="stat-value">
                                                {fund.concentration?.toFixed(0) || '—'}%
                                                {fund.concentration_change !== undefined && fund.concentration_change !== 0 && (
                                                    <span className={`stat-trend ${fund.concentration_change >= 0 ? 'positive' : 'negative'}`}>
                                                        {fund.concentration_change >= 0 ? '↑' : '↓'}{Math.abs(fund.concentration_change).toFixed(0)}%
                                                    </span>
                                                )}
                                            </span>
                                            <span className="stat-label">top 3</span>
                                        </div>
                                    </div>

                                    <div className="top-holdings-list">
                                        {fund.top_holdings.map((h, i) => (
                                            <div key={i} className="mini-holding">
                                                <div className="holding-ticker">{h.ticker || h.issuer_name.slice(0, 4)}</div>
                                                <div className="holding-bar-container">
                                                    <div
                                                        className="holding-bar"
                                                        style={{ width: `${(h.value / fund.total_value) * 100}%` }}
                                                    ></div>
                                                </div>
                                                <div className="holding-val">{formatCurrency(h.value)}</div>
                                                <div className="holding-weight-col">
                                                    <span className="holding-weight">{h.weight?.toFixed(1)}%</span>
                                                    <span className={`holding-change ${(h.weight_change ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                                                        ({(h.weight_change ?? 0) >= 0 ? '+' : ''}{(h.weight_change ?? 0).toFixed(1)}%)
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {fund.top_add && (
                                        <div className="top-add-banner">
                                            <Sparkles size={12} className="sparkle-icon" />
                                            <span className="add-label">TOP ADD:</span>
                                            <span className="add-ticker">{fund.top_add.ticker || fund.top_add.issuer_name.slice(0, 4)}</span>
                                            <span className="add-delta positive">+{fund.top_add.weight_change.toFixed(1)}%</span>
                                        </div>
                                    )}

                                    <div className="card-footer">
                                        <span>View Full Portfolio</span>
                                        <ChevronRight size={14} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <PerformanceComparisonChart />
                </div>

                {/* Right Column: Movers, Shifts, Crowding, New Positions */}
                <div className="dashboard-sidebar">
                    {/* Big Movers with Toggle */}
                    <section className="dashboard-section compact">
                        <div className="section-header">
                            <TrendingUp className="section-icon-small" />
                            <div>
                                <h3 className="section-title-small">Big Movers</h3>
                                <p className="section-desc-small">{getMoverDescription()}</p>
                            </div>
                            <div className="toggle-group">
                                <button
                                    className={`toggle-btn ${moversMode === 'dollar' ? 'active' : ''}`}
                                    onClick={() => setMoversMode('dollar')}
                                    title="Dollar change"
                                >$</button>
                                <button
                                    className={`toggle-btn ${moversMode === 'percent' ? 'active' : ''}`}
                                    onClick={() => setMoversMode('percent')}
                                    title="Percent of fund"
                                >%</button>
                                <button
                                    className={`toggle-btn ${moversMode === 'funds' ? 'active' : ''}`}
                                    onClick={() => setMoversMode('funds')}
                                    title="Fund count"
                                >#</button>
                            </div>
                        </div>

                        <div className="movers-list scrollable">
                            {[...summary.big_movers]
                                .sort((a, b) => {
                                    if (moversMode === 'percent') {
                                        return Math.abs(b.pct_of_fund || 0) - Math.abs(a.pct_of_fund || 0);
                                    }
                                    if (moversMode === 'funds') {
                                        const tickerA = a.ticker || '';
                                        const tickerB = b.ticker || '';
                                        const actA = tickerActivity[tickerA];
                                        const actB = tickerActivity[tickerB];
                                        const countA = actA ? actA.buying + actA.selling : 0;
                                        const countB = actB ? actB.buying + actB.selling : 0;
                                        return countB - countA;
                                    }
                                    return Math.abs(b.val_change) - Math.abs(a.val_change);
                                })
                                .map((mover, i) => {
                                    const displayValue = moversMode === 'percent' ? (mover.pct_of_fund || 0) : mover.val_change;
                                    const isPositive = displayValue >= 0;

                                    // For # mode, get fund activity info
                                    const ticker = mover.ticker || '';
                                    const activity = tickerActivity[ticker];
                                    const allFunds = activity ? [...(activity.buying_funds || []), ...(activity.selling_funds || [])] : [];
                                    const totalFundCount = allFunds.length;
                                    const showTooltip = moversMode === 'funds' && totalFundCount > 1;
                                    const buyingFunds = (activity?.buying_funds || []).join(', ') || 'None';
                                    const sellingFunds = (activity?.selling_funds || []).join(', ') || 'None';

                                    return (
                                        <div key={i} className="mover-item">
                                            <div className="mover-info">
                                                <span className="mover-ticker">{mover.ticker || 'N/A'}</span>
                                                {!showTooltip && (
                                                    <span className="mover-fund">{mover.fund_name}</span>
                                                )}
                                            </div>
                                            <div
                                                className={`mover-delta ${showTooltip ? 'has-tooltip' : ''} ${moversMode !== 'funds' ? (isPositive ? 'positive' : 'negative') : ''}`}
                                                onMouseEnter={showTooltip ? (e) => handleMoverTooltipEnter(e, ticker) : undefined}
                                                onMouseLeave={showTooltip ? handleMoverTooltipLeave : undefined}
                                            >
                                                {moversMode !== 'funds' && (isPositive ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                                                {getMoverDisplay(mover)}
                                                {moversMode === 'percent' && mover.curr_weight !== undefined && (
                                                    <span className="weight-current">@ {mover.curr_weight.toFixed(1)}%</span>
                                                )}
                                                {showTooltip && moverTooltip && moverTooltip.ticker === ticker && (
                                                    <span
                                                        className="tooltip-content visible"
                                                        style={{ left: moverTooltip.x - 260, top: moverTooltip.y + 15 }}
                                                    >
                                                        <span className="tooltip-row buying">
                                                            <strong>Buying:</strong>
                                                            {(activity?.buying_funds || []).length > 0 ? (
                                                                (activity?.buying_funds || []).map((fund, idx) => (
                                                                    <span key={idx} className="fund-line">{fund}</span>
                                                                ))
                                                            ) : (
                                                                <span className="fund-line">None</span>
                                                            )}
                                                        </span>
                                                        <span className="tooltip-row selling">
                                                            <strong>Selling:</strong>
                                                            {(activity?.selling_funds || []).length > 0 ? (
                                                                (activity?.selling_funds || []).map((fund, idx) => (
                                                                    <span key={idx} className="fund-line">{fund}</span>
                                                                ))
                                                            ) : (
                                                                <span className="fund-line">None</span>
                                                            )}
                                                        </span>
                                                    </span>
                                                )}

                                            </div>

                                        </div>
                                    );
                                })}
                        </div>
                    </section>

                    {/* Crowding Signals */}
                    {crowding && (crowding.most_held.length > 0 || crowding.gaining_funds.length > 0) && (
                        <section className="dashboard-section compact">
                            <div className="section-header">
                                <Users className="section-icon-small" />
                                <div>
                                    <h3 className="section-title-small">Crowding Signals</h3>
                                    <p className="section-desc-small">Stocks held by multiple funds</p>
                                </div>
                            </div>

                            {crowding.most_held.length > 0 && (
                                <div className="crowding-subsection">
                                    <div className="crowding-label">Most Widely Held</div>
                                    <div className="crowding-list">
                                        {crowding.most_held.slice(0, 3).map((item, i) => {
                                            const itemTicker = item.ticker || 'N/A';
                                            return (
                                                <div key={i} className="crowding-item">
                                                    <span className="crowding-ticker">{itemTicker}</span>
                                                    <span
                                                        className="crowding-count has-tooltip"
                                                        onMouseEnter={(e) => handleCrowdingTooltipEnter(e, itemTicker)}
                                                        onMouseLeave={handleCrowdingTooltipLeave}
                                                    >
                                                        {item.fund_count} funds
                                                        {crowdingTooltip && crowdingTooltip.ticker === itemTicker && item.funds && item.funds.length > 0 && (
                                                            <span
                                                                className="tooltip-content visible"
                                                                style={{ left: crowdingTooltip.x - 200, top: crowdingTooltip.y + 15 }}
                                                            >
                                                                {item.funds.map((fund, idx) => (
                                                                    <span key={idx} className="fund-line">{fund}</span>
                                                                ))}
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}



                            {crowding.gaining_funds.length > 0 && (
                                <div className="crowding-subsection">
                                    <div className="crowding-label">↑ Fund Count</div>
                                    <div className="crowding-list">
                                        {crowding.gaining_funds.slice(0, 3).map((item, i) => (
                                            <div key={i} className="crowding-item">
                                                <span className="crowding-ticker">{item.ticker || 'N/A'}</span>
                                                <span className="crowding-change positive">+{item.change}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {crowding.losing_funds.length > 0 && (
                                <div className="crowding-subsection">
                                    <div className="crowding-label">↓ Fund Count</div>
                                    <div className="crowding-list">
                                        {crowding.losing_funds.slice(0, 3).map((item, i) => (
                                            <div key={i} className="crowding-item">
                                                <span className="crowding-ticker">{item.ticker || 'N/A'}</span>
                                                <span className="crowding-change negative">{item.change}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {/* New Positions Spotlight */}
                    {newPositions.length > 0 && (
                        <section className="dashboard-section compact">
                            <div className="section-header">
                                <PlusCircle className="section-icon-small" style={{ color: '#10b981' }} />
                                <div>
                                    <h3 className="section-title-small">New This Quarter</h3>
                                    <p className="section-desc-small">New positions and re-entries</p>
                                </div>
                                <div className="toggle-group">
                                    <button
                                        className={`toggle-btn ${newPosSort === 'value' ? 'active' : ''}`}
                                        onClick={() => setNewPosSort('value')}
                                        title="Sort by dollar value"
                                    >$</button>
                                    <button
                                        className={`toggle-btn ${newPosSort === 'weight' ? 'active' : ''}`}
                                        onClick={() => setNewPosSort('weight')}
                                        title="Sort by portfolio %"
                                    >%</button>
                                </div>
                            </div>

                            <div className="new-positions-list scrollable">
                                {displayNewPositions.map((pos, i) => (
                                    <div key={i} className="new-position-item">
                                        <div className="new-position-info">
                                            <span className="new-position-ticker">{pos.ticker || 'N/A'}</span>
                                            <span className="new-position-fund">{pos.fund_name}</span>
                                        </div>
                                        <div className="new-position-stats">
                                            <span className="new-position-value">{formatCurrency(pos.value)}</span>
                                            <span className="new-position-weight">{pos.weight.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Exited Positions Spotlight */}
                    {exitedPositions.length > 0 && (
                        <section className="dashboard-section compact">
                            <div className="section-header">
                                <MinusCircle className="section-icon-small" style={{ color: '#ef4444' }} />
                                <div>
                                    <h3 className="section-title-small">Exited This Quarter</h3>
                                    <p className="section-desc-small">Positions fully sold off</p>
                                </div>
                                <div className="toggle-group">
                                    <button
                                        className={`toggle-btn ${exitPosSort === 'value' ? 'active' : ''}`}
                                        onClick={() => setExitPosSort('value')}
                                        title="Sort by dollar value"
                                    >$</button>
                                    <button
                                        className={`toggle-btn ${exitPosSort === 'weight' ? 'active' : ''}`}
                                        onClick={() => setExitPosSort('weight')}
                                        title="Sort by portfolio %"
                                    >%</button>
                                </div>
                            </div>

                            <div className="exited-positions-list scrollable">
                                {displayExitedPositions.map((pos, i) => (
                                    <div key={i} className="exited-position-item">
                                        <div className="exited-position-info">
                                            <span className="exited-position-ticker">{pos.ticker || 'N/A'}</span>
                                            <span className="exited-position-fund">{pos.fund_name}</span>
                                        </div>
                                        <div className="exited-position-stats">
                                            <span className="exited-position-value">{formatCurrency(pos.value)}</span>
                                            <span className="exited-position-weight">-{pos.weight.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                </div>
            </div>
        </div>
    );
};
