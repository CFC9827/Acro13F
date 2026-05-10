import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { TrendingUp, Activity, Info, RefreshCw, BarChart3, AlertCircle, ChevronLeft, ChevronRight, ChevronDown, Layers, Calendar, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { formatCurrency } from './PortfolioChart';
import { fetchWithAuth } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

interface MimicDataPoint {
    date: string;
    period: string;
    return: number;
    label: string;
    benchmark_return: number;
    portfolio_value?: number;
    holdings?: Record<string, number>;
    holdings_detailed?: Array<{
        ticker: string;
        shares: number;
        price: number;
        value: number;
    }>;
    simulated_value?: number;
    total_invested?: number;
}

interface MimicTrade {
    date: string;
    period: string;
    ticker: string;
    action: 'Buy' | 'Sell' | 'Add' | 'Reduce' | 'Initial Buy' | 'Initial Setup';
    shares_change: number;
    price: number;
    value: number;
    user_shares?: number;
    user_value?: number;
    isContext?: boolean;
    isCapitalDeployment?: boolean;
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
}

const timeRanges = ['2Q', 'YTD', '1Y', '3Y', '5Y', '10Y', 'MAX', 'CUSTOM'];

export const MimicPerformanceChart: React.FC<MimicPerformanceChartProps> = ({ cik }) => {
    const [data, setData] = useState<MimicDataPoint[]>([]);
    const [trades, setTrades] = useState<MimicTrade[]>([]);
    const [loading, setLoading] = useState(false);
    const { session } = useAuth();
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

    // Simulator Mode State
    const [isSimulatorMode, setIsSimulatorMode] = useState(false);
    const [initialInvestment, setInitialInvestment] = useState(10000);
    const [recurringContribution, setRecurringContribution] = useState(0);
    const [isMethodologyOpen, setIsMethodologyOpen] = useState(false);
    const [isTrackerInfoOpen, setIsTrackerInfoOpen] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetchWithAuth(`/api/funds/${cik}/mimic-performance`, {}, session);
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

        // Compute simulated values with contributions
        let simBalance = initialInvestment;
        let totalInvested = initialInvestment;

        return filtered.map((d, idx) => {
            const rebasedReturn = (((1 + d.return / 100) / baseVal) - 1) * 100;
            const rebasedBench = (((1 + d.benchmark_return / 100) / baseBench) - 1) * 100;

            if (idx === 0) {
                simBalance = initialInvestment;
                totalInvested = initialInvestment;
            } else {
                // Add recurring contribution at start of each period
                simBalance += recurringContribution;
                totalInvested += recurringContribution;

                // Apply period return
                const prevPoint = filtered[idx - 1];
                const prevBaseVal = 1 + (prevPoint.return / 100);
                const currBaseVal = 1 + (d.return / 100);
                const periodReturn = prevBaseVal > 0 ? (currBaseVal / prevBaseVal) - 1 : 0;
                simBalance = simBalance * (1 + periodReturn);
            }

            return {
                ...d,
                return: rebasedReturn,
                benchmark_return: rebasedBench,
                simulated_value: simBalance,
                total_invested: totalInvested
            };
        });

    }, [data, timeRange, offset, customStartQuarter, customEndQuarter, initialInvestment, recurringContribution]);


    const stats = useMemo(() => {
        if (filteredData.length === 0) return { totalReturn: 0, benchmarkTotal: 0, outperformance: 0, simValue: 0, simInvested: 0, simProfit: 0, simRoi: 0 };
        const last = filteredData[filteredData.length - 1];
        const simValue = last.simulated_value || 0;
        const simInvested = last.total_invested || initialInvestment;
        const simProfit = simValue - simInvested;
        const simRoi = simInvested > 0 ? (simProfit / simInvested) * 100 : 0;
        return {
            totalReturn: last.return,
            benchmarkTotal: last.benchmark_return,
            outperformance: last.return - last.benchmark_return,
            simValue,
            simInvested,
            simProfit,
            simRoi
        };
    }, [filteredData, initialInvestment]);

    // Group trades by period with smart filtering
    const tradesByPeriod = useMemo(() => {
        const groups = new Map<string, MimicTrade[]>();

        if (!isSimulatorMode) {
            // Non-simulator mode: show all trades, just grouped by period
            const tempGroups = new Map<string, MimicTrade[]>();
            for (const trade of trades) {
                if (!tempGroups.has(trade.period)) {
                    tempGroups.set(trade.period, []);
                }
                tempGroups.get(trade.period)!.push(trade);
            }
            // Sort within groups by value
            for (const [, items] of tempGroups) {
                items.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
            }
            return tempGroups;
        }

        // Simulator mode: filter by date range and track user holdings
        const startDate = filteredData.length > 0 ? filteredData[0].date : null;
        const endDate = filteredData.length > 0 ? filteredData[filteredData.length - 1].date : null;

        if (!startDate || !endDate) return groups;

        const currentVisibleTrades = trades.filter(trade =>
            trade.date >= startDate && trade.date <= endDate
        );

        const allInjectedTrades: MimicTrade[] = [];
        const userHoldings = new Map<string, number>();

        // We generate trades by comparing the "Target State" of each period
        // This ensures tracking error is minimized and new capital is fully deployed.

        let prevPeriodShares = new Map<string, number>();

        filteredData.forEach((d, idx) => {
            const isInitial = idx === 0;
            const periodKey = isInitial ? 'INITIAL_SETUP' : d.period;

            // 1. Calculate the Ratio for this period's target state
            const fundVal = d.portfolio_value || 0;
            const userVal = d.simulated_value || 0;
            const ratio = (fundVal > 0 && userVal > 0) ? (userVal / fundVal) : 0;

            if (ratio === 0) return;

            // 2. Determine target shares for every ticker the fund holds
            const targetSharesMap = new Map<string, number>();
            if (d.holdings_detailed) {
                d.holdings_detailed.forEach(h => {
                    targetSharesMap.set(h.ticker, h.shares * ratio);
                });
            }

            // 3. Generate trades to reach target from previous state
            const allTickers = new Set([...Array.from(prevPeriodShares.keys()), ...Array.from(targetSharesMap.keys())]);

            for (const ticker of allTickers) {
                const oldShares = prevPeriodShares.get(ticker) || 0;
                const targetShares = targetSharesMap.get(ticker) || 0;

                if (Math.abs(targetShares - oldShares) < 0.0001) continue;

                const fundHolding = d.holdings_detailed?.find(h => h.ticker === ticker);
                const fundPrice = fundHolding?.price || 0;

                let action: any = "Buy";
                if (isInitial) action = "Initial Buy";
                else if (targetShares === 0) action = "Sell";
                else if (oldShares === 0) action = "Buy";
                else if (targetShares > oldShares) action = "Add";
                else action = "Reduce";

                // Heuristic: Is this a fund move or just a capital deployment?
                // We check the raw fund trades in this period to see if the fund also moved.
                const fundTrade = trades.find(t => t.date === d.date && t.ticker === ticker);
                const isCapitalOnly = !fundTrade && !isInitial;

                allInjectedTrades.push({
                    date: d.date,
                    period: periodKey,
                    ticker: ticker,
                    action: action,
                    shares_change: fundTrade?.shares_change || 0,
                    price: fundPrice || (fundTrade?.price) || 0,
                    value: fundTrade?.value || 0,
                    user_shares: targetShares - oldShares,
                    user_value: (targetShares - oldShares) * (fundPrice || fundTrade?.price || 0),
                    isContext: false,
                    isCapitalDeployment: isCapitalOnly
                });
            }

            // 4. Update state for next period
            prevPeriodShares = targetSharesMap;
        });

        // Add historical context trades (dimmed) that were NOT part of our executable state
        // (Those where the fund traded but we didn't hold or care about)
        const activeTradeKeys = new Set(allInjectedTrades.map(t => `${t.date}-${t.ticker}`));

        for (const trade of currentVisibleTrades) {
            if (!activeTradeKeys.has(`${trade.date}-${trade.ticker}`)) {
                allInjectedTrades.push({
                    ...trade,
                    isContext: true
                });
            }
        }

        // Group by period
        for (const trade of allInjectedTrades) {
            let periodKey = trade.period;
            if (startDate && trade.date.substring(0, 10) === startDate.substring(0, 10)) {
                periodKey = 'INITIAL_SETUP';
            }

            if (!groups.has(periodKey)) {
                groups.set(periodKey, []);
            }
            groups.get(periodKey)!.push(trade);
        }

        // Sort within groups
        for (const [period, items] of groups) {
            items.sort((a, b) => {
                if (period === 'INITIAL_SETUP') {
                    // Setup buys first
                    const aIsSetup = a.action === 'Initial Buy';
                    const bIsSetup = b.action === 'Initial Buy';
                    if (aIsSetup && !bIsSetup) return -1;
                    if (!aIsSetup && bIsSetup) return 1;
                }
                // Sort by context (highlighted first) then value
                if (a.isContext !== b.isContext) return a.isContext ? 1 : -1;
                return Math.abs(b.value) - Math.abs(a.value);
            });
        }

        return groups;
    }, [trades, isSimulatorMode, filteredData]);

    // Track user's available cash over time to enforce execution boundaries
    const userCashSeries = useMemo(() => {
        if (!isSimulatorMode || filteredData.length === 0) return new Map<string, number>();

        const cashMap = new Map<string, number>();
        let currentCash = initialInvestment;

        // Group trades chronologically
        const sortedPeriodKeys = Array.from(tradesByPeriod.keys()).sort((a, b) => {
            if (a === 'INITIAL_SETUP') return -1;
            if (b === 'INITIAL_SETUP') return 1;
            const aTrade = tradesByPeriod.get(a)?.[0];
            const bTrade = tradesByPeriod.get(b)?.[0];
            return (aTrade?.date || '').localeCompare(bTrade?.date || '');
        });

        for (const periodKey of sortedPeriodKeys) {
            const items = tradesByPeriod.get(periodKey) || [];
            if (items.length === 0) continue;

            const date = items[0].date;

            // 1. Add quarterly contribution (if not initial setup)
            if (periodKey !== 'INITIAL_SETUP') {
                currentCash += recurringContribution;
            }

            // 2. Calculate fund-to-user ratio for this period
            const fundDataPoint = data.find(d => d.date === date);
            const userDataPoint = filteredData.find(d => d.date === date);
            let ratio = 0;

            if (periodKey === 'INITIAL_SETUP') {
                const totalSetupValueInFund = items
                    .filter(it => it.action === 'Initial Buy')
                    .reduce((sum, it) => sum + Math.abs(it.value), 0);
                ratio = totalSetupValueInFund > 0 ? initialInvestment / totalSetupValueInFund : 0;
            } else if (fundDataPoint?.portfolio_value && userDataPoint?.simulated_value) {
                ratio = userDataPoint.simulated_value / fundDataPoint.portfolio_value;
            } else {
                ratio = initialInvestment / 10000000000; // Global fallback
            }

            // 3. Process Sells first (increases cash)
            const activeSells = items.filter(it => !it.isContext && (it.action === 'Sell' || it.action === 'Reduce'));
            for (const sell of activeSells) {
                currentCash += Math.abs(sell.value) * ratio;
            }

            // 4. Process Buys (decreases cash, but capped)
            const activeBuys = items.filter(it => !it.isContext && (it.action === 'Buy' || it.action === 'Add' || it.action === 'Initial Buy'));
            for (const buy of activeBuys) {
                const requestedVal = Math.abs(buy.value) * ratio;
                const actualSpend = Math.min(requestedVal, currentCash);
                currentCash -= actualSpend;
            }

            cashMap.set(date, currentCash);
        }

        return cashMap;
    }, [tradesByPeriod, initialInvestment, recurringContribution, filteredData, data, isSimulatorMode]);

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
            {/* Simulator Mode Toggle - Prominent */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                marginBottom: '20px',
                background: isSimulatorMode ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(37, 99, 235, 0.1))' : '#1e293b',
                borderRadius: '12px',
                border: isSimulatorMode ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid #334155'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={() => setIsSimulatorMode(!isSimulatorMode)}
                        style={{
                            width: '52px',
                            height: '28px',
                            borderRadius: '14px',
                            border: 'none',
                            background: isSimulatorMode ? '#3b82f6' : '#475569',
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'background 0.2s ease'
                        }}
                    >
                        <div style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: 'white',
                            position: 'absolute',
                            top: '3px',
                            left: isSimulatorMode ? '27px' : '3px',
                            transition: 'left 0.2s ease',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }} />
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ fontWeight: 600, fontSize: '15px', color: isSimulatorMode ? '#3b82f6' : '#f8fafc' }}>
                                Investment Simulator
                            </div>
                            {isSimulatorMode && (
                                <button
                                    onClick={() => setIsMethodologyOpen(true)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: '#64748b',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: 0
                                    }}
                                    title="How does this work?"
                                >
                                    <Info size={16} />
                                </button>
                            )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                            {isSimulatorMode ? 'Showing your personalized dollar amounts' : 'Toggle to see what YOUR investment would be worth'}
                        </div>
                    </div>
                </div>

                {isSimulatorMode && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Starting Capital:</span>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>$</span>
                                <input
                                    type="number"
                                    value={initialInvestment}
                                    onChange={(e) => setInitialInvestment(Number(e.target.value) || 0)}
                                    style={{
                                        width: '100px',
                                        padding: '8px 10px 8px 22px',
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        background: '#0f172a',
                                        border: '2px solid #3b82f6',
                                        borderRadius: '8px',
                                        color: '#f8fafc',
                                        textAlign: 'right'
                                    }}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Quarterly Addition:</span>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>$</span>
                                <input
                                    type="number"
                                    value={recurringContribution}
                                    onChange={(e) => setRecurringContribution(Number(e.target.value) || 0)}
                                    style={{
                                        width: '80px',
                                        padding: '8px 10px 8px 22px',
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        borderRadius: '8px',
                                        color: '#f8fafc',
                                        textAlign: 'right'
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Summary Cards - Conditional based on simulator mode */}
            <div className="performance-summary-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '30px' }}>
                {isSimulatorMode ? (
                    <>
                        <div className="summary-card">
                            <div className="summary-label">Total Invested</div>
                            <div className="summary-value" style={{ color: '#94a3b8' }}>
                                {formatCurrency(stats.simInvested)}
                            </div>
                            <div className="summary-subtext">
                                {recurringContribution > 0
                                    ? `$${initialInvestment.toLocaleString()} + quarterly`
                                    : 'Your starting capital'}
                            </div>
                        </div>

                        <div className="summary-card">
                            <div className="summary-label">Current Value</div>
                            <div className={`summary-value ${stats.simProfit >= 0 ? 'positive' : 'negative'}`}>
                                {formatCurrency(stats.simValue)}
                            </div>
                            <div className="summary-subtext" style={{ color: stats.simRoi >= 0 ? '#10b981' : '#ef4444' }}>
                                {stats.simRoi >= 0 ? '+' : ''}{stats.simRoi.toFixed(1)}% ROI
                            </div>
                        </div>

                        <div className="summary-card">
                            <div className="summary-label">Net Profit</div>
                            <div className={`summary-value ${stats.simProfit >= 0 ? 'positive' : 'negative'}`}>
                                {stats.simProfit >= 0 ? '+' : ''}{formatCurrency(stats.simProfit)}
                            </div>
                            <div className="summary-subtext">After following this fund</div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="summary-card">
                            <div className="summary-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                Mimic Portfolio Return ({timeRange})
                                <span style={{ fontSize: '9px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '2px 6px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>TOTAL RETURN</span>
                            </div>
                            <div className={`summary-value ${stats.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                                {stats.totalReturn >= 0 ? '+' : ''}{stats.totalReturn.toFixed(2)}%
                            </div>
                            <div className="summary-subtext">Price appreciation + dividends</div>
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
                    </>
                )}
            </div>

            <div className="chart-panel-v2" style={{ height: '550px', position: 'relative', marginBottom: '32px' }}>
                <div className="chart-header-v2" style={{ justifyContent: 'space-between' }}>
                    <div className="chart-title-v2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Mimic Portfolio Tracker
                        <button
                            onClick={() => setIsTrackerInfoOpen(true)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#94a3b8',
                                display: 'flex',
                                alignItems: 'center',
                                padding: 0
                            }}
                            title="How does this work?"
                        >
                            <Info size={16} />
                        </button>
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
                                tickFormatter={(val) => isSimulatorMode
                                    ? `$${(val / 1000).toFixed(0)}K`
                                    : `${val > 0 ? '+' : ''}${val.toFixed(0)}%`}
                                tick={{ fontSize: 12, fill: '#94a3b8' }}
                                axisLine={false}
                                tickLine={false}
                                domain={isSimulatorMode ? ['auto', 'auto'] : undefined}
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
                                                    <span style={{ color: '#3b82f6', fontSize: '12px' }}>
                                                        {isSimulatorMode ? 'Portfolio Value:' : 'Mimic Return:'}
                                                    </span>
                                                    <span style={{ fontWeight: 600, color: isSimulatorMode ? '#f8fafc' : (item.return >= 0 ? '#10b981' : '#ef4444') }}>
                                                        {isSimulatorMode
                                                            ? formatCurrency(item.simulated_value || 0)
                                                            : `${item.return >= 0 ? '+' : ''}${item.return.toFixed(2)}%`}
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
                                name={isSimulatorMode ? "Portfolio Value" : "Mimic Portfolio"}
                                type="monotone"
                                dataKey={isSimulatorMode ? "simulated_value" : "return"}
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
                <div className="activity-header" style={{ marginBottom: '16px' }}>
                    <div>
                        <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', marginBottom: '4px' }}>
                            {isSimulatorMode ? "Simulation Instructions" : "Trade Log"}
                        </h3>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                            {isSimulatorMode
                                ? "Execute these trades to replicate the fund's moves"
                                : "Major portfolio changes executing on filing dates"}
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
                            <thead style={{ position: 'sticky', top: 0, zIndex: 30 }}>
                                <tr>
                                    <th style={{ background: '#0f172a', paddingLeft: '16px', borderBottom: '1px solid #334155' }}>Ticker</th>
                                    <th style={{ background: '#0f172a', borderBottom: '1px solid #334155' }}>Action</th>
                                    <th style={{ textAlign: 'right', background: '#0f172a', borderBottom: '1px solid #334155' }}>Fund Shares</th>
                                    <th style={{ textAlign: 'right', background: '#0f172a', borderBottom: '1px solid #334155' }}>Price</th>
                                    {isSimulatorMode ? (
                                        <th style={{ textAlign: 'right', background: '#0f172a', paddingRight: '16px', color: '#10b981', borderBottom: '1px solid #334155' }}>Your Action</th>
                                    ) : (
                                        <th style={{ textAlign: 'right', background: '#0f172a', paddingRight: '16px', borderBottom: '1px solid #334155' }}>Value</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from(tradesByPeriod.entries())
                                    .sort((a, b) => {
                                        if (a[0] === 'INITIAL_SETUP') return 1;
                                        if (b[0] === 'INITIAL_SETUP') return -1;
                                        return b[1][0]?.date.localeCompare(a[1][0]?.date) || 0;
                                    })
                                    .map(([period, items]) => {
                                        const isInitialSetup = period === 'INITIAL_SETUP';

                                        // Calculate proportional ratio for this period
                                        const fundDataPoint0 = data.find(d => d.date === items[0].date);
                                        const userDataPoint0 = filteredData.find(d => d.date === items[0].date);
                                        let ratio0 = 0;

                                        if (isInitialSetup) {
                                            // FORCE Step 1 to sum to exactly initialInvestment
                                            const totalSetupValueInFund = items
                                                .filter(it => it.action === 'Initial Buy')
                                                .reduce((sum, it) => sum + Math.abs(it.value), 0);
                                            ratio0 = totalSetupValueInFund > 0 ? initialInvestment / totalSetupValueInFund : 0;
                                        } else if (fundDataPoint0?.portfolio_value && userDataPoint0?.simulated_value) {
                                            ratio0 = userDataPoint0.simulated_value / fundDataPoint0.portfolio_value;
                                        } else if (isSimulatorMode) {
                                            ratio0 = initialInvestment / 10000000000;
                                        }

                                        // PRE-CALCULATE CAPPED VALUES FOR THIS PERIOD
                                        const sortedDates = Array.from(userCashSeries.keys()).sort();
                                        const currentIdx = sortedDates.indexOf(items[0].date);

                                        let runningCash = 0;
                                        if (isInitialSetup) {
                                            // Initial Setup starts with the full initial investment
                                            runningCash = initialInvestment;
                                        } else if (currentIdx > 0) {
                                            // Subsequent periods start with previous period's ENDING cash balance
                                            runningCash = userCashSeries.get(sortedDates[currentIdx - 1]) ?? 0;
                                        } else if (currentIdx === 0) {
                                            // First tracked period after Initial Setup - should have minimal carryover
                                            // Look for Initial Setup ending balance, default to 0
                                            runningCash = 0;
                                        }
                                        // Else: period not found in series, start with 0

                                        // Track carryover BEFORE adding quarterly (for display)
                                        const carryoverCash = runningCash;

                                        if (!isInitialSetup) runningCash += recurringContribution;

                                        // Capture cash before sells (quarterly + carryover)
                                        const cashBeforeSells = runningCash;

                                        const cappedTrades = new Map<string, { val: number, capped: boolean }>();

                                        // 1. Sells first
                                        items.filter(it => !it.isContext && (it.action === 'Sell' || it.action === 'Reduce'))
                                            .forEach(it => {
                                                const val = Math.abs(it.value) * ratio0;
                                                runningCash += val;
                                                cappedTrades.set(`${it.ticker}-${it.action}-${it.shares_change}`, { val, capped: false });
                                            });

                                        // 2. Buys capped
                                        items.filter(it => !it.isContext && (it.action === 'Buy' || it.action === 'Add' || it.action === 'Initial Buy'))
                                            .forEach(it => {
                                                const requestedVal = Math.abs(it.value) * ratio0;
                                                const actualVal = Math.min(requestedVal, runningCash);
                                                const isCapped = actualVal < requestedVal && requestedVal > 0.01;
                                                runningCash -= actualVal;
                                                cappedTrades.set(`${it.ticker}-${it.action}-${it.shares_change}`, { val: actualVal, capped: isCapped });
                                            });

                                        const highlightedItems = items.filter(trade =>
                                            !isSimulatorMode || !trade.isContext
                                        );

                                        const buyItems = highlightedItems.filter(it => it.action === 'Buy' || it.action === 'Add' || it.action === 'Initial Buy' || it.action === 'Initial Setup');
                                        const sellItems = highlightedItems.filter(it => it.action === 'Sell' || it.action === 'Reduce');

                                        const buyCount = buyItems.length;
                                        const sellCount = sellItems.length;

                                        let totalBuyVal = 0;
                                        let totalSellVal = 0;

                                        highlightedItems.forEach(trade => {
                                            const cappedEntry = cappedTrades.get(`${trade.ticker}-${trade.action}-${trade.shares_change}`);

                                            if (isSimulatorMode) {
                                                // In simulator mode: buys use capped values, sells use calculated values
                                                const isBuyType = trade.action === 'Buy' || trade.action === 'Add' || trade.action === 'Initial Buy' || trade.action === 'Initial Setup';
                                                if (isBuyType) {
                                                    // ALWAYS use capped value if available, otherwise the trade wasn't processed (context)
                                                    totalBuyVal += cappedEntry ? cappedEntry.val : 0;
                                                } else {
                                                    // Sells just add their proportional value
                                                    totalSellVal += cappedEntry ? cappedEntry.val : Math.abs(trade.value) * ratio0;
                                                }
                                            } else {
                                                // In non-simulator mode, use actual fund values
                                                const isBuyType = trade.action === 'Buy' || trade.action === 'Add' || trade.action === 'Initial Buy' || trade.action === 'Initial Setup';
                                                const val = Math.abs(trade.value);
                                                if (isBuyType) totalBuyVal += val;
                                                else totalSellVal += val;
                                            }
                                        });

                                        return (
                                            <React.Fragment key={period}>
                                                <tr className="activity-period-header">
                                                    <td colSpan={5} style={{
                                                        color: '#e2e8f0',
                                                        background: '#1e293b',
                                                        borderBottom: '1px solid #334155',
                                                        padding: '12px 16px',
                                                        position: 'sticky',
                                                        top: 0,
                                                        zIndex: 20
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', letterSpacing: '0.025em' }}>
                                                                {isInitialSetup ? (
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <Layers size={14} style={{ color: '#3b82f6' }} />
                                                                        Step 1: Initial Portfolio Setup ({items[0].originalPeriod || items[0].period})
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <Calendar size={14} style={{ color: '#94a3b8' }} />
                                                                        Activity: {dateToLabelMap.get(items[0].date) || items[0].period}
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', fontWeight: 500, color: '#94a3b8', flexWrap: 'wrap' }}>
                                                                {isSimulatorMode && (
                                                                    <span style={{ color: '#64748b' }}>
                                                                        {isInitialSetup
                                                                            ? <>Funded by: <span style={{ color: '#10b981' }}>{formatCurrency(initialInvestment)} Initial</span></>
                                                                            : <>Funded by:
                                                                                {recurringContribution > 0 && <><span style={{ color: '#60a5fa' }}>{formatCurrency(recurringContribution)} Quarterly</span> + </>}
                                                                                {carryoverCash > 0.01 && <><span style={{ color: '#a78bfa' }}>{formatCurrency(carryoverCash)} Carryover</span> + </>}
                                                                                <span style={{ color: '#f87171' }}>{formatCurrency(totalSellVal)} Sales</span>
                                                                            </>
                                                                        }
                                                                    </span>
                                                                )}
                                                                <span><span style={{ color: '#10b981' }}>{buyCount}</span> Buys ({formatCurrency(totalBuyVal)})</span>
                                                                <span><span style={{ color: '#ef4444' }}>{sellCount}</span> Sells ({formatCurrency(totalSellVal)})</span>
                                                                {isSimulatorMode && !isInitialSetup && runningCash > 0.01 && (
                                                                    <span style={{ color: '#a78bfa' }}>→ {formatCurrency(runningCash)} Leftover</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {period === 'INITIAL_SETUP' && (
                                                    <tr style={{ background: '#0f172a' }}>
                                                        <td colSpan={5} style={{ padding: '8px 16px', fontSize: '11px', color: '#64748b', borderBottom: '1px solid #1e293b' }}>
                                                            <Info size={12} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle', marginBottom: '2px' }} />
                                                            Initial buys establish your starting portfolio. Dimmed rows show the fund's internal trades during that quarter for context.
                                                        </td>
                                                    </tr>
                                                )}
                                                {items.map((trade, idx) => {
                                                    const isStartDate = trade.date.substring(0, 10) === filteredData[0]?.date.substring(0, 10);

                                                    // Dimmed logic
                                                    let isDimmed = false;
                                                    if (isSimulatorMode) {
                                                        // 1. Context rows are ALWAYS dimmed
                                                        isDimmed = !!trade.isContext;

                                                        // 2. Active rows are dimmed ONLY if they are insignificant (< $1)
                                                        if (!isDimmed && !isInitialSetup) {
                                                            const val = Math.abs(trade.user_value ?? (trade.value * ratio0));
                                                            if (val < 1.00) isDimmed = true;
                                                        }
                                                    }

                                                    const isHighlighted = isSimulatorMode && !isDimmed;
                                                    const isBuyAction = trade.action === 'Buy' || trade.action === 'Add' || trade.action === 'Initial Buy' || trade.action === 'Initial Setup';

                                                    // Hide redundant historical context rows for the same ticker
                                                    // if we already have an "Initial Buy" task for it in this period.
                                                    if (isDimmed) {
                                                        const hasActiveTask = items.some(it =>
                                                            it.ticker === trade.ticker &&
                                                            (it.action === 'Initial Buy' || it.action === 'Initial Setup')
                                                        );
                                                        if (hasActiveTask) return null;
                                                    }

                                                    // Show separator before first dimmed item
                                                    const showSeparator = idx > 0 && isDimmed && !(isSimulatorMode &&
                                                        items[idx - 1].date.substring(0, 10) === filteredData[0]?.date.substring(0, 10) &&
                                                        items[idx - 1].period !== 'INITIAL_SETUP');

                                                    // Proportional values
                                                    const cappedInfo = cappedTrades.get(`${trade.ticker}-${trade.action}-${trade.shares_change}`);
                                                    const userDollarAmount = isSimulatorMode
                                                        ? (cappedInfo ? cappedInfo.val : Math.abs(trade.user_value ?? (trade.value * ratio0)))
                                                        : 0;
                                                    const userShareCount = isSimulatorMode
                                                        ? (trade.user_shares ?? (trade.price > 0 ? userDollarAmount / trade.price : 0))
                                                        : 0;

                                                    // Hide negligible trades completely
                                                    if (isSimulatorMode && !isInitialSetup && userDollarAmount < 1.00) {
                                                        return null;
                                                    }

                                                    return (
                                                        <React.Fragment key={`${trade.ticker}-${idx}`}>
                                                            {showSeparator && (
                                                                <tr>
                                                                    <td colSpan={5} style={{ padding: '10px 0' }}>
                                                                        <div style={{ height: '1px', background: '#334155', width: '100%' }}></div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                            <tr
                                                                className="activity-row"
                                                                style={{
                                                                    height: '44px',
                                                                    opacity: isDimmed ? 0.35 : 1,
                                                                    background: 'transparent',
                                                                    borderLeft: isHighlighted
                                                                        ? `4px solid ${isBuyAction ? '#34d399' : '#f87171'}`
                                                                        : '4px solid transparent'
                                                                }}
                                                            >
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
                                                                        background: isBuyAction ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                                        color: isBuyAction ? '#34d399' : '#f87171',
                                                                        border: '1px solid',
                                                                        borderColor: isBuyAction ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                                                                    }}>
                                                                        {trade.action}
                                                                        {trade.isCapitalDeployment && (
                                                                            <span style={{ fontSize: '9px', marginLeft: '6px', color: '#60a5fa' }}>
                                                                                {trade.action === 'Sell' || trade.action === 'Reduce' ? '(Rebalance)' : '(Capital Addition)'}
                                                                            </span>
                                                                        )}
                                                                        {cappedInfo?.capped && <span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.8 }}>(Capped)</span>}
                                                                    </span>
                                                                </td>
                                                                <td className="activity-shares" style={{ color: '#cbd5e1', fontFamily: 'monospace', textAlign: 'right' }}>
                                                                    {trade.shares_change > 0 ? '+' : ''}
                                                                    {Math.abs(trade.shares_change).toLocaleString()}
                                                                </td>
                                                                <td className="activity-value" style={{ color: '#94a3b8', fontFamily: 'monospace', textAlign: 'right' }}>
                                                                    {trade.price > 0 ? `$${trade.price.toFixed(2)}` : '—'}
                                                                </td>
                                                                <td style={{ textAlign: 'right', paddingRight: '16px', fontWeight: 600, fontFamily: 'monospace' }}>
                                                                    {isSimulatorMode ? (
                                                                        isDimmed ? (
                                                                            <span style={{ color: '#64748b', fontSize: '11px' }}>N/A ⓘ</span>
                                                                        ) : (
                                                                            <span style={{ color: isBuyAction ? '#10b981' : '#ef4444' }}>
                                                                                {isBuyAction ? 'Buy ' : 'Sell '}
                                                                                {Math.abs(userShareCount) > 0
                                                                                    ? (Math.abs(userShareCount) < 0.01 ? Math.abs(userShareCount).toFixed(4) : (Math.abs(userShareCount) < 1 ? Math.abs(userShareCount).toFixed(2) : Math.round(Math.abs(userShareCount)).toLocaleString())) + ' sh'
                                                                                    : '$' + (userDollarAmount < 1 ? userDollarAmount.toFixed(2) : Math.round(userDollarAmount).toLocaleString())}
                                                                            </span>
                                                                        )
                                                                    ) : (
                                                                        <span style={{ color: '#f8fafc' }}>{formatCurrency(trade.value)}</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                )
                }
            </div >

            {/* Methodology Popup */}
            {isMethodologyOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '700px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '24px 32px',
                            borderBottom: '1px solid #334155',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            position: 'sticky',
                            top: 0,
                            background: '#1e293b',
                            zIndex: 10
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: 'rgba(59, 130, 246, 0.15)', padding: '8px', borderRadius: '10px' }}>
                                    <TrendingUp size={24} color="#60a5fa" />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>Simulator Methodology</h2>
                                    <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>How we calculate your mirrored portfolio</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsMethodologyOpen(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#64748b',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    transition: 'background 0.2s',
                                    display: 'flex'
                                }}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Content */}
                        <div style={{ padding: '32px' }}>
                            <div style={{ display: 'grid', gap: '28px' }}>

                                {/* Key Insight Banner */}
                                <div style={{ background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.05))', border: '1px solid rgba(251, 191, 36, 0.3)', padding: '16px 20px', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                        <div style={{ background: '#fbbf24', borderRadius: '50%', padding: '6px', display: 'flex' }}>
                                            <AlertCircle size={16} color="#0f172a" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#fbbf24', marginBottom: '4px', fontSize: '14px' }}>
                                                This is a "Follower" Simulation
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#fcd34d', lineHeight: '1.5' }}>
                                                We simulate trades on the <strong>13F Filing Release Date</strong>, not the quarter end. This reflects reality: you can only act on positions <em>after</em> they become public (up to 45 days after quarter end).
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Step 1 - Goal */}
                                <div>
                                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '26px', height: '26px', background: '#3b82f6', borderRadius: '50%', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700 }}>1</div>
                                        Match the Fund's Allocation
                                    </h3>
                                    <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155', color: '#cbd5e1', fontSize: '14px', lineHeight: '1.7' }}>
                                        We replicate the fund's <strong>percentage weights</strong> using your capital. If the fund has 15% in Apple, you get 15% of your money in Apple. The goal is to track their conviction, not their dollar amounts.
                                    </div>
                                </div>

                                {/* Step 2 - Timing */}
                                <div>
                                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '26px', height: '26px', background: '#3b82f6', borderRadius: '50%', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700 }}>2</div>
                                        Trade on Filing Date (Not Quarter End)
                                    </h3>
                                    <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155', color: '#cbd5e1', fontSize: '14px', lineHeight: '1.7' }}>
                                        <strong>Why?</strong> The fund makes trades throughout the quarter, but you don't know about them until the 13F is filed (up to 45 days later). This simulator assumes you execute trades the day the filing becomes public, using the <strong>market price on that date</strong>.
                                        <div style={{ marginTop: '12px', padding: '12px', background: '#1e293b', borderRadius: '6px', fontSize: '13px', color: '#94a3b8' }}>
                                            <strong style={{ color: '#e2e8f0' }}>Example:</strong> Q4 ends Dec 31. Filing released Feb 14. You trade on Feb 14 at Feb 14 prices.
                                        </div>
                                    </div>
                                </div>

                                {/* Step 3 - Execution */}
                                <div>
                                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '26px', height: '26px', background: '#3b82f6', borderRadius: '50%', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700 }}>3</div>
                                        Capital-Constrained Execution
                                    </h3>
                                    <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155', color: '#cbd5e1', fontSize: '14px', lineHeight: '1.7' }}>
                                        Your trades are limited by your <strong>available cash</strong> (starting capital + quarterly additions + sales proceeds). Unlike the fund, you can't raise billions from outside investors. If a trade requires more cash than you have, it gets <strong>(Capped)</strong>.
                                    </div>
                                </div>

                                {/* FAQ Section */}
                                <div style={{ borderTop: '1px solid #334155', paddingTop: '24px' }}>
                                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', marginBottom: '16px' }}>
                                        FAQ
                                    </h3>

                                    <div style={{ display: 'grid', gap: '16px' }}>
                                        <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '16px', borderRadius: '10px' }}>
                                            <div style={{ fontWeight: 600, color: '#f87171', marginBottom: '6px', fontSize: '14px' }}>
                                                Why are my returns different from the fund's reported returns?
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                                                Their reported returns measure performance from quarter-end to quarter-end. Yours are measured from filing date to filing date because that's when you actually trade. The price gap during the delay period causes the difference.
                                            </div>
                                        </div>

                                        <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '16px', borderRadius: '10px' }}>
                                            <div style={{ fontWeight: 600, color: '#f87171', marginBottom: '6px', fontSize: '14px' }}>
                                                Why "(Capped)"?
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                                                The fund increased a position by more than your available cash allows. We cap your order at what you can afford to prevent negative balances.
                                            </div>
                                        </div>

                                        <div style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '16px', borderRadius: '10px' }}>
                                            <div style={{ fontWeight: 600, color: '#60a5fa', marginBottom: '6px', fontSize: '14px' }}>
                                                What is "(Rebalance)"?
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                                                A trade triggered because your portfolio drifted from the target weights (due to price movements), not because the fund explicitly traded. These keep your % allocation aligned.
                                            </div>
                                        </div>

                                        <div style={{ background: 'rgba(167, 139, 250, 0.05)', border: '1px solid rgba(167, 139, 250, 0.2)', padding: '16px', borderRadius: '10px' }}>
                                            <div style={{ fontWeight: 600, color: '#a78bfa', marginBottom: '6px', fontSize: '14px' }}>
                                                Why do quarterly additions affect my returns?
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                                                With <strong>$0 quarterly additions</strong>, your only buying power is sale proceeds. If the fund net-buys (buys &gt; sells), many of your buys get capped and your portfolio <strong>diverges</strong> from the fund's allocation over time.
                                                <br /><br />
                                                With <strong>ongoing contributions</strong>, you have capital to actually execute the fund's moves, so your portfolio tracks more closely. Different contribution levels = different portfolios, not just different scales.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tracker Info Popup (Non-Simulator Mode) */}
            {isTrackerInfoOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '650px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '24px 32px',
                            borderBottom: '1px solid #334155',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            position: 'sticky',
                            top: 0,
                            background: '#1e293b',
                            zIndex: 10
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '8px', borderRadius: '10px' }}>
                                    <BarChart3 size={24} color="#818cf8" />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>Mimic Portfolio Tracker</h2>
                                    <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>What this chart shows</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsTrackerInfoOpen(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#64748b',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    display: 'flex'
                                }}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Content */}
                        <div style={{ padding: '28px 32px' }}>
                            <div style={{ display: 'grid', gap: '24px' }}>

                                {/* What It Shows */}
                                <div>
                                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', marginBottom: '12px' }}>
                                        What This Chart Shows
                                    </h3>
                                    <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155', color: '#cbd5e1', fontSize: '14px', lineHeight: '1.7' }}>
                                        The cumulative return of a portfolio that <strong>copies the fund's holdings</strong> at each 13F filing.
                                        This is a <strong>time-weighted return (TWR)</strong> – it shows how a $1 investment would grow, ignoring cash flows.
                                    </div>
                                </div>

                                {/* Key Timing */}
                                <div style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(79, 70, 229, 0.05))', border: '1px solid rgba(99, 102, 241, 0.3)', padding: '16px 20px', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                        <div style={{ background: '#6366f1', borderRadius: '50%', padding: '6px', display: 'flex' }}>
                                            <Calendar size={16} color="#fff" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#a5b4fc', marginBottom: '4px', fontSize: '14px' }}>
                                                Filing Date Returns (Not Quarter End)
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#c7d2fe', lineHeight: '1.5' }}>
                                                Returns are calculated from <strong>filing date to filing date</strong>, because that's when you'd actually know about the positions. This differs from the fund's official returns (quarter-end to quarter-end).
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* How It Works */}
                                <div>
                                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', marginBottom: '12px' }}>
                                        How Returns Are Calculated
                                    </h3>
                                    <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155', color: '#cbd5e1', fontSize: '14px', lineHeight: '1.7' }}>
                                        <ol style={{ margin: 0, paddingLeft: '20px' }}>
                                            <li style={{ marginBottom: '8px' }}>We take the fund's <strong>share counts</strong> from each 13F filing</li>
                                            <li style={{ marginBottom: '8px' }}>We lookup the <strong>stock price on the date the filing was released</strong> (not the values in the filing, which are quarter-end)</li>
                                            <li style={{ marginBottom: '8px' }}>Portfolio Value = Shares × Stock Price on Release Date</li>
                                            <li style={{ marginBottom: '8px' }}><strong>Period Return</strong> = (Value on Release Date₂) / (Value on Release Date₁) - 1</li>
                                            <li>Returns are <strong>compounded</strong> to show cumulative growth</li>
                                        </ol>
                                    </div>
                                </div>

                                {/* vs S&P 500 */}
                                <div>
                                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', marginBottom: '12px' }}>
                                        S&P 500 Comparison
                                    </h3>
                                    <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155', color: '#cbd5e1', fontSize: '14px', lineHeight: '1.7' }}>
                                        The dashed purple line shows what <strong>SPY</strong> (S&P 500 ETF) returned over the same period, using the same filing-date-aligned timing. This gives you a fair "apples-to-apples" comparison of the fund's alpha.
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};
