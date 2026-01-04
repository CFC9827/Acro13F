import React, { useMemo, useState, useEffect } from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar
} from 'recharts';
import { ChevronLeft, ChevronRight, CheckSquare, Square, ArrowUpDown, ArrowUp, ArrowDown, Search, ChevronDown } from 'lucide-react';
import { calculateIRR } from '../utils/performanceUtils';

export interface HistoricalHolding {
    id: number;
    issuer_name: string;
    cusip: string;
    ticker?: string;
    shares: number;
    value: number;
    period_of_report: string;
    accession_number?: string;
    cik?: string;
    percent_portfolio?: number;
    put_call?: string;
}

interface PortfolioChartProps {
    data: HistoricalHolding[];
    timeRange?: TimeRange;
    onTimeRangeChange?: (range: TimeRange) => void;
    offset?: number;
    onOffsetChange?: (offset: number) => void;
    showIRR?: boolean;
    hideChart?: boolean;
    selectedTickers?: Set<string>;
    onToggleTicker?: (ticker: string) => void;
    customStart?: string;
    customEnd?: string;
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

export const formatCurrency = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (absValue >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (absValue >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
};

type TimeRange = '2Q' | 'YTD' | '1Y' | '3Y' | '5Y' | '10Y' | 'CUSTOM' | 'MAX';

type PortfolioSortField = 'comp' | 'name' | 'shares' | 'value' | 'pnl' | 'roi' | 'irr' | 'percent';
type SortDirection = 'asc' | 'desc';

const CustomTooltip = ({ active, payload, label, allKeys }: any) => {
    if (active && payload && payload.length) {
        const filteredPayload = payload
            .filter((item: any) => item.value > 0)
            .sort((a: any, b: any) => {
                // Sort by stack visual order (Top to bottom) which corresponds to
                // ALL KEYS index (since allKeys are rendered bottom to top?)
                // Actually, render order is 0..N. 0 is bottom area. N is top area.
                // Visual scan Top -> Bot => N -> 0.
                // allKeys is sorted by Peak Value Descending. So 0 is biggest peak.
                // If 0 is bottom area, then descending index puts biggest at bottom of list.
                if (allKeys) {
                    const idxA = allKeys.indexOf(a.dataKey);
                    const idxB = allKeys.indexOf(b.dataKey);
                    return idxB - idxA;
                }
                return b.value - a.value;
            });

        if (filteredPayload.length === 0) return null;

        const date = new Date(label);
        const q = Math.floor(date.getMonth() / 3) + 1;
        const year = date.getFullYear().toString().slice(2);

        return (
            <div className="custom-chart-tooltip" style={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '12px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                minWidth: '220px',
                zIndex: 2000
            }}>
                <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: '11px', marginBottom: '8px', borderBottom: '1px solid #1e293b', paddingBottom: '4px' }}>
                    Q{q} '{year} Position Values
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {(() => {
                        const total = payload.reduce((acc: number, item: any) => acc + (item.value || 0), 0);
                        return filteredPayload.map((item: any, idx: number) => {
                            const pct = total > 0 ? (item.value / total) * 100 : 0;
                            return (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color }}></div>
                                        <span style={{ color: '#f8fafc' }}>{item.name}</span>
                                    </div>
                                    <span style={{ color: '#94a3b8', fontWeight: 600, marginLeft: '12px' }}>
                                        ${(item.value / 1e6).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M ({pct.toFixed(1)}%)
                                    </span>
                                </div>
                            );
                        });
                    })()}
                    <div style={{ borderTop: '1px solid #1e293b', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700 }}>
                        <span style={{ color: '#f8fafc' }}>Total AUM</span>
                        <span style={{ color: '#ffffff' }}>
                            ${(payload.reduce((acc: number, item: any) => acc + (item.value || 0), 0) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M
                        </span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

const getPositionKey = (h: HistoricalHolding) => {
    const base = h.ticker || h.cusip;
    const pc = h.put_call?.toUpperCase();
    if (pc === 'PUT' || pc === 'CALL') return `${base}:${pc}`;
    return base;
};

export const PortfolioChart: React.FC<PortfolioChartProps> = ({
    data,
    timeRange: propTimeRange,
    onTimeRangeChange,
    offset = 0,
    onOffsetChange,
    showIRR = false,
    hideChart = false,
    selectedTickers = new Set(),
    onToggleTicker,
    customStart,
    customEnd
}) => {
    const [internalTimeRange, setInternalTimeRange] = useState<TimeRange>('1Y');
    const [deltaMode, setDeltaMode] = useState<'period' | 'quarter'>('period');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<PortfolioSortField>('value');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Custom date range state
    const [internalCustomStart, setInternalCustomStart] = useState<string>('');
    const [internalCustomEnd, setInternalCustomEnd] = useState<string>('');

    const customStartQuarter = customStart ?? internalCustomStart;
    const customEndQuarter = customEnd ?? internalCustomEnd;

    const setCustomStartQuarter = setInternalCustomStart;
    const setCustomEndQuarter = setInternalCustomEnd;
    const [showStartDropdown, setShowStartDropdown] = useState(false);
    const [showEndDropdown, setShowEndDropdown] = useState(false);

    // Helper to format quarter
    const formatQuarter = (dateStr: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        const q = Math.floor(d.getMonth() / 3) + 1;
        return `${q}Q '${d.getFullYear().toString().slice(2)}`;
    };

    // Available quarters
    const availableQuarters = useMemo(() => {
        if (!data) return [];
        const quarters = Array.from(new Set(data.map(h => h.period_of_report)))
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        return quarters;
    }, [data]);

    // Initialize custom quarters
    useEffect(() => {
        if (availableQuarters.length > 0 && (!customStartQuarter || !customEndQuarter)) {
            setCustomStartQuarter(availableQuarters[availableQuarters.length - 1]);
            setCustomEndQuarter(availableQuarters[0]);
        }
    }, [availableQuarters]);

    const timeRange = propTimeRange || internalTimeRange;
    const setTimeRangeState = (r: TimeRange) => {
        if (onTimeRangeChange) onTimeRangeChange(r);
        else setInternalTimeRange(r);
    };



    const handleSort = (field: PortfolioSortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const renderSortIcon = (field: PortfolioSortField) => {
        if (sortField !== field) return <ArrowUpDown size={12} className="text-slate-400" style={{ opacity: 0.5 }} />;
        return sortDirection === 'asc'
            ? <ArrowUp size={12} style={{ color: '#3b82f6' }} />
            : <ArrowDown size={12} style={{ color: '#3b82f6' }} />;
    };

    const { chartData, allKeys, tableHoldings, keyToNameMap, basePeriodDate } = useMemo(() => {
        if (!data.length) return { chartData: [], allKeys: [], tableHoldings: [], keyToNameMap: {}, basePeriodDate: '' };

        const periods: { [key: string]: any } = {};
        const keyPeaks: { [key: string]: number } = {};
        const keyToNameMap: { [key: string]: string } = {};

        data.forEach((h) => {
            const date = h.period_of_report;
            const key = getPositionKey(h);

            if (!periods[date]) {
                periods[date] = { date, total: 0 };
            }
            periods[date][key] = (periods[date][key] || 0) + h.value;
            periods[date].total += h.value;

            keyPeaks[key] = Math.max(keyPeaks[key] || 0, h.value);

            if (!keyToNameMap[key]) {
                const name = (h.ticker && h.ticker !== h.issuer_name)
                    ? `${h.ticker} (${h.issuer_name})`
                    : h.issuer_name || h.cusip;
                const pc = h.put_call?.toUpperCase();
                keyToNameMap[key] = (pc === 'PUT' || pc === 'CALL') ? `${name} (${pc})` : name;
            }
        });

        let sortedPeriods = Object.values(periods).sort((a: any, b: any) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Apply Offset Logic
        const availableLen = sortedPeriods.length;
        const endIndex = Math.max(0, availableLen - 1 - offset);
        if (endIndex < 0) return { chartData: [], allKeys: [], tableHoldings: [], keyToNameMap: {}, basePeriodDate: '' };

        let latestPeriodDate = sortedPeriods[endIndex].date;
        let actualEndIndex = endIndex;

        if (timeRange === 'CUSTOM' && customEndQuarter) {
            const idx = sortedPeriods.findIndex(p => p.date === customEndQuarter);
            if (idx >= 0) {
                latestPeriodDate = customEndQuarter;
                actualEndIndex = idx;
            }
        }

        const latestDate = new Date(latestPeriodDate);
        let cutoffDate = new Date(0);

        if (timeRange === '2Q') {
            cutoffDate = new Date(latestDate);
            cutoffDate.setMonth(cutoffDate.getMonth() - 4); // Go back enough to capture the previous quarter
        } else if (timeRange === 'YTD') {
            cutoffDate = new Date(latestDate.getFullYear(), 0, 1);
        } else if (timeRange === '1Y') {
            cutoffDate = new Date(latestDate);
            cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
            cutoffDate.setDate(cutoffDate.getDate() + 1); // Exclude exact boundary quarter
        } else if (timeRange === '3Y') {
            cutoffDate = new Date(latestDate);
            cutoffDate.setFullYear(cutoffDate.getFullYear() - 3);
            cutoffDate.setDate(cutoffDate.getDate() + 1); // Exclude exact boundary quarter
        } else if (timeRange === '5Y') {
            cutoffDate = new Date(latestDate);
            cutoffDate.setFullYear(cutoffDate.getFullYear() - 5);
            cutoffDate.setDate(cutoffDate.getDate() + 1); // Exclude exact boundary quarter
        } else if (timeRange === '10Y') {
            cutoffDate = new Date(latestDate);
            cutoffDate.setFullYear(cutoffDate.getFullYear() - 10);
            cutoffDate.setDate(cutoffDate.getDate() + 1); // Exclude exact boundary quarter
        } else if (timeRange === 'CUSTOM') {
            // For CUSTOM, use the selected quarter range
            cutoffDate = new Date(0);
        }

        let filteredSortedPeriods = sortedPeriods.filter((p, idx) => {
            const d = new Date(p.date);

            // For CUSTOM, filter by selected range
            if (timeRange === 'CUSTOM' && customStartQuarter && customEndQuarter) {
                const startDate = new Date(customStartQuarter);
                const endDate = new Date(customEndQuarter);
                return d >= startDate && d <= endDate;
            }

            return d >= cutoffDate && idx <= endIndex;
        });

        const basePeriodDate = filteredSortedPeriods.length > 0 ? filteredSortedPeriods[0].date : '';

        const filteredLabels = new Set<string>();
        filteredSortedPeriods.forEach(p => {
            Object.keys(p).forEach(k => {
                if (k !== 'date' && k !== 'total') filteredLabels.add(k);
            });
        });

        const allKeys = Array.from(filteredLabels).sort((a, b) => keyPeaks[b] - keyPeaks[a]);

        const finalChartData = filteredSortedPeriods.map(p => {
            const row: any = { date: p.date, total: p.total };
            allKeys.forEach(k => {
                row[k] = p[k] || 0;
            });
            return row;
        });

        const rangeHoldingsMap: { [key: string]: any } = {};

        filteredLabels.forEach(label => {
            // Get data for this holding within the filtered timeframe
            const labelData = data.filter(h => getPositionKey(h) === label)
                .sort((a, b) => new Date(a.period_of_report).getTime() - new Date(b.period_of_report).getTime())
                .filter(h => {
                    const d = new Date(h.period_of_report);
                    return d >= cutoffDate && d <= latestDate;
                });

            if (labelData.length === 0) return;

            const latestEntry = labelData[labelData.length - 1];
            // If the holding exists in the latest period of our view, it's "held". 
            // If it existed within the view but not at end, it's "exited" (relative to view).
            const isCurrentlyHeld = latestEntry.period_of_report === latestPeriodDate;

            // Find the entry at basePeriodDate (start of window) if it exists
            // If no entry at exact basePeriodDate, this holding was new in the window
            const baseEntryAtStart = labelData.find(h => h.period_of_report === basePeriodDate);

            const curVal = isCurrentlyHeld ? latestEntry.value : 0;
            const curShrs = isCurrentlyHeld ? latestEntry.shares : 0;

            // Delta from start of window to end of window (Period mode)
            // If holding didn't exist at basePeriodDate, it's a new position in the window (base = 0)
            const isNewInWindow = !baseEntryAtStart;
            const baseVal = isNewInWindow ? 0 : baseEntryAtStart.value;
            const baseShrs = isNewInWindow ? 0 : baseEntryAtStart.shares;

            const deltaValue = curVal - baseVal;
            const deltaShares = curShrs - baseShrs;

            // Delta from previous quarter to latest quarter (QoQ mode)
            // Find the immediate previous period date from our global sorted timeline
            const prevPeriodIdx = timeRange === 'CUSTOM' ? actualEndIndex : endIndex;
            const prevPeriodDate = prevPeriodIdx > 0 ? sortedPeriods[prevPeriodIdx - 1].date : null;
            // Look for an entry in this ticker's data for that SPECIFIC date
            const prevEntryAtPeriod = prevPeriodDate ? labelData.find(h => h.period_of_report === prevPeriodDate) : null;

            const prevVal = prevEntryAtPeriod ? prevEntryAtPeriod.value : 0;
            const prevShrs = prevEntryAtPeriod ? prevEntryAtPeriod.shares : 0;
            const deltaValueQoQ = curVal - prevVal;
            const deltaSharesQoQ = curShrs - prevShrs;

            let irr = 0;
            let calculatedTotalReturn = 0;
            let totalInputs = 0;
            let totalOutputs = 0;
            let pricePnl = 0;
            let committed = 0;

            if (showIRR) {
                // Use price-based PnL methodology (same as HoldingsTable)
                // PnL = Σ (price_t - price_prev) × shares_prev
                // committed = initial value + all positive flows (buys)

                // Initial commitment - use first entry value if position is new in window
                const initialOutflow = isNewInWindow ? labelData[0].value : baseVal;
                committed = initialOutflow;

                // Cash flows for IRR calculation
                const cashFlows: number[] = [-initialOutflow];

                // Calculate price-based PnL and cash flows
                for (let i = 1; i < labelData.length; i++) {
                    const prev = labelData[i - 1];
                    const curr = labelData[i];

                    const p1 = prev.shares > 0 ? prev.value / prev.shares : 0;
                    const p2 = curr.shares > 0 ? curr.value / curr.shares : p1;

                    // Price PnL: price change × shares held from previous period
                    pricePnl += (p2 - p1) * prev.shares;

                    // Cash flow: share change × current price
                    const flow = (curr.shares - prev.shares) * p2;
                    if (flow > 0) committed += flow; // Track buys as committed capital

                    cashFlows.push(-flow);
                }

                // Terminal Flow for IRR
                const lastValue = latestEntry.value;
                if (cashFlows.length > 0) {
                    cashFlows[cashFlows.length - 1] += lastValue;
                }

                // Calculate totals for backward compatibility
                if (cashFlows[0] < 0) totalInputs += Math.abs(cashFlows[0]);
                for (let i = 1; i < cashFlows.length - 1; i++) {
                    if (cashFlows[i] < 0) totalInputs += Math.abs(cashFlows[i]);
                    else totalOutputs += cashFlows[i];
                }
                if (cashFlows[cashFlows.length - 1] > 0) totalOutputs += cashFlows[cashFlows.length - 1];

                // ROI based on committed capital (same as HoldingsTable)
                calculatedTotalReturn = committed > 0 ? (pricePnl / committed) * 100 : 0;

                irr = (Math.pow(1 + calculateIRR(cashFlows), 4) - 1) * 100;
            }

            // Quarterly Performance Metrics
            let irrQoQ = 0;
            let totalReturnQoQ = 0;
            let pnlQoQ = 0;

            if (showIRR) {
                // Calculate return for the specific quarter
                // PnL = (End - Start) - NetFlow
                // NetFlow = ChangeInShares * Price
                const price_end = curShrs > 0 ? curVal / curShrs : 0;

                // If exited this quarter, use exit price (approx 0 or last known)
                // For simplified table view, we use current values.

                const netFlowQoQ = deltaSharesQoQ * price_end;
                pnlQoQ = (curVal - prevVal) - netFlowQoQ;

                // Adjust base for return calculation
                // Base = StartValue + (Buys during period)
                const buysQoQ = deltaSharesQoQ > 0 ? netFlowQoQ : 0;
                const costBasisQoQ = prevVal + buysQoQ;

                if (costBasisQoQ > 0) {
                    totalReturnQoQ = (pnlQoQ / costBasisQoQ) * 100;
                    // Annualize simple return for short period
                    // (1 + r)^4 - 1
                    irrQoQ = (Math.pow(1 + (pnlQoQ / costBasisQoQ), 4) - 1) * 100;
                }
            }

            const history: any[] = [];

            // Use FULL history for the popup (from first purchase up to current view date)
            // This ignores cutoffDate but respects latestDate (the current view endpoint)
            const fullLabelData = data.filter(h => getPositionKey(h) === label)
                .sort((a, b) => new Date(a.period_of_report).getTime() - new Date(b.period_of_report).getTime())
                .filter(h => {
                    const d = new Date(h.period_of_report);
                    return d <= latestDate; // Only filter by end date, not start
                });

            let peakEntry = fullLabelData.length > 0 ? fullLabelData[0] : labelData[0];
            let peakIndex = 0;
            let wasExited = false;
            let lastExitDate = '';

            for (let i = 0; i < fullLabelData.length; i++) {
                const cur = fullLabelData[i];
                const prev = i > 0 ? fullLabelData[i - 1] : null;
                const prevShares = prev ? prev.shares : 0;
                const change = cur.shares - prevShares;

                if (i === 0) {
                    history.push({ type: 'Initial Buy', date: cur.period_of_report, shares: cur.shares, value: cur.value, change: cur.shares });
                } else if (wasExited && cur.shares > 0) {
                    history.push({ type: 'Re-Entry', date: cur.period_of_report, shares: cur.shares, value: cur.value, change: cur.shares });
                    wasExited = false;
                } else if (change > 0) {
                    history.push({ type: 'Add', date: cur.period_of_report, shares: change, change: change });
                } else if (change < 0) {
                    if (cur.shares === 0) {
                        history.push({ type: 'Full Exit', date: cur.period_of_report, shares: Math.abs(change), change: Math.abs(change) });
                        wasExited = true;
                        lastExitDate = cur.period_of_report;
                    } else {
                        history.push({ type: 'Trim', date: cur.period_of_report, shares: Math.abs(change), change: Math.abs(change) });
                    }
                }
                // Track peak value
                if (cur.value > peakEntry.value) {
                    peakEntry = cur;
                    peakIndex = history.length; // Insert position for peak
                }
            }

            // Insert peak at correct chronological position (if different from initial)
            if (fullLabelData.length > 0 && peakEntry.period_of_report !== fullLabelData[0].period_of_report) {
                // Find correct position based on date
                const peakDate = new Date(peakEntry.period_of_report);
                let insertIdx = history.length;
                for (let i = 0; i < history.length; i++) {
                    if (new Date(history[i].date) > peakDate) {
                        insertIdx = i;
                        break;
                    }
                }
                history.splice(insertIdx, 0, { type: 'Peak Position', date: peakEntry.period_of_report, value: peakEntry.value, change: 0 });
            }

            // If not currently held and wasn't marked as exited in the loop
            if (!isCurrentlyHeld && !wasExited) {
                // Try to find when it actually exited (next quarter after last appearance)
                const lastAppearance = fullLabelData[fullLabelData.length - 1];
                if (lastAppearance) {
                    // Find the next quarter after the last appearance
                    const lastAppearanceTime = new Date(lastAppearance.period_of_report).getTime();
                    const nextQuarter = sortedPeriods.find((p: any) => new Date(p.date).getTime() > lastAppearanceTime);
                    const exitDate = nextQuarter ? nextQuarter.date : lastAppearance.period_of_report;
                    history.push({ type: 'Full Exit', date: exitDate, shares: lastAppearance.shares, change: lastAppearance.shares });
                } else {
                    history.push({ type: 'Full Exit', date: 'Unknown', shares: 0, change: 0 });
                }
            }

            // Truncate history items if too many
            // Performance tab (showIRR=true) needs fewer items due to metrics section
            // Strategy: Always keep Initial Buy (first), keep most RECENT trades, remove earlier ones
            const maxItems = showIRR ? 6 : 10;
            let finalHistory = history;
            let removedCount = 0;
            if (history.length > maxItems) {
                // Always keep Initial Buy (index 0) and important milestone events
                const importantTypes = ['Initial Buy', 'Re-Entry', 'Peak Position', 'Full Exit'];

                // Separate into: first event (Initial Buy), important events, and regular trades
                const initialBuy = history[0]; // Always keep first
                const rest = history.slice(1);

                const importantEvents = rest.filter(h => importantTypes.includes(h.type));
                const regularTrades = rest.filter(h => !importantTypes.includes(h.type));

                // From regular trades, keep the MOST RECENT ones (end of array = most recent)
                const slotsForTrades = maxItems - 1 - importantEvents.length - 1; // -1 for initial, -1 for summary
                const tradesToRemove = regularTrades.slice(0, Math.max(0, regularTrades.length - slotsForTrades));
                const tradesToKeep = regularTrades.slice(Math.max(0, regularTrades.length - slotsForTrades));
                removedCount = tradesToRemove.length;

                if (removedCount > 0) {
                    // Find the date range of removed trades for the summary position
                    const lastRemovedDate = tradesToRemove[tradesToRemove.length - 1]?.date;

                    // Build final history: Initial Buy, summary (in correct position), kept trades, important events
                    finalHistory = [
                        initialBuy,
                        { type: 'summary', removedCount, date: lastRemovedDate },
                        ...tradesToKeep,
                        ...importantEvents
                    ].sort((a, b) => {
                        // Keep Initial Buy first, then sort by date, summary goes after its date
                        if (a.type === 'Initial Buy') return -1;
                        if (b.type === 'Initial Buy') return 1;
                        return new Date(a.date).getTime() - new Date(b.date).getTime();
                    });
                } else {
                    finalHistory = [initialBuy, ...tradesToKeep, ...importantEvents].sort((a, b) =>
                        new Date(a.date).getTime() - new Date(b.date).getTime()
                    );
                }
            }
            // Determine if there was any activity in the selected time window
            // Activity = share count changed OR new position OR exited position
            const hadActivityInWindow = deltaShares !== 0 || isNewInWindow || (!isCurrentlyHeld);

            rangeHoldingsMap[label] = {
                ...latestEntry, // Use latest info for name/ticker
                label,
                currentValue: curVal,
                currentShares: curShrs,
                deltaValue,
                deltaShares,
                deltaValueQoQ,
                deltaSharesQoQ,
                isExited: !isCurrentlyHeld,
                peakValue: keyPeaks[label],
                irr: irr || 0,
                totalReturn: calculatedTotalReturn || 0,
                irrQoQ: irrQoQ || 0,
                totalReturnQoQ: totalReturnQoQ || 0,
                committed: committed,
                pnl: pricePnl,
                pnlQoQ: pnlQoQ,
                history: finalHistory,
                hadActivityInWindow
            };
        });

        // Show all holdings in the time window (not just those with activity)
        const tableHoldings = Object.values(rangeHoldingsMap)
            .sort((a, b) => b.currentValue - a.currentValue || b.peakValue - a.peakValue);

        // Calculate total portfolio value for percentage calculation
        const totalPortfolioValue = tableHoldings.reduce((sum: number, h: any) => sum + (h.currentValue || 0), 0);

        // Add portfolio percentage to each holding
        tableHoldings.forEach((h: any) => {
            h.portfolioPercent = totalPortfolioValue > 0 ? (h.currentValue / totalPortfolioValue) * 100 : 0;
        });

        return {
            chartData: finalChartData,
            allKeys,
            tableHoldings,
            keyToNameMap,
            basePeriodDate
        };
    }, [data, timeRange, offset, showIRR, customStartQuarter, customEndQuarter]);

    if (!data.length) return <div className="loading-state">No historical data available.</div>;

    const baseDateFormatted = useMemo(() => {
        if (!basePeriodDate) return 'N/A';
        const d = new Date(basePeriodDate);
        const q = Math.floor(d.getMonth() / 3) + 1;
        return `Q${q} '${d.getFullYear().toString().slice(2)}`;
    }, [basePeriodDate]);

    return (
        <div className="portfolio-dashboard-v2">
            {!hideChart && (
                <div className="chart-panel-v2" style={{ position: 'relative' }}>
                    <div className="chart-header-v2">
                        <div className="chart-title-v2">Portfolio Composition Over Time ($M)</div>
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
                                        onOffsetChange && onOffsetChange(offset + 1);
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
                                        onOffsetChange && onOffsetChange(Math.max(0, offset - 1));
                                    }
                                }} disabled={timeRange !== 'CUSTOM' && offset === 0}>
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                            {(['2Q', 'YTD', '1Y', '3Y', '5Y', '10Y', 'MAX', 'CUSTOM'] as TimeRange[]).map(range => (
                                <button
                                    key={range}
                                    className={`time-btn ${timeRange === range ? 'active' : ''}`}
                                    onClick={() => setTimeRangeState(range)}
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
                            top: '32px',
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
                                            boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
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
                                            boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
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
                            {timeRange === '2Q' || (timeRange === 'CUSTOM' && customStartQuarter === customEndQuarter) ? (
                                <BarChart
                                    key={timeRange}
                                    data={chartData}
                                    margin={{ top: 10, right: 30, left: -10, bottom: 0 }}
                                >
                                    <CartesianGrid vertical={false} stroke="#334155" strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="date"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                                        tickFormatter={(val) => {
                                            const d = new Date(val);
                                            const q = Math.floor(d.getMonth() / 3) + 1;
                                            const year = d.getFullYear().toString().slice(2);
                                            return `Q${q} '${year}`;
                                        }}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                        tickFormatter={(val) => (val / 1e6).toFixed(0)}
                                    />
                                    <Tooltip content={<CustomTooltip allKeys={allKeys} />} cursor={{ fill: '#1e293b', opacity: 0.5 }} />
                                    {allKeys.map((key, index) => (
                                        <Bar
                                            key={key}
                                            name={keyToNameMap[key] || key}
                                            dataKey={key}
                                            stackId="a"
                                            fill={COLORS[index % COLORS.length]}
                                            stroke={COLORS[index % COLORS.length]}
                                            fillOpacity={0.8}
                                        />
                                    ))}
                                </BarChart>
                            ) : (
                                <AreaChart
                                    key={timeRange}
                                    data={chartData}
                                    margin={{ top: 10, right: 30, left: -10, bottom: 0 }}
                                >
                                    <CartesianGrid vertical={false} stroke="#334155" strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="date"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                                        tickFormatter={(val) => {
                                            const d = new Date(val);
                                            const q = Math.floor(d.getMonth() / 3) + 1;
                                            const year = d.getFullYear().toString().slice(2);
                                            return `Q${q} '${year}`;
                                        }}
                                        minTickGap={20}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                        tickFormatter={(val) => (val / 1e6).toFixed(0)}
                                    />
                                    <Tooltip content={<CustomTooltip allKeys={allKeys} />} isAnimationActive={false} />
                                    {allKeys.map((key, index) => (
                                        <Area
                                            key={key}
                                            name={keyToNameMap[key] || key}
                                            type="monotone"
                                            dataKey={key}
                                            stackId="1"
                                            stroke={COLORS[index % COLORS.length]}
                                            fill={COLORS[index % COLORS.length]}
                                            fillOpacity={0.7}
                                            strokeWidth={0}
                                            animationDuration={400}
                                        />
                                    ))}
                                </AreaChart>
                            )}
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className={`holdings-list-panel-v2 ${hideChart ? 'full-height' : ''}`}>
                <div className="panel-title-v2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                        Holdings Details ({deltaMode === 'period'
                            ? `vs ${baseDateFormatted}`
                            : (() => {
                                // Calculate previous quarter label
                                const d = new Date(basePeriodDate); // NOTE: basePeriodDate is based on filtered sorted periods.
                                // Actually, for 'Quarter' mode, "Last Quarter" implies the one immediately preceding the LATEST date in view.
                                // We need the date before the latest.
                                // The Chart uses 'latestPeriodDate'.
                                // Using the sorted periods logic from above without reconstructing it fully is tricky unless we hoist it.
                                // BUT, we can just approximate or find it.
                                // Better: hoist sortedPeriods or use the 'data' to find previous.
                                // Let's try to infer from data.
                                // We are inside Component scope. We have `allKeys` and `tableHoldings`.
                                // tableHoldings keys off CURRENT data.
                                // Let's use latest date and subtract 3 months? Or check data?
                                if (!tableHoldings.length) return 'Last Quarter';
                                // tableHoldings[0] has period_of_report which is the CURRENT (latest) date.
                                const latestDateStr = tableHoldings[0].period_of_report;
                                const latestD = new Date(latestDateStr);
                                const prevD = new Date(latestD);
                                prevD.setMonth(prevD.getMonth() - 3);
                                const q = Math.floor(prevD.getMonth() / 3) + 1;
                                return `vs Q${q} '${prevD.getFullYear().toString().slice(2)}`;
                            })()
                        })
                    </span>
                    <div style={{ display: 'flex', gap: '4px', fontSize: '11px' }}>
                        <button
                            onClick={() => setDeltaMode('period')}
                            style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: 'none',
                                background: deltaMode === 'period' ? '#3b82f6' : '#e2e8f0',
                                color: deltaMode === 'period' ? 'white' : '#64748b',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}
                        >
                            Period
                        </button>
                        <button
                            onClick={() => setDeltaMode('quarter')}
                            style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: 'none',
                                background: deltaMode === 'quarter' ? '#3b82f6' : '#e2e8f0',
                                color: deltaMode === 'quarter' ? 'white' : '#64748b',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}
                        >
                            Quarter
                        </button>
                    </div>
                </div>

                {/* Search Box */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '0 4px' }}>
                    <Search size={16} style={{ color: '#94a3b8' }} />
                    <input
                        type="text"
                        placeholder="Search companies..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontSize: '13px',
                            outline: 'none'
                        }}
                    />
                </div>

                <div className="table-scroll-v2">
                    <table className="dashboard-table-v2">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}>Color</th>
                                {onToggleTicker && (
                                    <th style={{ width: '40px', cursor: 'pointer' }} onClick={() => handleSort('comp')}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                            Comp {renderSortIcon('comp')}
                                        </div>
                                    </th>
                                )}
                                <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        Ticker / Name {renderSortIcon('name')}
                                    </div>
                                </th>
                                <th className="text-right" style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('shares')}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                        Shares {renderSortIcon('shares')}
                                    </div>
                                </th>
                                <th className="text-right" style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('value')}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                        Value ($M) {renderSortIcon('value')}
                                    </div>
                                </th>
                                {showIRR && (
                                    <>
                                        <th className="text-right" style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('pnl')}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                Est. PnL {renderSortIcon('pnl')}
                                            </div>
                                        </th>
                                        <th className="text-right" style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('roi')}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                Est. ROI % {renderSortIcon('roi')}
                                            </div>
                                        </th>
                                        <th className="text-right" style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('irr')}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                Est. IRR % {renderSortIcon('irr')}
                                            </div>
                                        </th>
                                    </>
                                )}
                                <th className="text-right" style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('percent')}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                        % Port. {renderSortIcon('percent')}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {tableHoldings
                                .filter((h) => {
                                    if (!searchTerm) return true;
                                    const term = searchTerm.toLowerCase();
                                    return (
                                        (h.issuer_name && h.issuer_name.toLowerCase().includes(term)) ||
                                        (h.ticker && h.ticker.toLowerCase().includes(term)) ||
                                        (h.cusip && h.cusip.toLowerCase().includes(term))
                                    );
                                })
                                .sort((a, b) => {
                                    let aVal: any, bVal: any;
                                    switch (sortField) {
                                        case 'comp':
                                            aVal = selectedTickers.has(a.label) ? 1 : 0;
                                            bVal = selectedTickers.has(b.label) ? 1 : 0;
                                            break;
                                        case 'name':
                                            aVal = (a.ticker || a.issuer_name || '').toLowerCase();
                                            bVal = (b.ticker || b.issuer_name || '').toLowerCase();
                                            break;
                                        case 'shares':
                                            aVal = a.currentShares || 0;
                                            bVal = b.currentShares || 0;
                                            break;
                                        case 'value':
                                            aVal = a.currentValue || 0;
                                            bVal = b.currentValue || 0;
                                            break;
                                        case 'pnl':
                                            aVal = a.pnl || 0;
                                            bVal = b.pnl || 0;
                                            break;
                                        case 'roi':
                                            aVal = a.totalReturn || 0;
                                            bVal = b.totalReturn || 0;
                                            break;
                                        case 'irr':
                                            aVal = a.irr || 0;
                                            bVal = b.irr || 0;
                                            break;
                                        case 'percent':
                                            aVal = a.portfolioPercent || 0;
                                            bVal = b.portfolioPercent || 0;
                                            break;
                                        default:
                                            aVal = a.currentValue || 0;
                                            bVal = b.currentValue || 0;
                                    }
                                    if (typeof aVal === 'string') {
                                        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                                    }
                                    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
                                })
                                .map((h) => {
                                    const getColorForString = (str: string) => {
                                        let hash = 0;
                                        for (let i = 0; i < str.length; i++) {
                                            hash = str.charCodeAt(i) + ((hash << 5) - hash);
                                        }
                                        return COLORS[Math.abs(hash) % COLORS.length];
                                    };
                                    const color = getColorForString(h.label);

                                    const renderDelta = (delta: number, isCurrency: boolean = false) => {
                                        if (delta === 0) return null;
                                        const isPositive = delta > 0;
                                        const colorClass = isPositive ? 'delta-positive' : 'delta-negative';
                                        const formatted = isCurrency ? (Math.abs(delta) / 1e6).toFixed(1) : Math.abs(delta).toLocaleString();
                                        return (
                                            <span className={`delta-tag ${colorClass}`}>
                                                ({isPositive ? '+' : '-'}{formatted})
                                            </span>
                                        );
                                    };

                                    const rowOpacity = h.isExited ? 0.4 : 1;
                                    const percent = h.portfolioPercent || 0;

                                    // Determine metrics to show based on mode
                                    const displayReturn = deltaMode === 'period' ? h.totalReturn : (h as any).totalReturnQoQ;
                                    const displayIrr = deltaMode === 'period' ? h.irr : (h as any).irrQoQ;
                                    const returnLabel = deltaMode === 'period' ? 'CUMULATIVE RETURN' : 'QoQ RETURN';
                                    const irrLabel = deltaMode === 'period' ? 'ANNUALIZED IRR' : 'ANNUALIZED QoQ IRR';

                                    return (
                                        <tr key={`${h.id}-${h.period_of_report}`} className="history-trigger-row">
                                            <td>
                                                <div style={{ opacity: rowOpacity }}>
                                                    <div className="sector-color-box" style={{ backgroundColor: color }}></div>
                                                </div>
                                            </td>
                                            {onToggleTicker && (
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => onToggleTicker(h.label)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: selectedTickers.has(h.label) ? '#3b82f6' : '#94a3b8', padding: 4 }}
                                                    >
                                                        {selectedTickers.has(h.label) ? <CheckSquare size={16} /> : <Square size={16} />}
                                                    </button>
                                                </td>
                                            )}
                                            <td className="holding-name-cell">
                                                <div style={{ opacity: rowOpacity }}>
                                                    <div style={{ fontWeight: 700, color: '#334155', fontSize: '13px' }}>{h.issuer_name}</div>
                                                    <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '8px', marginTop: '2px' }}>
                                                        {h.ticker ? (
                                                            <span style={{ fontWeight: 600, color: '#475569' }}>{h.ticker}</span>
                                                        ) : (
                                                            <span>{h.cusip}</span>
                                                        )}
                                                        {h.put_call?.toUpperCase() === 'PUT' && <span style={{ fontSize: '9px', padding: '1px 4px', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.3)', verticalAlign: 'middle' }}>PUT</span>}
                                                        {h.put_call?.toUpperCase() === 'CALL' && <span style={{ fontSize: '9px', padding: '1px 4px', backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', borderRadius: '4px', border: '1px solid rgba(34, 197, 94, 0.3)', verticalAlign: 'middle' }}>CALL</span>}
                                                    </div>
                                                    {h.isExited && <span className="exited-badge"> (Exited)</span>}
                                                </div>

                                                <div className="history-popover">
                                                    <div className="history-title">History for {h.label}</div>
                                                    {showIRR && (
                                                        <div className="history-irr-section" style={{ padding: '8px 0', borderBottom: '1px solid #334155', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>{returnLabel}</span>
                                                                <span style={{ color: displayReturn >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                                                                    {displayReturn >= 0 ? '+' : ''}{displayReturn.toFixed(1)}%
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>{irrLabel}</span>
                                                                <span style={{ color: displayIrr >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                                                                    {displayIrr >= 0 ? '+' : ''}{displayIrr.toFixed(1)}%
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="history-events">
                                                        {h.history.map((event: any, idx: number) => {
                                                            // Handle summary item
                                                            if (event.type === 'summary') {
                                                                return (
                                                                    <div key={idx} className="history-event" style={{ fontStyle: 'italic', color: '#cbd5e1', fontSize: '10px', opacity: 0.8 }}>
                                                                        ...{event.removedCount} earlier trades
                                                                    </div>
                                                                );
                                                            }

                                                            const d = new Date(event.date);
                                                            const qLabel = isNaN(d.getTime()) ? event.date : `Q${Math.floor(d.getMonth() / 3) + 1} '${d.getFullYear().toString().slice(2)}`;

                                                            // Color coding based on event type
                                                            let eventColor = '#94a3b8'; // Default gray
                                                            if (event.type === 'Add' || event.type === 'Initial Buy' || event.type === 'Re-Entry') {
                                                                eventColor = '#10b981'; // Green for buys
                                                            } else if (event.type === 'Trim' || event.type === 'Full Exit') {
                                                                eventColor = '#ef4444'; // Red for sells
                                                            } else if (event.type === 'Peak Position') {
                                                                eventColor = '#f59e0b'; // Gold for peak
                                                            }

                                                            return (
                                                                <div key={idx} className="history-event">
                                                                    <span className="event-date">{qLabel}</span>
                                                                    <span style={{ color: eventColor, fontWeight: 600 }}>
                                                                        {event.type}:
                                                                    </span>
                                                                    <span className="event-detail">
                                                                        {event.shares ? `${event.shares.toLocaleString()} shrs` :
                                                                            event.value ? `$${(event.value / 1e6).toFixed(1)}M` :
                                                                                ''}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="text-right">
                                                <div style={{ opacity: rowOpacity }}>
                                                    {h.currentShares.toLocaleString()}
                                                    {renderDelta(deltaMode === 'period' ? h.deltaShares : h.deltaSharesQoQ)}
                                                </div>
                                            </td>
                                            <td className="text-right holding-value-cell">
                                                <div style={{ opacity: rowOpacity }}>
                                                    {(h.currentValue / 1e6).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                                    {renderDelta(deltaMode === 'period' ? h.deltaValue : h.deltaValueQoQ, true)}
                                                </div>
                                            </td>
                                            {showIRR && (
                                                <>
                                                    <td className="text-right">
                                                        <div style={{ opacity: rowOpacity, color: (deltaMode === 'period' ? h.pnl : h.pnlQoQ) >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                                            {formatCurrency(deltaMode === 'period' ? h.pnl : h.pnlQoQ)}
                                                        </div>
                                                    </td>
                                                    <td className="text-right">
                                                        <div style={{ opacity: rowOpacity, color: displayReturn >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                                            {displayReturn >= 0 ? '+' : ''}{displayReturn.toFixed(1)}%
                                                        </div>
                                                    </td>
                                                    <td className="text-right">
                                                        <div style={{ opacity: rowOpacity, color: displayIrr >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                                            {displayIrr >= 0 ? '+' : ''}{displayIrr.toFixed(1)}%
                                                        </div>
                                                    </td>
                                                </>
                                            )}
                                            <td className="text-right">
                                                <div className="percent-cell" style={{ opacity: rowOpacity }}>
                                                    <span className="percent-text">{percent.toFixed(2)}%</span>
                                                    <div className="percent-bar-bg">
                                                        <div
                                                            className="percent-bar-fill"
                                                            style={{ width: `${Math.min(percent, 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
