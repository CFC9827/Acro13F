import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Info, ChevronDown, Download } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from 'recharts';
import { fetchWithAuth } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { PerformanceExportModal } from './PerformanceExportModal';

interface HistoricalHolding {
    id: number;
    issuer_name: string;
    cusip: string;
    ticker?: string;
    shares: number;
    value: number;
    period_of_report: string;
}

interface BenchmarkData {
    date: string;
    value: number;
    return: number;
}

interface PerformanceChartProps {
    data: HistoricalHolding[];
    timeRange: string;
    onTimeRangeChange: (range: string) => void;
    offset: number;
    onOffsetChange: (offset: number) => void;
    fundName: string;
}

export function PerformanceChart({ data, timeRange, onTimeRangeChange, offset, onOffsetChange, fundName }: PerformanceChartProps) {
    const [showBenchmark, setShowBenchmark] = useState(false);
    const [benchmarkData, setBenchmarkData] = useState<BenchmarkData[]>([]);
    const { session } = useAuth();
    const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
    const [linkToPortfolio, setLinkToPortfolio] = useState(false);
    const [metricTooltip, setMetricTooltip] = useState<{ key: string; x: number; y: number } | null>(null);
    const [showMethodologyTooltip, setShowMethodologyTooltip] = useState<{ x: number; y: number } | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

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

            const fetchBenchmarkData = async () => {
                try {
                    const res = await fetchWithAuth(`/api/market/benchmark?start=${startStr}&end=${today}`, {}, session);
                    const data = await res.json();
                    if (Array.isArray(data)) setBenchmarkData(data);
                } catch (err) {
                    console.error("Failed to fetch benchmark", err);
                }
            };
            fetchBenchmarkData();
        }
    }, [showBenchmark, data]);

    const { filteredData, stats } = useMemo(() => {
        // 1. Group holdings by period
        const periods: { [key: string]: HistoricalHolding[] } = {};
        data.forEach(h => {
            if (!periods[h.period_of_report]) periods[h.period_of_report] = [];
            periods[h.period_of_report].push(h);
        });

        const sortedPeriodsFull = Object.keys(periods).sort();
        if (sortedPeriodsFull.length < 2) return { filteredData: [], stats: { totalReturn: 0, irr: 0, benchmarkTotal: null, benchmarkIrr: null, totalPnL: 0, totalCommitted: 0, portfolioRoi: 0 } };

        const availableLen = sortedPeriodsFull.length;
        const endIndex = Math.max(1, availableLen - 1 - offset);

        if (endIndex < 1) return { filteredData: [], stats: { totalReturn: 0, irr: 0, benchmarkTotal: null, benchmarkIrr: null, totalPnL: 0, totalCommitted: 0, portfolioRoi: 0 } };

        const latestPeriodDateInWindow = sortedPeriodsFull[endIndex];
        const latestDate = new Date(latestPeriodDateInWindow);

        let cutoffDate = new Date();
        if (timeRange === 'YTD') {
            cutoffDate = new Date(latestDate.getFullYear(), 0, 1);
        } else if (timeRange === 'CUSTOM' || timeRange === 'MAX') {
            cutoffDate = new Date(0); 
        } else if (timeRange.endsWith('Q')) {
            const quarters = parseInt(timeRange);
            cutoffDate = new Date(latestDate);
            cutoffDate.setMonth(cutoffDate.getMonth() - ((quarters - 1) * 3));
        } else {
            const years = parseInt(timeRange);
            const quarters = years * 4;
            cutoffDate = new Date(latestDate);
            cutoffDate.setMonth(cutoffDate.getMonth() - ((quarters - 1) * 3));
        }

        const sortedPeriods = sortedPeriodsFull.filter((p, idx) => {
            const d = new Date(p);
            if (timeRange === 'CUSTOM' && customStartQuarter && customEndQuarter) {
                const startDate = new Date(customStartQuarter);
                const endDate = new Date(customEndQuarter);
                return d >= startDate && d <= endDate;
            }
            if (timeRange.endsWith('Q')) {
                const quarters = parseInt(timeRange);
                const startIdx = Math.max(0, endIndex - quarters + 1);
                return idx >= startIdx && idx <= endIndex;
            }
            return d >= cutoffDate && idx <= endIndex;
        });

        if (sortedPeriods.length < 2) return { filteredData: [], stats: { totalReturn: 0, irr: 0, benchmarkTotal: null, benchmarkIrr: null, totalPnL: 0, totalCommitted: 0, portfolioRoi: 0 } };

        const cashFlows: number[] = [];
        let cumulativeReturn = 0;
        let totalPnL = 0;
        let totalCommitted = 0;

        let benchStartVal: number | null = null;
        if (showBenchmark && benchmarkData.length > 0) {
            const startD = new Date(sortedPeriods[0]).getTime();
            const closest = benchmarkData.reduce((prev, curr) => {
                return (Math.abs(new Date(curr.date).getTime() - startD) < Math.abs(new Date(prev.date).getTime() - startD) ? curr : prev);
            });
            benchStartVal = closest.value;
        }

        const chartData = sortedPeriods.map((p, idx) => {
            const periodHoldings = periods[p];
            const totalValue = periodHoldings.reduce((sum, h) => sum + h.value, 0);
            
            let periodReturn = 0;
            if (idx > 0) {
                const prevP = sortedPeriods[idx - 1];
                const prevHoldings = periods[prevP];
                const prevValue = prevHoldings.reduce((sum, h) => sum + h.value, 0);
                
                const holdingsMap = new Map(periodHoldings.map(h => [h.ticker || h.cusip, h]));
                let pricePnL = 0;
                let netFlow = 0;

                prevHoldings.forEach(prev => {
                    const curr = holdingsMap.get(prev.ticker || prev.cusip);
                    const p1 = prev.shares > 0 ? prev.value / prev.shares : 0;
                    const p2 = curr ? (curr.shares > 0 ? curr.value / curr.shares : p1) : p1;
                    pricePnL += (p2 - p1) * prev.shares;
                    if (curr) {
                        netFlow += (curr.shares - prev.shares) * p2;
                    } else {
                        netFlow += (0 - prev.shares) * p1;
                    }
                });

                periodHoldings.forEach(curr => {
                    if (!prevHoldings.find(ph => (ph.ticker || ph.cusip) === (curr.ticker || curr.cusip))) {
                        const p2 = curr.shares > 0 ? curr.value / curr.shares : 0;
                        netFlow += curr.shares * p2;
                    }
                });

                const denominator = prevValue + (netFlow > 0 ? netFlow : 0);
                periodReturn = denominator > 0 ? (pricePnL / denominator) : 0;
                totalPnL += pricePnL;
                totalCommitted += (netFlow > 0 ? netFlow : 0);
            } else {
                totalCommitted = totalValue;
            }

            cumulativeReturn = idx === 0 ? 0 : (1 + cumulativeReturn / 100) * (1 + periodReturn) - 1;
            cumulativeReturn *= 100;

            let benchmarkReturn = null;
            if (showBenchmark && benchmarkData.length > 0 && benchStartVal) {
                const currentD = new Date(p).getTime();
                const closest = benchmarkData.reduce((prev, curr) => {
                    return (Math.abs(new Date(curr.date).getTime() - currentD) < Math.abs(new Date(prev.date).getTime() - currentD) ? curr : prev);
                });
                benchmarkReturn = ((closest.value / benchStartVal) - 1) * 100;
            }

            return {
                period: p,
                value: totalValue,
                return: cumulativeReturn,
                benchmarkReturn
            };
        });

        const stats = {
            totalReturn: cumulativeReturn,
            irr: 0,
            benchmarkTotal: chartData[chartData.length - 1].benchmarkReturn,
            benchmarkIrr: null,
            totalPnL,
            totalCommitted,
            portfolioRoi: totalCommitted > 0 ? (totalPnL / totalCommitted) * 100 : 0
        };

        return { filteredData: chartData, stats };
    }, [data, timeRange, offset, showBenchmark, benchmarkData, customStartQuarter, customEndQuarter]);

    if (!data || data.length === 0) {
        return (
            <div className="loading-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '40px' }}>
                <Activity size={48} style={{ color: '#64748b', opacity: 0.5 }} />
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#94a3b8' }}>No Performance Data Available</div>
            </div>
        );
    }

    return (
        <div className="portfolio-dashboard-v2">
            <div className="chart-header-v2" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div className="chart-title-v2" style={{ fontSize: '1.25rem', fontWeight: 700 }}>Performance History</div>
                <div className="time-controls" style={{ display: 'flex', gap: '8px' }}>
                    {['1Y', '3Y', 'MAX'].map(r => (
                        <button key={r} onClick={() => onTimeRangeChange(r)} className={`time-btn ${timeRange === r ? 'active' : ''}`}>{r}</button>
                    ))}
                </div>
            </div>

            <div className="chart-content-v2" style={{ height: '400px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={filteredData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis 
                            dataKey="period" 
                            tickFormatter={formatQuarter}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                        />
                        <YAxis 
                            tickFormatter={(val) => `${val > 0 ? '+' : ''}${val.toFixed(0)}%`}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                        />
                        <Tooltip />
                        <Area type="monotone" dataKey="return" stroke="#10b981" fill="url(#colorReturn)" />
                        {showBenchmark && <Line type="monotone" dataKey="benchmarkReturn" stroke="#fbbf24" dot={false} />}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
