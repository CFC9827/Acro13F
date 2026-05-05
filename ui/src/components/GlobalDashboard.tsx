import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TrendingUp, Activity, ChevronRight, ChevronUp, ChevronDown, ArrowUp, ArrowDown, Info, LayoutGrid, Briefcase, DollarSign, PlusCircle, MinusCircle, Users, Sparkles, LineChart as LineIcon, Folder, FolderPlus, Trash2, Edit, AlertCircle, PieChart, GripVertical, Search, MousePointer2, Loader2, X, Target, Zap, Plus, Award } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { InstitutionalHoldersModal } from './InstitutionalHoldersModal';

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
    cik?: string;
    ticker?: string;
    issuer_name: string;
    val_change: number;
    pct_of_fund?: number;
    curr_weight?: number;
    shares_change?: number;
    value: number;
}

interface Shift {
    fund_name: string;
    cik?: string;
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
    funds?: { name: string; cik: string }[];
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
    cik?: string;
    value: number;
    weight: number;
}

interface TickerFundActivity {
    [ticker: string]: {
        buying: number;
        selling: number;
        ticker?: string;
        issuer?: string;
        buying_funds?: { name: string; cik: string }[];
        selling_funds?: { name: string; cik: string }[];
        new_buyers?: { name: string; cik: string }[];
        exited_sellers?: { name: string; cik: string }[];
    };
}

interface ExitedPosition {
    ticker?: string;
    issuer_name: string;
    fund_name: string;
    cik?: string;
    value: number;
    weight: number;
}

interface SwoopOpportunity {
    ticker?: string;
    issuer_name: string;
    dropPct: number;
    weight: number;
    currentPrice: number;
    prevPrice: number;
    fund_name: string;
}

interface ConsensusItem {
    ticker?: string;
    issuer_name: string;
    fund_count: number;
    prev_fund_count?: number;
    change?: number;
    total_value: number;
    funds: { name: string; cik: string }[];
    avg_weight?: number;
    max_weight?: number;
    net_shares_change?: number;
    conviction_score?: number;
    top_holder?: string;
}

interface SectorItem {
    sector: string;
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
    consensus_stocks?: ConsensusItem[];
}

interface Group {
    id: number;
    name: string;
    member_ciks: string[];
}

interface GlobalDashboardProps {
    summary: DashboardSummary;
    onSelectFund: (cik: string) => void;
    allFunds: { cik: string; name: string }[];
}

const formatCurrency = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (absValue >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (absValue >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
};

const formatNumber = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
    if (absValue >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (absValue >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
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

const PerformanceComparisonChart: React.FC<{ groupId: number | null }> = ({ groupId }) => {
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
            setLoading(true);
            try {
                const url = groupId
                    ? `/api/dashboard/performance?group_id=${groupId}`
                    : '/api/dashboard/performance';
                const res = await fetch(url);
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
    }, [groupId]);

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
            const row: any = {
                period: d.period,
                time: new Date(d.period).getTime()
            };
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

            <div className="comparison-chart-container" style={{ height: '600px', marginTop: '8px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={filteredAndIndexedData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis
                            dataKey="time"
                            scale="time"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            stroke="#64748b"
                            minTickGap={30}
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
                            content={({ active, payload, label }: any) => {
                                if (!active || !payload || payload.length === 0) return null;

                                // Sort payload by value descending (best performance first)
                                const sortedPayload = [...payload].sort((a: any, b: any) => {
                                    const aVal = typeof a.value === 'number' ? a.value : -Infinity;
                                    const bVal = typeof b.value === 'number' ? b.value : -Infinity;
                                    return bVal - aVal;
                                });

                                return (
                                    <div style={{
                                        backgroundColor: '#0f172a',
                                        border: '1px solid #1e293b',
                                        borderRadius: '12px',
                                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
                                        padding: '12px 16px',
                                        minWidth: '200px'
                                    }}>
                                        <div style={{
                                            color: '#f8fafc',
                                            fontWeight: 600,
                                            fontSize: '12px',
                                            marginBottom: '8px',
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            paddingBottom: '4px'
                                        }}>
                                            {formatQ(label)}
                                        </div>
                                        {sortedPayload.map((entry: any, idx: number) => (
                                            <div key={idx} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '3px 0',
                                                fontSize: '11px',
                                                gap: '12px'
                                            }}>
                                                <span style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    color: entry.color
                                                }}>
                                                    <span style={{
                                                        width: '8px',
                                                        height: '8px',
                                                        borderRadius: '50%',
                                                        background: entry.color,
                                                        flexShrink: 0
                                                    }} />
                                                    {entry.name}
                                                </span>
                                                <span style={{
                                                    color: entry.value >= 0 ? '#10b981' : '#ef4444',
                                                    fontWeight: 700
                                                }}>
                                                    {entry.value >= 0 ? '+' : ''}{entry.value?.toFixed(2)}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            }}
                        />
                        <Legend
                            content={({ payload }) => (
                                <div className="custom-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
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

type MoversMode = 'value' | 'shares' | 'funds';

export const GlobalDashboard: React.FC<GlobalDashboardProps> = ({ summary: initialSummary, onSelectFund, allFunds }) => {
    const [summary, setSummary] = useState<DashboardSummary>(initialSummary);

    // Sync local state when initialSummary prop changes (e.g. after backend fix/refresh)
    useEffect(() => {
        setSummary(initialSummary);
    }, [initialSummary]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [loading, setLoading] = useState(false);
    const [moversMode, setMoversMode] = useState<MoversMode>('value');
    const [moverTooltip, setMoverTooltip] = useState<{ x: number, y: number, ticker: string, index: number } | null>(null);
    const [crowdingTooltip, setCrowdingTooltip] = useState<{ x: number, y: number, ticker: string, source?: string } | null>(null);
    const [kpiTooltip, setKpiTooltip] = useState<{ x: number, y: number, type: string } | null>(null);
    const [newPosSort, setNewPosSort] = useState<'value' | 'weight'>('value');
    const [exitPosSort, setExitPosSort] = useState<'value' | 'weight'>('value');
    const [swoopTooltip, setSwoopTooltip] = useState<{ x: number, y: number } | null>(null);
    const [fundHistories, setFundHistories] = useState<{ [cik: string]: any[] }>({});
    const [sectorAllocation, setSectorAllocation] = useState<SectorItem[]>([]);
    const [draggedGroupId, setDraggedGroupId] = useState<number | null>(null);
    const [isFundSummariesMinimized, setIsFundSummariesMinimized] = useState(false);
    const normalizeTicker = (t?: string) => {
        if (!t) return '';
        // Extract base ticker (handle "AMZN PUT", "TSLA CALL", etc)
        return t.split(' ')[0].toUpperCase().trim();
    };

    const [activeTab, setActiveTab] = useState<'overview' | 'consensus'>('overview');
    const [stockSearchQuery, setStockSearchQuery] = useState('');
    const [searchTickerOnly, setSearchTickerOnly] = useState(false);
    const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
    const [holders, setHolders] = useState<any[]>([]);
    const [loadingHolders, setLoadingHolders] = useState(false);

    // Clear search and selection when returning to the overview tab
    useEffect(() => {
        if (activeTab === 'overview') {
            setStockSearchQuery('');
            setSearchTickerOnly(false);
            setSelectedTicker(null);
            setHolders([]);
        }
    }, [activeTab]);

    const fetchStockHolders = async (ticker: string) => {
        setSelectedTicker(ticker);
        setHolders([]); // Clear previous holders to avoid "one-selection behind" visual flicker
        setLoadingHolders(true);
        try {
            const url = `/api/explorer/stock/${encodeURIComponent(ticker)}/holders${selectedGroupId ? `?group_id=${selectedGroupId}` : ''}`;
            const res = await fetch(url);
            const data = await res.json();
            if (Array.isArray(data)) {
                setHolders(data);
            } else {
                setHolders([]);
            }
        } catch (err) {
            console.error("Failed to fetch holders", err);
            setHolders([]);
        } finally {
            setLoadingHolders(false);
        }
    };

    const kpis = summary.kpis;
    const aumChange = kpis ? kpis.total_aum - kpis.prior_aum : 0;
    const aumChangePercent = kpis && kpis.prior_aum > 0 ? ((aumChange / kpis.prior_aum) * 100).toFixed(1) : '0';
    
    const crowding = summary.crowding_signals;
    const mostHeld = crowding?.most_held || [];
    const gainingFunds = crowding?.gaining_funds || [];
    const losingFunds = crowding?.losing_funds || [];

    const newPositions = summary.new_positions || [];
    const exitedPositions = summary.exited_positions || [];
    const bigMovers = summary.big_movers || [];
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

    const handleMoverTooltipEnter = (e: React.MouseEvent, ticker: string, index: number) => {
        setMoverTooltip({ x: e.clientX, y: e.clientY, ticker, index });
    };

    const handleMoverTooltipLeave = () => {
        setMoverTooltip(null);
    };

    const handleCrowdingTooltipEnter = (e: React.MouseEvent, ticker: string, source: string) => {
        setCrowdingTooltip({ x: e.clientX, y: e.clientY, ticker, source });
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

    const handleSwoopTooltipEnter = (e: React.MouseEvent) => {
        setSwoopTooltip({ x: e.clientX, y: e.clientY });
    };

    const handleSwoopTooltipLeave = () => {
        setSwoopTooltip(null);
    };

    const handleDragStart = (e: React.DragEvent, groupId: number) => {
        setDraggedGroupId(groupId);
        e.dataTransfer.setData('text/plain', groupId.toString());
        e.dataTransfer.effectAllowed = 'move';

        // Add a slight delay to allow the drag image to be created before we change the opacity
        setTimeout(() => {
            const el = e.target as HTMLElement;
            el.style.opacity = '0.4';
        }, 0);
    };

    const handleDragEnd = (e: React.DragEvent) => {
        setDraggedGroupId(null);
        const el = e.target as HTMLElement;
        el.style.opacity = '1';
    };

    const handleDragOver = (e: React.DragEvent, targetGroupId: number) => {
        e.preventDefault();
        if (draggedGroupId === null || draggedGroupId === targetGroupId) return;

        // Use functional update to ensure we use the latest groups state
        setGroups(prevGroups => {
            const dragIndex = prevGroups.findIndex(g => g.id === draggedGroupId);
            const targetIndex = prevGroups.findIndex(g => g.id === targetGroupId);

            if (dragIndex === -1 || targetIndex === -1) return prevGroups;

            const newGroups = [...prevGroups];
            const [draggedItem] = newGroups.splice(dragIndex, 1);
            newGroups.splice(targetIndex, 0, draggedItem);
            return newGroups;
        });
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        const orders: { [key: number]: number } = {};
        groups.forEach((g, index) => { orders[g.id] = index; });

        try {
            await fetch('/api/dashboard/groups/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orders)
            });
        } catch (err) {
            console.error("Failed to save group order", err);
        }
    };

    // Fetch history data for all funds to calculate swoop opportunities
    useEffect(() => {
        const fetchAllHistories = async () => {
            const histories: { [cik: string]: any[] } = {};
            for (const fund of fundHighlights) {
                try {
                    const res = await fetch(`/api/funds/${fund.cik}/history`);
                    if (res.ok) {
                        const data = await res.json();
                        histories[fund.cik] = data;
                    }
                } catch (err) {
                    console.error(`Failed to fetch history for ${fund.cik}`, err);
                }
            }
            setFundHistories(histories);
        };
        if (fundHighlights.length > 0) {
            fetchAllHistories();
        }
    }, [fundHighlights]);

    // Calculate aggregated Swoop Opportunities across all funds using implied price methodology
    const swoopOpportunities = useMemo((): SwoopOpportunity[] => {
        const candidates: SwoopOpportunity[] = [];

        fundHighlights.forEach(fund => {
            const history = fundHistories[fund.cik];
            if (!history || history.length === 0) return;

            // Get unique periods sorted desc
            const uniquePeriods = Array.from(new Set(history.map((h: any) => h.period_of_report)))
                .sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime());

            if (uniquePeriods.length < 2) return; // Need at least 2 periods

            const latestPeriod = uniquePeriods[0];
            const priorPeriod = uniquePeriods[1];

            const currentHoldings = history.filter((h: any) => h.period_of_report === latestPeriod);
            const priorHoldings = history.filter((h: any) => h.period_of_report === priorPeriod);

            // Calculate AUMs
            const aum = currentHoldings.reduce((sum: number, h: any) => sum + h.value, 0);
            const priorAum = priorHoldings.reduce((sum: number, h: any) => sum + h.value, 0);

            const priorHoldingsMap = new Map(priorHoldings.map((h: any) => [h.cusip, h]));

            currentHoldings.forEach((curr: any) => {
                const prev = priorHoldingsMap.get(curr.cusip) as any;
                if (!prev) return; // Only check existing positions

                const weight = aum > 0 ? (curr.value / aum) * 100 : 0;

                // High Conviction Threshold (>3%)
                if (weight > 3.0) {
                    const currentPrice = curr.shares > 0 ? curr.value / curr.shares : 0;
                    const prevPrice = prev.shares > 0 ? prev.value / prev.shares : 0;

                    if (currentPrice > 0 && prevPrice > 0) {
                        const priceChange = (currentPrice - prevPrice) / prevPrice;

                        // Split Detection Heuristic: Price drop >30% AND Shares Incr >30% -> Likely Split
                        const isLikelySplit = priceChange < -0.3 && (curr.shares / prev.shares > 1.3);

                        // Price drop >10% and not a split
                        if (!isLikelySplit && priceChange < -0.10) {
                            candidates.push({
                                ticker: curr.ticker,
                                issuer_name: curr.issuer_name,
                                dropPct: priceChange * 100,
                                weight: weight,
                                currentPrice,
                                prevPrice,
                                fund_name: fund.name
                            });
                        }
                    }
                }
            });
        });

        // Sort by biggest drop first (most negative) and remove duplicates by ticker
        const seen = new Set<string>();
        return candidates
            .sort((a, b) => a.dropPct - b.dropPct)
            .filter(item => {
                const key = item.ticker || item.issuer_name;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }, [fundHighlights, fundHistories]);

    const getMoverDisplay = (mover: Mover) => {
        const tKey = normalizeTicker(mover.ticker || mover.issuer_name);
        const activity = tickerActivity[tKey];
        switch (moversMode) {
            case 'shares':
                return `${mover.shares_change !== undefined && mover.shares_change >= 0 ? '+' : ''}${(mover.shares_change || 0).toLocaleString()}`;
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
            case 'shares':
                return 'Share count change';
            case 'funds':
                return 'Buying / Selling';
            default:
                return 'Dollar value change';
        }
    };

    const fetchGroups = async () => {
        try {
            const res = await fetch('/api/dashboard/groups');
            const data = await res.json();
            setGroups(data);
        } catch (err) {
            console.error("Failed to fetch groups", err);
        }
    };

    const fetchFilteredSummary = async (groupId: number | null) => {
        setLoading(true);
        try {
            const url = groupId ? `/api/dashboard/summary?group_id=${groupId}` : '/api/dashboard/summary';
            const res = await fetch(url);
            const data = await res.json();
            setSummary(data);
        } catch (err) {
            console.error("Failed to fetch filtered summary", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGroups();
    }, []);

    // Use a ref to track the last fetched groupId to prevent redundant fetches
    const lastFetchedGroupId = useRef<number | null | undefined>(undefined);

    useEffect(() => {
        // Only fetch if the group ID has actually changed OR if it's the first load
        if (selectedGroupId !== lastFetchedGroupId.current || (selectedGroupId === null && !summary.latest_period)) {
            lastFetchedGroupId.current = selectedGroupId;
            
            if (selectedGroupId !== null) {
                fetchFilteredSummary(selectedGroupId);
            } else {
                // If we are resetting to "All Funds", prefer initialSummary if it exists
                if (initialSummary && initialSummary.latest_period && initialSummary.consensus_stocks) {
                    setSummary(initialSummary);
                } else {
                    fetchFilteredSummary(null);
                }
            }
        }
    }, [selectedGroupId, initialSummary, summary.latest_period]);

    // Fetch sector allocation data
    useEffect(() => {
        const fetchSectorAllocation = async () => {
            try {
                const url = selectedGroupId
                    ? `/api/sectors/allocation?group_id=${selectedGroupId}`
                    : '/api/sectors/allocation';
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    setSectorAllocation(data.allocation || []);
                }
            } catch (err) {
                console.error("Failed to fetch sector allocation", err);
            }
        };
        fetchSectorAllocation();
    }, [selectedGroupId, summary]);


    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) return;
        try {
            const res = await fetch('/api/dashboard/groups?name=' + encodeURIComponent(newGroupName), { method: 'POST' });
            if (res.ok) {
                setNewGroupName('');
                fetchGroups();
            }
        } catch (err) {
            console.error("Failed to create group", err);
            alert("Failed to create group. The name might already exist.");
        }
    };

    const handleDeleteGroup = async (id: number) => {
        if (window.confirm('Delete this group?')) {
            try {
                await fetch(`/api/dashboard/groups/${id}`, { method: 'DELETE' });
                if (selectedGroupId === id) setSelectedGroupId(null);
                fetchGroups();
            } catch (err) {
                console.error("Failed to delete group", err);
                alert("Failed to delete group.");
            }
        }
    };

    const toggleGroupMember = async (groupId: number, cik: string, isMember: boolean) => {
        try {
            const method = isMember ? 'DELETE' : 'POST';
            const url = isMember
                ? `/api/dashboard/groups/${groupId}/members/${cik}`
                : `/api/dashboard/groups/${groupId}/members?cik=${cik}`;
            await fetch(url, { method });
            fetchGroups();
        } catch (err) {
            console.error("Failed to toggle group member", err);
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

            {/* Group Selector Bar - Always visible if groups exist or being managed */}
            <div className="group-selector-bar" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '20px',
                padding: '6px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.05)',
            }}>
                <button
                    className={`group-pill ${selectedGroupId === null ? 'active' : ''}`}
                    onClick={() => {
                        setSelectedGroupId(null);
                        // Force refresh dashboard summary
                        setLoading(true);
                        fetch('/api/dashboard/summary')
                            .then(res => res.json())
                            .then(data => {
                                setSummary(data);
                                setLoading(false);
                            })
                            .catch(() => setLoading(false));
                    }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: selectedGroupId === null ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        color: selectedGroupId === null ? '#38bdf8' : '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                    }}
                >
                    <LayoutGrid size={14} />
                    <span>All Funds</span>
                </button>

                {groups.map(g => {
                    const isEmpty = g.member_ciks.length === 0;
                    const isBeingDragged = draggedGroupId === g.id;

                    return (
                        <div
                            key={g.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, g.id)}
                            onDragEnd={handleDragEnd}
                            onDragOver={(e) => handleDragOver(e, g.id)}
                            onDrop={handleDrop}
                            className={`group-pill-container ${isBeingDragged ? 'dragging' : ''}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                position: 'relative',
                                flexShrink: 0
                            }}
                        >
                            <button
                                className={`group-pill ${selectedGroupId === g.id ? 'active' : ''} ${isEmpty ? 'empty' : ''}`}
                                onClick={() => {
                                    if (isEmpty) {
                                        setIsGroupModalOpen(true);
                                    } else {
                                        setSelectedGroupId(g.id);
                                    }
                                }}
                                title={isEmpty ? 'Add funds to this group first' : `View ${g.name} (Drag to reorder)`}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    border: isEmpty ? '1px dashed rgba(239, 68, 68, 0.5)' : 'none',
                                    background: selectedGroupId === g.id ? 'rgba(56, 189, 248, 0.15)' :
                                        isEmpty ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                                    color: isEmpty ? '#ef4444' :
                                        selectedGroupId === g.id ? '#38bdf8' : '#94a3b8',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <GripVertical size={12} style={{ opacity: 0.5 }} className="drag-handle" />
                                <Folder size={14} />
                                <span>{g.name}</span>
                                {!isEmpty && <span style={{ opacity: 0.5, fontSize: '10px' }}>{g.member_ciks.length}</span>}
                            </button>
                        </div>
                    );
                })}

                <button
                    className="group-pill manage-btn"
                    onClick={() => setIsGroupModalOpen(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px dashed rgba(255,255,255,0.1)',
                        background: 'transparent',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                        marginLeft: 'auto'
                    }}
                >
                    <FolderPlus size={14} />
                    <span>Manage Groups</span>
                </button>
            </div>

            {/* Tab Switcher - Always visible */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'rgba(15, 23, 42, 0.4)', padding: '4px', borderRadius: '12px', width: 'fit-content' }}>
                <button
                    onClick={() => setActiveTab('overview')}
                    style={{
                        padding: '8px 24px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 700,
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        background: activeTab === 'overview' ? '#38bdf8' : 'transparent',
                        color: activeTab === 'overview' ? '#0f172a' : '#64748b',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <LayoutGrid size={16} />
                    Overview
                </button>
                <button
                    onClick={() => setActiveTab('consensus')}
                    style={{
                        padding: '8px 24px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 700,
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        background: activeTab === 'consensus' ? '#38bdf8' : 'transparent',
                        color: activeTab === 'consensus' ? '#0f172a' : '#64748b',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <TrendingUp size={16} />
                    Stock Consensus
                </button>
            </div>

            {(!fundHighlights || fundHighlights.length === 0) ? (
                <div className="dashboard-empty-state" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '80px 20px',
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: '24px',
                    border: '1px dashed rgba(255,255,255,0.1)',
                    margin: '20px 0'
                }}>
                    <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '24px', borderRadius: '50%', marginBottom: '24px' }}>
                        <PlusCircle size={48} style={{ color: '#38bdf8' }} />
                    </div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginBottom: '12px' }}>Welcome to Stock Screener</h2>
                    <p style={{ color: '#94a3b8', maxWidth: '500px', lineHeight: 1.6, marginBottom: '32px' }}>
                        You haven't added any hedge funds to track yet. Start by searching for a fund CIK or name in the sidebar to build your custom dashboard.
                    </p>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ padding: '10px 20px', background: '#38bdf8', color: '#0f172a', borderRadius: '8px', fontWeight: 700, fontSize: '14px' }}>
                            Search Funds in Sidebar
                        </div>
                    </div>
                </div>
            ) : (
                <>


                    {activeTab === 'overview' ? (
                        <>
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
                                                <span className="pos-ticker">{pos.ticker || pos.issuer_name}</span>
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
                                <div className="section-header" style={{ justifyContent: 'space-between', width: '100%' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                                    <button
                                        className="section-collapse-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsFundSummariesMinimized(!isFundSummariesMinimized);
                                        }}
                                        title={isFundSummariesMinimized ? "Expand" : "Minimize"}
                                    >
                                        {isFundSummariesMinimized ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                                    </button>
                                </div>

                                {!isFundSummariesMinimized ? (
                                    <div className="fund-highlights-grid">
                                        {fundHighlights.map((fund) => (
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
                                ) : null}
                            </section>

                            <PerformanceComparisonChart groupId={selectedGroupId} />
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
                                    <div className="toggle-group" style={{ gap: '4px' }}>
                                        <button
                                            className={`toggle-btn ${moversMode === 'value' ? 'active' : ''}`}
                                            onClick={() => setMoversMode('value')}
                                            title="Dollar change"
                                            style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px' }}
                                        >VALUE</button>
                                        <button
                                            className={`toggle-btn ${moversMode === 'shares' ? 'active' : ''}`}
                                            onClick={() => setMoversMode('shares')}
                                            title="Share count change"
                                            style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px' }}
                                        >SHARES</button>
                                        <button
                                            className={`toggle-btn ${moversMode === 'funds' ? 'active' : ''}`}
                                            onClick={() => setMoversMode('funds')}
                                            title="Total funds involved"
                                            style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px' }}
                                        >FUNDS</button>
                                    </div>
                                </div>

                            <div className="movers-list scrollable">
                                {(() => {
                                    let displayMovers = [...bigMovers];
                                    
                                    // In funds mode, group by ticker to avoid duplicates
                                    if (moversMode === 'funds') {
                                        const grouped: { [key: string]: any } = {};
                                        displayMovers.forEach(m => {
                                            const tKey = normalizeTicker(m.ticker || m.issuer_name);
                                            if (!grouped[tKey] || Math.abs(m.val_change) > Math.abs(grouped[tKey].val_change)) {
                                                grouped[tKey] = m;
                                            }
                                        });
                                        displayMovers = Object.values(grouped);
                                    }

                                    return displayMovers
                                        .sort((a, b) => {
                                            if (moversMode === 'shares') {
                                                return Math.abs(b.shares_change || 0) - Math.abs(a.shares_change || 0);
                                            }
                                            if (moversMode === 'funds') {
                                                const tKeyA = normalizeTicker(a.ticker || a.issuer_name);
                                                const tKeyB = normalizeTicker(b.ticker || b.issuer_name);
                                                const actA = tickerActivity[tKeyA];
                                                const actB = tickerActivity[tKeyB];
                                                const countA = actA ? (actA.buying_funds?.length || 0) + (actA.selling_funds?.length || 0) : 0;
                                                const countB = actB ? (actB.buying_funds?.length || 0) + (actB.selling_funds?.length || 0) : 0;
                                                return countB - countA;
                                            }
                                            return Math.abs(b.val_change) - Math.abs(a.val_change);
                                        })
                                        .slice(0, 20)
                                        .map((mover, i) => {
                                            const displayValue = moversMode === 'shares' ? (mover.shares_change || 0) : mover.val_change;
                                            const isPositive = displayValue >= 0;

                                            const tKey = normalizeTicker(mover.ticker || mover.issuer_name);
                                            const activity = tickerActivity[tKey];
                                            const totalFundCount = activity ? (activity.buying_funds?.length || 0) + (activity.selling_funds?.length || 0) : 0;
                                            const showTooltip = moversMode === 'funds' && totalFundCount > 1;

                                            return (
                                                <div key={i} className="mover-item">
                                                    <div className="mover-info">
                                                        <span className="mover-ticker" onClick={() => { setActiveTab('consensus'); setStockSearchQuery(normalizeTicker(mover.ticker || mover.issuer_name)); }}>{mover.ticker || mover.issuer_name}</span>
                                                        {!showTooltip && (
                                                            <span 
                                                                className="mover-fund"
                                                                onClick={() => mover.cik && onSelectFund(mover.cik)}
                                                                style={{ cursor: mover.cik ? 'pointer' : 'default', opacity: 0.8 }}
                                                            >
                                                                {mover.fund_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div
                                                        className={`mover-delta ${showTooltip ? 'has-tooltip' : ''} ${moversMode !== 'funds' ? (isPositive ? 'positive' : 'negative') : ''}`}
                                                        onMouseEnter={showTooltip ? (e) => handleMoverTooltipEnter(e, tKey, i) : undefined}
                                                        onMouseLeave={showTooltip ? handleMoverTooltipLeave : undefined}
                                                    >
                                                        {moversMode !== 'funds' && (isPositive ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                                                        {moversMode === 'funds' ? `${activity?.buying_funds?.length || 0}B / ${activity?.selling_funds?.length || 0}S` : getMoverDisplay(mover)}
                                                        {showTooltip && moverTooltip && moverTooltip.index === i && (
                                                            <span
                                                                className="tooltip-content visible"
                                                                style={{ left: moverTooltip.x - 260, top: moverTooltip.y + 15, zIndex: 1000 }}
                                                            >
                                                                <div className="tooltip-row buying">
                                                                    <strong>Buying:</strong>
                                                                    {(activity?.buying_funds || []).length > 0 ? (
                                                                        <div className="fund-list-simple">
                                                                            {(activity?.buying_funds || []).map((fund: any, idx) => (
                                                                                <div 
                                                                                    key={idx} 
                                                                                    className="fund-item-simple clickable"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        if (fund && typeof fund === 'object' && fund.cik) {
                                                                                            onSelectFund(fund.cik);
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    {typeof fund === 'string' ? fund : (fund.name || fund.issuer_name || 'Unknown Fund')}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="fund-item-simple">None</div>
                                                                    )}
                                                                </div>
                                                                <div className="tooltip-row selling">
                                                                    <strong>Selling:</strong>
                                                                    {(activity?.selling_funds || []).length > 0 ? (
                                                                        <div className="fund-list-simple">
                                                                            {(activity?.selling_funds || []).map((fund: any, idx) => (
                                                                                <div 
                                                                                    key={idx} 
                                                                                    className="fund-item-simple clickable"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        if (fund && typeof fund === 'object' && fund.cik) {
                                                                                            onSelectFund(fund.cik);
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    {typeof fund === 'string' ? fund : (fund.name || fund.issuer_name || 'Unknown Fund')}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="fund-item-simple">None</div>
                                                                    )}
                                                                </div>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </section>

                            {/* Crowding Signals */}
                            {crowding && (mostHeld.length > 0 || gainingFunds.length > 0) && (
                                <section 
                                    className="dashboard-section compact interactive-section"
                                    onClick={() => setActiveTab('consensus')}
                                >
                                    <div className="section-header">
                                        <Users className="section-icon-small" />
                                        <div>
                                            <h3 className="section-title-small">Crowding Signals</h3>
                                            <p className="section-desc-small">Stocks held by multiple funds</p>
                                        </div>
                                    </div>

                                    {mostHeld.length > 0 && (
                                        <div className="crowding-subsection">
                                            <div className="crowding-label">Most Widely Held</div>
                                            <div className="crowding-list">
                                                {mostHeld.slice(0, 3).map((item, i) => {
                                                    const itemTicker = item.ticker || item.issuer_name;
                                                    return (
                                                        <div key={i} className="crowding-item">
                                                            <span className="crowding-ticker" onClick={(e) => { e.stopPropagation(); setActiveTab('consensus'); setStockSearchQuery(normalizeTicker(itemTicker)); setSearchTickerOnly(true); }}>{itemTicker}</span>
                                                            <span
                                                                className="crowding-count has-tooltip"
                                                                onMouseEnter={(e) => handleCrowdingTooltipEnter(e, itemTicker, 'widely_held')}
                                                                onMouseLeave={handleCrowdingTooltipLeave}
                                                            >
                                                                {item.fund_count} funds
                                                                {crowdingTooltip && crowdingTooltip.ticker === itemTicker && crowdingTooltip.source === 'widely_held' && item.funds && item.funds.length > 0 && (
                                                                    <span
                                                                        className="tooltip-content visible"
                                                                        style={{ left: crowdingTooltip.x - 200, top: crowdingTooltip.y + 15, zIndex: 1000 }}
                                                                    >
                                                                        <div className="fund-list-simple">
                                                                            {item.funds.map((fund: any, idx: number) => (
                                                                                <div 
                                                                                    key={idx} 
                                                                                    className="fund-item-simple clickable"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        onSelectFund(fund.cik);
                                                                                    }}
                                                                                >
                                                                                    {typeof fund === 'string' ? fund : (fund.name || fund.issuer_name || 'Unknown Fund')}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}



                                    {gainingFunds.length > 0 && (
                                        <div className="crowding-subsection">
                                            <div className="crowding-label">↑ Fund Count</div>
                                            <div className="crowding-list">
                                                {gainingFunds.slice(0, 3).map((item, i) => (
                                                    <div key={i} className="crowding-item">
                                                        <span className="crowding-ticker" onClick={(e) => { e.stopPropagation(); setActiveTab('consensus'); setStockSearchQuery(normalizeTicker(item.ticker || item.issuer_name)); setSearchTickerOnly(true); }}>{item.ticker || item.issuer_name}</span>
                                                        <span 
                                                            className="crowding-change positive has-tooltip"
                                                            onMouseEnter={(e) => handleCrowdingTooltipEnter(e, item.ticker || item.issuer_name, 'gaining')}
                                                            onMouseLeave={handleCrowdingTooltipLeave}
                                                        >
                                                            +{item.change}
                                                            {crowdingTooltip && normalizeTicker(crowdingTooltip.ticker) === normalizeTicker(item.ticker || item.issuer_name) && crowdingTooltip.source === 'gaining' && (
                                                                <span
                                                                    className="tooltip-content visible"
                                                                    style={{ left: crowdingTooltip.x - 200, top: crowdingTooltip.y + 15, zIndex: 1000 }}
                                                                >
                                                                    {(() => {
                                                                        const tKey = normalizeTicker(item.ticker || item.issuer_name);
                                                                        // Robust lookup: find key that matches normalized tKey
                                                                        const actualKey = Object.keys(tickerActivity).find(k => normalizeTicker(k) === tKey);
                                                                        const activity = actualKey ? tickerActivity[actualKey] : null;
                                                                        
                                                                        // Fallback to buying_funds if new_buyers is empty but change is positive
                                                                        const displayFunds = activity?.new_buyers || [];
                                                                        
                                                                        return (
                                                                            <div className="fund-list-simple">
                                                                                {displayFunds.map((f: any, idx: number) => (
                                                                                    <div key={idx} className="fund-item-simple clickable" onClick={(e) => { e.stopPropagation(); onSelectFund(f.cik); }}>
                                                                                        {typeof f === 'string' ? f : (f.name || 'Unknown')}
                                                                                    </div>
                                                                                ))}
                                                                                {displayFunds.length === 0 && (
                                                                                    <div className="fund-item-simple" style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '11px' }}>
                                                                                        No new buyers this quarter
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {losingFunds.length > 0 && (
                                        <div className="crowding-subsection">
                                            <div className="crowding-label">↓ Fund Count</div>
                                            <div className="crowding-list">
                                                {losingFunds.slice(0, 3).map((item, i) => (
                                                    <div key={i} className="crowding-item">
                                                        <span className="crowding-ticker" onClick={(e) => { e.stopPropagation(); setActiveTab('consensus'); setStockSearchQuery(normalizeTicker(item.ticker || item.issuer_name)); setSearchTickerOnly(true); }}>{item.ticker || item.issuer_name}</span>
                                                        <span 
                                                            className="crowding-change negative has-tooltip"
                                                            onMouseEnter={(e) => handleCrowdingTooltipEnter(e, item.ticker || item.issuer_name, 'losing')}
                                                            onMouseLeave={handleCrowdingTooltipLeave}
                                                        >
                                                            {item.change}
                                                            {crowdingTooltip && normalizeTicker(crowdingTooltip.ticker) === normalizeTicker(item.ticker || item.issuer_name) && crowdingTooltip.source === 'losing' && (
                                                                <span
                                                                    className="tooltip-content visible"
                                                                    style={{ left: crowdingTooltip.x - 200, top: crowdingTooltip.y + 15, zIndex: 1000 }}
                                                                >
                                                                    {(() => {
                                                                        const tKey = normalizeTicker(item.ticker || item.issuer_name);
                                                                        // Robust lookup: find key that matches normalized tKey
                                                                        const actualKey = Object.keys(tickerActivity).find(k => normalizeTicker(k) === tKey);
                                                                        const activity = actualKey ? tickerActivity[actualKey] : null;
                                                                        
                                                                        // Fallback to selling_funds if exited_sellers is empty but change is negative
                                                                        const displayFunds = activity?.exited_sellers || [];
                                                                        
                                                                        return (
                                                                            <div className="fund-list-simple">
                                                                                {displayFunds.map((f: any, idx: number) => (
                                                                                    <div key={idx} className="fund-item-simple clickable" onClick={(e) => { e.stopPropagation(); onSelectFund(f.cik); }}>
                                                                                        {typeof f === 'string' ? f : (f.name || 'Unknown')}
                                                                                    </div>
                                                                                ))}
                                                                                {displayFunds.length === 0 && (
                                                                                    <div className="fund-item-simple" style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '11px' }}>
                                                                                        No full exits this quarter
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </section>
                            )}

                            {/* New Positions Spotlight */}
                            {newPositions.length > 0 && (
                                <section 
                                    className="dashboard-section compact interactive-section"
                                    onClick={() => setActiveTab('consensus')}
                                >
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
                                                    <span className="new-position-ticker" onClick={(e) => { e.stopPropagation(); setActiveTab('consensus'); setStockSearchQuery(normalizeTicker(pos.ticker || pos.issuer_name)); setSearchTickerOnly(true); }}>{pos.ticker || pos.issuer_name}</span>
                                                    <span 
                                                        className="new-position-fund"
                                                        onClick={(e) => { e.stopPropagation(); pos.cik && onSelectFund(pos.cik); }}
                                                        style={{ cursor: pos.cik ? 'pointer' : 'default', opacity: 0.8 }}
                                                    >
                                                        {pos.fund_name}
                                                    </span>
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
                                <section 
                                    className="dashboard-section compact interactive-section"
                                    onClick={() => setActiveTab('consensus')}
                                >
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
                                                    <span className="exited-position-ticker" onClick={(e) => { e.stopPropagation(); setActiveTab('consensus'); setStockSearchQuery(normalizeTicker(pos.ticker || pos.issuer_name)); setSearchTickerOnly(true); }}>{pos.ticker || pos.issuer_name}</span>
                                                    <span 
                                                        className="exited-position-fund"
                                                        onClick={(e) => { e.stopPropagation(); pos.cik && onSelectFund(pos.cik); }}
                                                        style={{ cursor: pos.cik ? 'pointer' : 'default', opacity: 0.8 }}
                                                    >
                                                        {pos.fund_name}
                                                    </span>
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

                            {/* Swoop Opportunities */}
                             <section 
                                 className="dashboard-section compact interactive-section"
                                 onClick={() => setActiveTab('consensus')}
                                 style={{ overflow: 'hidden' }}
                             >
                                <div className="section-header">
                                    <AlertCircle className="section-icon-small" style={{ color: '#eab308' }} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <h3 className="section-title-small">Swoop Opps</h3>
                                        <Info
                                            size={14}
                                            style={{ color: '#64748b', cursor: 'help' }}
                                            onMouseEnter={handleSwoopTooltipEnter}
                                            onMouseLeave={handleSwoopTooltipLeave}
                                        />
                                        {swoopTooltip && (
                                            <div className="kpi-tooltip" style={{
                                                left: swoopTooltip.x > window.innerWidth - 320 ? 'auto' : swoopTooltip.x + 15,
                                                right: swoopTooltip.x > window.innerWidth - 320 ? window.innerWidth - swoopTooltip.x + 15 : 'auto',
                                                top: swoopTooltip.y + 15,
                                                maxWidth: '280px',
                                                fontSize: '11px',
                                                color: '#cbd5e1',
                                                lineHeight: 1.5,
                                                zIndex: 1000
                                            }}>
                                                <div className="tooltip-title">Swoop Opportunities</div>
                                                <p>High-conviction positions (&gt;3% portfolio weight) where the implied share price has dropped &gt;10% quarter-over-quarter.</p>
                                                <p style={{ marginTop: '8px', color: '#94a3b8' }}>These represent potential buying opportunities where funds are holding through price weakness. Stock splits are filtered out using a price/share change heuristic.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <p className="section-desc-small" style={{ marginLeft: '28px', marginTop: '-4px' }}>Conviction (&gt;3%) share price dips</p>
                                <div className="swoop-list scrollable" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                                    {swoopOpportunities.length > 0 ? (
                                        swoopOpportunities.map((op, i) => (
                                            <div key={i} className="mover-item" style={{ borderLeft: '3px solid #eab308', paddingLeft: '12px', display: 'flex', justifyContent: 'space-between', paddingRight: '4px' }}>
                                                <div className="mover-info">
                                                    <div className="mover-ticker" style={{ fontWeight: 700, color: '#f1f5f9' }} onClick={(e) => { e.stopPropagation(); setActiveTab('consensus'); setStockSearchQuery(normalizeTicker(op.ticker || op.issuer_name)); setSearchTickerOnly(true); }}>{op.ticker || op.issuer_name}</div>
                                                    <div className="mover-fund" style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                                                        {op.fund_name}
                                                    </div>
                                                </div>
                                                <div className="mover-delta" style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'baseline' }}>
                                                        <span style={{ fontSize: '9px', color: '#64748b', marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Price</span>
                                                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>{op.dropPct.toFixed(1)}%</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'baseline', marginTop: '1px' }}>
                                                        <span style={{ fontSize: '9px', color: '#64748b', marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Weight</span>
                                                        <span style={{ fontSize: '11px', color: '#64748b' }}>{op.weight.toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ padding: '12px', color: '#64748b', fontSize: '13px', fontStyle: 'italic', textAlign: 'center' }}>
                                            No high conviction dips found this quarter.
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Sector Allocation */}
                            {sectorAllocation.length > 0 && (
                                <section className="dashboard-section compact">
                                    <div className="section-header">
                                        <PieChart className="section-icon-small" style={{ color: '#8b5cf6' }} />
                                        <div>
                                            <h3 className="section-title-small">Sector Allocation</h3>
                                            <p className="section-desc-small">Aggregated across all funds</p>
                                        </div>
                                    </div>
                                    <div className="sector-bars" style={{ padding: '8px 0' }}>
                                        {sectorAllocation.slice(0, 8).map((item, i) => (
                                            <div key={i} style={{ marginBottom: '6px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
                                                    <span style={{ color: '#94a3b8' }}>{item.sector}</span>
                                                    <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{item.weight.toFixed(1)}%</span>
                                                </div>
                                                <div style={{
                                                    background: '#1e293b',
                                                    borderRadius: '2px',
                                                    height: '6px',
                                                    overflow: 'hidden'
                                                }}>
                                                    <div style={{
                                                        width: `${Math.min(item.weight, 100)}%`,
                                                        height: '100%',
                                                        background: `hsl(${260 - i * 20}, 70%, 60%)`,
                                                        borderRadius: '2px'
                                                    }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                        </div>
                    </div>
                    {/* Group Management Modal */}
                        </>
                    ) : (
                        <div className="consensus-view" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div>
                            <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>Stock Consensus</h2>
                            <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>
                                Aggregated holdings across {selectedGroupId ? `"${groups.find(g => g.id === selectedGroupId)?.name}"` : 'all tracked funds'}
                            </p>
                        </div>
                        <div style={{ position: 'relative', width: '300px' }}>
                            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} size={18} />
                            <input
                                type="text"
                                placeholder="Search tickers or companies..."
                                value={stockSearchQuery}
                                onChange={(e) => { setStockSearchQuery(e.target.value); setSearchTickerOnly(false); }}
                                style={{
                                    width: '100%',
                                    padding: '12px 12px 12px 42px',
                                    background: 'rgba(15, 23, 42, 0.6)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    color: '#f8fafc',
                                    fontSize: '14px',
                                    outline: 'none',
                                    transition: 'all 0.2s'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#38bdf8'}
                                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                            />
                        </div>
                    </div>

                    {/* Insight Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                        {/* Crowd Favorite */}
                        <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.1)', borderRadius: '16px', padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '8px', borderRadius: '10px' }}>
                                    <Users size={20} style={{ color: '#38bdf8' }} />
                                </div>
                                <Sparkles size={16} style={{ color: '#38bdf8', opacity: 0.5 }} />
                            </div>
                            <h4 style={{ fontSize: '14px', color: '#94a3b8', margin: '0 0 4px 0' }}>Crowd Favorite</h4>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc' }}>
                                {summary.consensus_stocks?.[0]?.ticker || 'N/A'}
                            </div>
                            <p style={{ fontSize: '12px', color: '#38bdf8', marginTop: '4px' }}>
                                Held by {summary.consensus_stocks?.[0]?.fund_count || 0} funds
                            </p>
                        </div>

                        {/* Conviction Leader */}
                        <div style={{ background: 'rgba(167, 139, 250, 0.05)', border: '1px solid rgba(167, 139, 250, 0.1)', borderRadius: '16px', padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                <div style={{ background: 'rgba(167, 139, 250, 0.1)', padding: '8px', borderRadius: '10px' }}>
                                    <Target size={20} style={{ color: '#a78bfa' }} />
                                </div>
                                <Zap size={16} style={{ color: '#a78bfa', opacity: 0.5 }} />
                            </div>
                            <h4 style={{ fontSize: '14px', color: '#94a3b8', margin: '0 0 4px 0' }}>Highest Conviction</h4>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc' }}>
                                {(() => {
                                    const highestConviction = [...(summary.consensus_stocks || [])].sort((a, b) => (b.conviction_score || 0) - (a.conviction_score || 0))[0];
                                    return highestConviction?.ticker || 'N/A';
                                })()}
                            </div>
                            <p style={{ fontSize: '12px', color: '#a78bfa', marginTop: '4px' }}>
                                Score: {(() => {
                                    const highestConviction = [...(summary.consensus_stocks || [])].sort((a, b) => (b.conviction_score || 0) - (a.conviction_score || 0))[0];
                                    return highestConviction?.conviction_score || 0;
                                })()} / 100
                            </p>
                        </div>

                        {/* Top New Idea */}
                        <div style={{ background: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.1)', borderRadius: '16px', padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                <div style={{ background: 'rgba(52, 211, 153, 0.1)', padding: '8px', borderRadius: '10px' }}>
                                    <TrendingUp size={20} style={{ color: '#34d399' }} />
                                </div>
                                <Plus size={16} style={{ color: '#34d399', opacity: 0.5 }} />
                            </div>
                            <h4 style={{ fontSize: '14px', color: '#94a3b8', margin: '0 0 4px 0' }}>Rising Momentum</h4>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc' }}>
                                {(() => {
                                    const rising = [...(summary.consensus_stocks || [])].sort((a, b) => (b.change || 0) - (a.change || 0))[0];
                                    return rising?.ticker || 'N/A';
                                })()}
                            </div>
                            <p style={{ fontSize: '12px', color: '#34d399', marginTop: '4px' }}>
                                +{(() => {
                                    const rising = [...(summary.consensus_stocks || [])].sort((a, b) => (b.change || 0) - (a.change || 0))[0];
                                    return rising?.change || 0;
                                })()} new buyers
                            </p>
                        </div>
                    </div>

                    <div style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                                    <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ticker & Trend</th>
                                    <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Funds</th>
                                    <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Change</th>
                                    <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg. Allocation</th>
                                    <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conviction</th>
                                    <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Highest Weight</th>
                                    <th style={{ textAlign: 'right', padding: '16px 24px', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Value</th>
                                    <th style={{ textAlign: 'right', padding: '16px 24px', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const filtered = (summary.consensus_stocks || [])
                                        .filter(s => {
                                            const query = stockSearchQuery.toLowerCase();
                                            if (!query) return true;
                                            
                                            const ticker = (s.ticker || '').toLowerCase();
                                            const name = (s.issuer_name || '').toLowerCase();
                                            
                                            if (searchTickerOnly) {
                                                return ticker === query;
                                            }
                                            
                                            const tickerMatch = ticker.includes(query);
                                            const nameMatch = name.startsWith(query) || name.includes(' ' + query);
                                            
                                            return tickerMatch || nameMatch;
                                        });
                                    
                                    if (filtered.length === 0) {
                                        return (
                                            <tr>
                                                <td colSpan={8} style={{ padding: '60px 24px', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', opacity: 0.5 }}>
                                                        <Search size={40} style={{ color: '#38bdf8' }} />
                                                        <p style={{ fontSize: '16px', fontWeight: 500, color: '#f8fafc' }}>
                                                            {loading ? 'Refreshing consensus data...' : 'No consensus data found.'}
                                                        </p>
                                                        {!loading && <p style={{ fontSize: '14px', color: '#94a3b8' }}>Try syncing more funds or checking your filters.</p>}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return filtered.map((stock, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'all 0.2s' }} className="consensus-row">
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ position: 'relative' }}>
                                                    <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#38bdf8', fontSize: '12px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                                                        {stock.ticker?.slice(0, 4) || 'N/A'}
                                                    </div>
                                                    {(stock.change || 0) !== 0 && (
                                                        <div style={{ 
                                                            position: 'absolute', 
                                                            bottom: '-4px', 
                                                            right: '-4px', 
                                                            background: (stock.change ?? 0) > 0 ? '#065f46' : '#7f1d1d',
                                                            color: (stock.change ?? 0) > 0 ? '#34d399' : '#f87171',
                                                            padding: '2px 4px',
                                                            borderRadius: '4px',
                                                            fontSize: '10px',
                                                            fontWeight: 800,
                                                            border: '1px solid rgba(255,255,255,0.1)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '2px'
                                                        }}>
                                                            { (stock.change ?? 0) > 0 ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
                                                            {Math.abs(stock.change ?? 0)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '15px' }}>{stock.ticker || 'N/A'}</div>
                                                    <div style={{ color: '#64748b', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{stock.issuer_name}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '15px' }}>{stock.fund_count}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>filers</div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ 
                                                color: (stock.net_shares_change || 0) > 0 ? '#34d399' : (stock.net_shares_change || 0) < 0 ? '#f87171' : '#94a3b8', 
                                                fontWeight: 700, 
                                                fontSize: '15px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}>
                                                {(stock.net_shares_change || 0) > 0 ? '+' : ''}
                                                {formatNumber(stock.net_shares_change || 0)}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>shares</div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                                <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: '16px' }}>{stock.avg_weight?.toFixed(1)}%</span>
                                                <span style={{ color: '#64748b', fontSize: '11px' }}>avg</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                                <span style={{ color: '#38bdf8', fontWeight: 900, fontSize: '16px' }}>{stock.max_weight?.toFixed(1)}%</span>
                                                <span style={{ color: '#0284c7', fontSize: '11px', fontWeight: 700 }}>max</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ background: 'rgba(167, 139, 250, 0.1)', padding: '4px', borderRadius: '6px' }}>
                                                    <Award size={12} style={{ color: '#a78bfa' }} />
                                                </div>
                                                <span style={{ color: '#f8fafc', fontSize: '13px', fontWeight: 500 }}>{stock.top_holder || 'N/A'}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right', color: '#f8fafc', fontWeight: 600 }}>
                                            {formatCurrency(stock.total_value)}
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                            <button 
                                                onClick={() => fetchStockHolders(stock.ticker || '')}
                                                style={{ 
                                                    background: 'rgba(56, 189, 248, 0.1)', 
                                                    border: '1px solid rgba(56, 189, 248, 0.2)', 
                                                    color: '#38bdf8', 
                                                    padding: '6px 12px', 
                                                    borderRadius: '8px', 
                                                    fontSize: '12px', 
                                                    fontWeight: 600, 
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}
                                                onMouseOver={(e) => {
                                                    e.currentTarget.style.background = 'rgba(56, 189, 248, 0.2)';
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                }}
                                                onMouseOut={(e) => {
                                                    e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                }}
                                            >
                                                <Users size={14} />
                                                Holders
                                            </button>
                                        </td>
                                    </tr>
                                    ));
                                })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </>
        )}

        {isGroupModalOpen && (
            <div className="modal-overlay" onClick={() => setIsGroupModalOpen(false)}>
                <div className="modal-content group-modal" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                        <div>
                            <h2>Manage Fund Groups</h2>
                            <p>Group funds into folders for aggregated analysis</p>
                        </div>
                        <button className="close-btn" onClick={() => setIsGroupModalOpen(false)}>&times;</button>
                    </div>

                    <div className="modal-body">
                        <div className="create-group-section">
                            <input
                                type="text"
                                placeholder="New group name..."
                                value={newGroupName}
                                onChange={e => setNewGroupName(e.target.value)}
                                onKeyPress={e => e.key === 'Enter' && handleCreateGroup()}
                            />
                            <button className="add-group-btn" onClick={handleCreateGroup}>
                                <PlusCircle size={18} />
                                <span>Create Group</span>
                            </button>
                        </div>

                        <div className="groups-list">
                            {groups.map(group => (
                                <div key={group.id} className="group-item-config">
                                    <div className="group-header-row">
                                        <div className="group-title-info">
                                            <Folder size={18} color="#38bdf8" />
                                            <h3>{group.name}</h3>
                                            <span className="member-count">{group.member_ciks.length} funds</span>
                                        </div>
                                        <button className="delete-group-icon" onClick={() => handleDeleteGroup(group.id)}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div className="group-member-grid">
                                        {allFunds.map(fund => {
                                            const isMember = group.member_ciks.includes(fund.cik);
                                            return (
                                                <div
                                                    key={fund.cik}
                                                    className={`fund-chip ${isMember ? 'active' : ''}`}
                                                    onClick={() => toggleGroupMember(group.id, fund.cik, isMember)}
                                                >
                                                    <span className="chip-name">{fund.name}</span>
                                                    {isMember ? <MinusCircle size={12} /> : <PlusCircle size={12} />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}
            <InstitutionalHoldersModal
                ticker={selectedTicker}
                holders={holders}
                loading={loadingHolders}
                onClose={() => setSelectedTicker(null)}
                onAnalyze={(cik) => {
                    onSelectFund(cik);
                    setSelectedTicker(null);
                }}
            />
        </div>
    );
};
