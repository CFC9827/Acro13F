import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, PlusCircle, MinusCircle, PlayCircle, Clock, ExternalLink, Download, List } from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { formatCurrency, HistoricalHolding } from './PortfolioChart';
import { calculateIRR } from '../utils/performanceUtils';
import { CsvExportModal } from './CsvExportModal';

interface HoldingsTableProps {
    history: HistoricalHolding[];
    fundName: string;
}

type SortField = 'name' | 'shares' | 'value' | 'percent' | 'pnl' | 'cap_allocation' | 'roi' | 'irr' | 'percent_delta' | 'price_delta';
type SortDirection = 'asc' | 'desc';

const getEdgarUrl = (cik?: string, accessionNumber?: string): string | undefined => {
    if (!cik || !accessionNumber) return undefined;
    const cleanCik = cik.replace(/^0+/, ''); // Remove leading zeros
    const cleanAcc = accessionNumber.replace(/-/g, ''); // Remove dashes

    // SEC pattern: accession number with dashes for the index file
    // e.g., 0000919574-25-007023-index.html
    const dashedAcc = accessionNumber.includes('-')
        ? accessionNumber
        : `${accessionNumber.slice(0, 10)}-${accessionNumber.slice(10, 12)}-${accessionNumber.slice(12)}`;

    return `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${cleanAcc}/${dashedAcc}-index.html`;
};

const StockHistoryChart: React.FC<{
    history: HistoricalHolding[],
    currentQuarter: string,
    ticker: string,
    issuerName: string,
    allQuarters?: string[],
    selectableQuarters?: string[]
}> = ({ history, currentQuarter, ticker, issuerName, allQuarters = [], selectableQuarters = [] }) => {
    const [priceHistory, setPriceHistory] = useState<{ date: string, price: number }[]>([]);
    const [fetchingPrices, setFetchingPrices] = useState(false);
    const [activeActionIndex, setActiveActionIndex] = useState<number | null>(null);
    const [hoveredData, setHoveredData] = useState<any>(null);

    // Container ref for measuring width
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(800); // Default width

    // Measure container width on mount and resize
    useEffect(() => {
        const updateWidth = () => {
            if (chartContainerRef.current) {
                setContainerWidth(chartContainerRef.current.offsetWidth);
            }
        };
        updateWidth();
        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, []);

    useEffect(() => {
        if (ticker) {
            setFetchingPrices(true);
            // Fetch starting from 60 days before the earliest 13F quarter (to show pre-buy context)
            const sorted13F = [...(allQuarters || selectableQuarters || (history as any[]))]
                .sort((a: any, b: any) => {
                    const dateA = typeof a === 'string' ? a : a.period_of_report;
                    const dateB = typeof b === 'string' ? b : b.period_of_report;
                    return new Date(dateA).getTime() - new Date(dateB).getTime();
                });

            let startStr: string | undefined;
            if (sorted13F.length > 0) {
                const earliest = sorted13F[0] as any;
                const earliestDate = new Date(typeof earliest === 'string' ? earliest : earliest.period_of_report);
                earliestDate.setDate(earliestDate.getDate() - 120); // 4 months before first filing
                startStr = earliestDate.toISOString().split('T')[0];
            }

            fetch(`/api/prices/${ticker}${startStr ? `?start=${startStr}` : ''}`)
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setPriceHistory(data);
                    }
                })
                .catch(err => console.error("Failed to fetch price history", err))
                .finally(() => setFetchingPrices(false));
        }
    }, [ticker, history.length]); // Re-fetch if ticker or history length changes (might have new older quarters)

    const chartData = useMemo(() => {
        const sortedHistory = [...history]
            .sort((a, b) => new Date(a.period_of_report).getTime() - new Date(b.period_of_report).getTime());

        // If we have high-res price history, use it as the base
        if (priceHistory.length > 0) {
            // Map 13F filings to actions
            const filingActions: { date: string, action: string, actionColor: string, prevDate?: string, intendedDate?: string }[] = [];

            sortedHistory.forEach((h, i) => {
                const prevH = sortedHistory[i - 1];
                const nextH = sortedHistory[i + 1];
                const shareChange = prevH ? h.shares - prevH.shares : h.shares;

                // Check if there's a gap BEFORE this record (indicates re-entry)
                let hasGapBefore = false;
                if (prevH) {
                    const prevDate = new Date(prevH.period_of_report);
                    const curDate = new Date(h.period_of_report);
                    const daysDiff = (curDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
                    hasGapBefore = daysDiff > 100;
                }

                // Check if there's a gap AFTER this record (indicates exit happened after this quarter)
                let hasGapAfter = false;
                if (nextH) {
                    const curDate = new Date(h.period_of_report);
                    const nextDate = new Date(nextH.period_of_report);
                    const daysDiff = (nextDate.getTime() - curDate.getTime()) / (1000 * 60 * 60 * 24);
                    hasGapAfter = daysDiff > 100;
                }

                let action = 'HOLD';
                if (!prevH && h.shares > 0) action = 'NEW';
                else if (prevH && prevH.shares === 0 && h.shares > 0) action = 'NEW';
                else if (hasGapBefore && h.shares > 0) action = 'NEW'; // Re-entry after gap = NEW position
                else if (prevH && h.shares === 0 && prevH.shares > 0) action = 'EXIT';
                else if (shareChange > 0) action = 'ADD';
                else if (shareChange < 0) action = 'TRIM';

                let actionColor = 'transparent';
                if (action === 'NEW' || action === 'ADD') actionColor = '#34d399';
                else if (action === 'TRIM' || action === 'EXIT') actionColor = '#f87171';

                let prevDate = prevH?.period_of_report;

                // If this is a NEW position, try to find the previous quarter in the GLOBAL timeline
                if (action === 'NEW' && allQuarters.length > 0) {
                    const curQIdx = allQuarters.indexOf(h.period_of_report);
                    if (curQIdx < allQuarters.length - 1) {
                        prevDate = allQuarters[curQIdx + 1];
                    }
                }

                filingActions.push({
                    date: h.period_of_report,
                    intendedDate: h.period_of_report,
                    action,
                    actionColor,
                    prevDate: action === 'NEW' ? prevDate : (prevH ? prevH.period_of_report : undefined)
                });

                // If exited, add explicit EXIT marker at the end of the next quarter
                if (hasGapAfter && h.shares > 0) {
                    // Use UTC to avoid timezone shifts (e.g. Mar 31 becoming Apr 1)
                    const exitDate = new Date(h.period_of_report + 'T12:00:00Z');
                    // Move to the exact end of the next quarter (e.g., Mar 31 -> Jun 30)
                    exitDate.setUTCMonth(exitDate.getUTCMonth() + 4, 0);
                    const isoDate = exitDate.toISOString().split('T')[0];
                    filingActions.push({
                        date: isoDate,
                        intendedDate: isoDate,
                        action: 'EXIT',
                        actionColor: '#f87171',
                        prevDate: h.period_of_report
                    });
                }
                // NOTE: Removed synthetic exit for last record > 100 days old.
                // If the position is in the latest filing with shares > 0, it's still held.
                // We should NOT create synthetic exits - the next 13F just hasn't been filed.
            });

            // Create a lookup for actions by date
            // Since 13F quarter-end dates may fall on weekends/holidays, find the closest price date
            const actionMap = new Map<string, { action: string, actionColor: string, prevDate?: string, intendedDate?: string }>();

            filingActions.forEach(a => {
                const filingTime = new Date(a.date).getTime();
                let closestPriceDate = '';
                let minDiff = Infinity;

                // Find the closest price date within 5 days
                for (const p of priceHistory) {
                    const diff = Math.abs(new Date(p.date).getTime() - filingTime);
                    if (diff < minDiff && diff <= 5 * 24 * 60 * 60 * 1000) { // Within 5 days
                        minDiff = diff;
                        closestPriceDate = p.date;
                    }
                }

                if (closestPriceDate) {
                    actionMap.set(closestPriceDate, {
                        action: a.action,
                        actionColor: a.actionColor,
                        prevDate: a.prevDate,
                        intendedDate: (a as any).intendedDate // Map to the price point
                    });
                }
            });

            return priceHistory.map(p => {
                const actionData = actionMap.get(p.date) || { action: 'HOLD', actionColor: 'transparent', intendedDate: undefined };
                const d = new Date(p.date + 'T12:00:00Z'); // Consistent UTC creation
                const q = Math.floor(d.getUTCMonth() / 3) + 1;
                const year = d.getUTCFullYear().toString().slice(2);

                return {
                    date: p.date,
                    time: d.getTime(),
                    value: p.price,
                    ...actionData,
                    displayDate: `Q${q} '${year}`
                };
            });
        }

        // Fallback to quarterly-only data if priceHistory not available
        // Normalize prices backwards for splits
        const normalizedPrices = new Array(sortedHistory.length).fill(0);
        let cumulativeSplitFactor = 1;

        for (let i = sortedHistory.length - 1; i >= 0; i--) {
            const h = sortedHistory[i];
            const newer = sortedHistory[i + 1];

            let rawPrice = h.shares > 0 ? h.value / h.shares : 0;

            if (newer) {
                const newerRawPrice = newer.shares > 0 ? newer.value / newer.shares : 0;
                const shareRatio = h.shares > 0 ? newer.shares / h.shares : 1;
                const priceRatio = rawPrice > 0 ? newerRawPrice / rawPrice : 1;
                const valueRatio = h.value > 0 ? newer.value / h.value : 1;

                if (shareRatio > 1.4 && priceRatio < 0.72 && valueRatio > 0.5 && valueRatio < 2.5) {
                    cumulativeSplitFactor *= shareRatio;
                }
            }
            normalizedPrices[i] = rawPrice / cumulativeSplitFactor;
        }

        return sortedHistory.map((h, i) => {
            const prevH = sortedHistory[i - 1];
            const shareChange = prevH ? h.shares - prevH.shares : h.shares;

            let action = 'HOLD';
            if (!prevH && h.shares > 0) action = 'NEW';
            else if (prevH && prevH.shares === 0 && h.shares > 0) action = 'NEW';
            else if (prevH && h.shares === 0 && prevH.shares > 0) action = 'EXIT';
            else if (shareChange > 0) action = 'ADD';
            else if (shareChange < 0) action = 'TRIM';

            let actionColor = 'transparent';
            if (action === 'NEW' || action === 'ADD') actionColor = '#34d399';
            else if (action === 'TRIM' || action === 'EXIT') actionColor = '#f87171';

            return {
                date: h.period_of_report,
                time: new Date(h.period_of_report).getTime(),
                value: normalizedPrices[i],
                action,
                actionColor,
                prevDate: prevH?.period_of_report,
                displayDate: (() => {
                    const d = new Date(h.period_of_report);
                    const q = Math.floor(d.getMonth() / 3) + 1;
                    const year = d.getFullYear().toString().slice(2);
                    return `Q${q} '${year}`;
                })()
            };
        });
    }, [history, priceHistory]);

    // Find closest price date for the VIEW reference line (quarter end may fall on weekend)
    const closestViewDate = useMemo(() => {
        if (!currentQuarter || chartData.length === 0) return null;

        const targetTime = new Date(currentQuarter).getTime();
        let closest = chartData[0].time;
        let minDiff = Infinity;

        for (const d of chartData) {
            const diff = Math.abs(d.time - targetTime);
            if (diff < minDiff) {
                minDiff = diff;
                closest = d.time;
            }
        }

        return closest;
    }, [currentQuarter, chartData]);

    // Time range toggle
    type TimeRange = 'YTD' | '1Y' | '3Y' | '5Y' | '10Y' | 'CUSTOM' | 'ALL';
    const [timeRange, setTimeRange] = useState<TimeRange>('ALL');

    // Custom range selection
    const availableQuarters = useMemo(() => {
        // Use provided selectableQuarters if available (excludes extra context quarters)
        if (selectableQuarters && selectableQuarters.length > 0) {
            return selectableQuarters;
        }
        // Fallback to allQuarters if selectableQuarters not provided
        if (allQuarters && allQuarters.length > 0) {
            return allQuarters;
        }
        const quarters = Array.from(new Set(history.map(h => h.period_of_report)))
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        return quarters;
    }, [history, allQuarters, selectableQuarters]);

    const [customStartQuarter, setCustomStartQuarter] = useState<string>('');
    const [customEndQuarter, setCustomEndQuarter] = useState<string>('');
    const [showStartDropdown, setShowStartDropdown] = useState(false);
    const [showEndDropdown, setShowEndDropdown] = useState(false);

    // Initialize custom quarters when available
    useEffect(() => {
        if (availableQuarters.length > 0) {
            const startValid = availableQuarters.includes(customStartQuarter);
            const endValid = availableQuarters.includes(customEndQuarter);

            if (!startValid || !endValid) {
                setCustomStartQuarter(availableQuarters[availableQuarters.length - 1]);
                setCustomEndQuarter(availableQuarters[0]);
            }
        }
    }, [availableQuarters, customStartQuarter, customEndQuarter]);

    // Offset in days for panning through time (0 = most recent)
    const [dateOffset, setDateOffset] = useState(0);

    // Reset offset when time range changes
    useEffect(() => {
        setDateOffset(0);
    }, [timeRange]);

    // Calculate max offset based on available data and window size
    const maxOffset = useMemo(() => {
        if (timeRange === 'ALL' || timeRange === 'CUSTOM' || chartData.length === 0) return 0;

        const now = new Date();
        const earliest = new Date(chartData[0].date);
        const windowDays = {
            'YTD': Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (24 * 60 * 60 * 1000)),
            '1Y': 365,
            '3Y': 365 * 3,
            '5Y': 365 * 5,
            '10Y': 365 * 10
        }[timeRange] || 365;

        const totalDays = Math.floor((now.getTime() - earliest.getTime()) / (24 * 60 * 60 * 1000));
        return Math.max(0, totalDays - windowDays);
    }, [timeRange, chartData]);

    const canPanBack = dateOffset < maxOffset;
    const canPanForward = dateOffset > 0;

    const handlePanBack = useCallback(() => {
        setDateOffset(prev => Math.min(prev + 90, maxOffset)); // Shift 90 days (quarter) at a time
    }, [maxOffset]);

    const handlePanForward = useCallback(() => {
        setDateOffset(prev => Math.max(prev - 90, 0));
    }, []);

    const filteredChartData = useMemo(() => {
        if (timeRange === 'ALL' || chartData.length === 0) return chartData;

        const now = new Date();
        // Apply date offset for panning
        const offsetNow = new Date(now.getTime() - dateOffset * 24 * 60 * 60 * 1000);
        let cutoffDate: Date;
        let endDate: Date = offsetNow; // End of visible window

        switch (timeRange) {
            case '1Y':
                cutoffDate = new Date(offsetNow.getFullYear() - 1, offsetNow.getMonth(), offsetNow.getDate());
                break;
            case '3Y':
                cutoffDate = new Date(offsetNow.getFullYear() - 3, offsetNow.getMonth(), offsetNow.getDate());
                break;
            case '5Y':
                cutoffDate = new Date(offsetNow.getFullYear() - 5, offsetNow.getMonth(), offsetNow.getDate());
                break;
            case '10Y':
                cutoffDate = new Date(offsetNow.getFullYear() - 10, offsetNow.getMonth(), offsetNow.getDate());
                break;
            case 'YTD':
                cutoffDate = new Date(offsetNow.getFullYear(), 0, 1); // Jan 1 of the offset year
                break;
            case 'CUSTOM':
                if (customStartQuarter && customEndQuarter) {
                    // Start is the BEGINNING of the start quarter (3 months before the filing date)
                    const startFilingDate = new Date(customStartQuarter);
                    const start = new Date(startFilingDate.getFullYear(), startFilingDate.getMonth() - 3, startFilingDate.getDate() + 1);
                    const end = new Date(customEndQuarter);

                    const isLatest = customEndQuarter === availableQuarters[0];

                    const filtered = chartData.filter(d => {
                        const date = new Date(d.date).getTime();
                        return date >= start.getTime() && (isLatest ? true : date <= end.getTime());
                    });

                    // If still empty (e.g. range is in the future relative to prices), fallback
                    return filtered.length > 0 ? filtered : chartData.slice(-30);
                }
                return chartData;
            default:
                return chartData;
        }

        // Filter by both cutoff (start) and end date when panning
        const filtered = chartData.filter(d => {
            const date = new Date(d.date);
            return date >= cutoffDate && (dateOffset === 0 ? true : date <= endDate);
        });

        // Fallback for YTD if data is sparse (e.g. at the start of the year)
        if (timeRange === 'YTD' && filtered.length < 5 && chartData.length > 5) {
            // Show last 90 days instead to ensure some data is visible
            const fallbackCutoff = new Date(offsetNow.getFullYear(), offsetNow.getMonth(), offsetNow.getDate() - 90);
            const fallbackFiltered = chartData.filter(d => new Date(d.date) >= fallbackCutoff);
            return fallbackFiltered.length > 0 ? fallbackFiltered : chartData.slice(-90);
        }

        return filtered.length > 0 ? filtered : chartData.slice(-90);
    }, [timeRange, chartData, customStartQuarter, customEndQuarter, dateOffset, availableQuarters]);

    // Calculate the "official" start price for cumulative return
    const anchorPrice = useMemo(() => {
        if (filteredChartData.length === 0) return null;

        let officialStartDate: string | null = null;
        const sortedHistory = [...history].sort((a, b) => new Date(a.period_of_report).getTime() - new Date(b.period_of_report).getTime());

        if (timeRange === 'ALL' && sortedHistory.length > 0) {
            officialStartDate = sortedHistory[0].period_of_report;
        } else if (timeRange === 'CUSTOM' && customStartQuarter) {
            // Anchor at the BEGINNING of the start quarter
            const startFilingDate = new Date(customStartQuarter);
            const start = new Date(startFilingDate.getFullYear(), startFilingDate.getMonth() - 3, startFilingDate.getDate() + 1);
            officialStartDate = start.toISOString().split('T')[0];
        }

        if (officialStartDate) {
            // Find the point in filteredChartData closest to this official start
            const targetTime = new Date(officialStartDate).getTime();
            let closest = filteredChartData[0];
            let minDiff = Infinity;
            for (const d of filteredChartData) {
                const diff = Math.abs(new Date(d.date).getTime() - targetTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = d;
                }
            }
            return closest.value;
        }

        // Default to first point of current view
        return filteredChartData[0]?.value || null;
    }, [filteredChartData, timeRange, history, customStartQuarter]);

    const actionPoints = useMemo(() => filteredChartData.filter(d => d.action !== 'HOLD'), [filteredChartData]);
    const [jumpIndex, setJumpIndex] = useState<number>(-1);

    // Compute unique quarter ticks for X-axis (one tick per quarter, with smart spacing for long histories)
    const uniqueQuarterTicks = useMemo(() => {
        if (filteredChartData.length === 0) return [];

        const startTimestamp = filteredChartData[0].time;
        const endTimestamp = filteredChartData[filteredChartData.length - 1].time;

        // 1. Generate perfect quarter-END boundaries (Mar 31, Jun 30, Sep 30, Dec 31)
        const allPossibleTicks: number[] = [];
        const curr = new Date(startTimestamp);
        // Use UTC to avoid timezone ghosts
        curr.setUTCHours(12, 0, 0, 0);
        // Standardize to end of its current quarter
        curr.setUTCMonth((Math.floor(curr.getUTCMonth() / 3) + 1) * 3, 0);

        // Walk backwards to earliest possible tick to ensure coverage
        const walk = new Date(curr);
        while (walk.getTime() >= startTimestamp) {
            allPossibleTicks.unshift(walk.getTime());
            walk.setUTCMonth(walk.getUTCMonth() - 2, 0); // Jump back to end of previous quarter
            walk.setUTCHours(12, 0, 0, 0);
        }

        // Walk forwards to endTimestamp
        walk.setTime(curr.getTime());
        walk.setUTCMonth(walk.getUTCMonth() + 4, 0); // Next quarter end
        while (walk.getTime() <= endTimestamp) {
            allPossibleTicks.push(walk.getTime());
            walk.setUTCMonth(walk.getUTCMonth() + 4, 0);
            walk.setUTCHours(12, 0, 0, 0);
        }

        const sortedUniqueTicks = Array.from(new Set(allPossibleTicks)).sort((a, b) => a - b);

        // 2. Dynamic step size to fit container width (each label needs ~60px)
        const tickWidth = 60;
        const maxTicks = Math.max(4, Math.floor(containerWidth / tickWidth));

        if (sortedUniqueTicks.length <= maxTicks) {
            return sortedUniqueTicks;
        }

        let step = 1;
        const roundSteps = [1, 2, 4, 8, 12, 16, 20, 24, 40];
        for (const s of roundSteps) {
            if (Math.ceil(sortedUniqueTicks.length / s) <= maxTicks) {
                step = s;
                break;
            }
        }

        const sparseTicks: number[] = [];
        // Ensure most recent quarter is always labeled
        for (let i = sortedUniqueTicks.length - 1; i >= 0; i -= step) {
            sparseTicks.unshift(sortedUniqueTicks[i]);
        }

        return sparseTicks;
    }, [filteredChartData, containerWidth]);

    const xDomain = useMemo(() => {
        if (uniqueQuarterTicks.length === 0) return ['dataMin', 'dataMax'];
        // Ensure domain covers all ticks and data points
        const minTick = uniqueQuarterTicks[0];
        const maxTick = uniqueQuarterTicks[uniqueQuarterTicks.length - 1];
        const minData = filteredChartData[0]?.time || 0;
        const maxData = filteredChartData[filteredChartData.length - 1]?.time || 0;

        return [Math.min(minTick, minData), Math.max(maxTick, maxData)];
    }, [uniqueQuarterTicks, filteredChartData]);

    // Helper to determine if a point on the chart is within a trade interval being hovered
    const isPointInTradeInterval = useCallback((pointDate: string) => {
        if (!hoveredData || hoveredData.action === 'HOLD' || !hoveredData.prevDate) return false;

        const pt = new Date(pointDate).getTime();
        const start = new Date(hoveredData.prevDate).getTime();
        const end = new Date(hoveredData.date).getTime();

        return pt >= start && pt <= end;
    }, [hoveredData]);

    // Create a lookup for action details from the original history data
    const actionDetailsMap = useMemo(() => {
        const map = new Map<string, { shareChange: number, valueChange: number, portfolioChange: number }>();
        const sortedHistory = [...history].sort((a, b) =>
            new Date(a.period_of_report).getTime() - new Date(b.period_of_report).getTime()
        );

        sortedHistory.forEach((h, i) => {
            const prevH = sortedHistory[i - 1];
            const nextH = sortedHistory[i + 1];

            // Check if there is a gap before this record (re-entry)
            let effectivePrevH: HistoricalHolding | undefined = prevH;
            if (prevH) {
                const prevDate = new Date(prevH.period_of_report);
                const curDate = new Date(h.period_of_report);
                const daysDiff = (curDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
                if (daysDiff > 100) {
                    effectivePrevH = undefined; // Treat as new position, ignore previous holding
                }
            }

            const shareChange = effectivePrevH ? h.shares - effectivePrevH.shares : h.shares;
            const valueChange = effectivePrevH ? h.value - effectivePrevH.value : h.value;
            const portfolioChange = effectivePrevH ? (h.percent_portfolio || 0) - (effectivePrevH.percent_portfolio || 0) : (h.percent_portfolio || 0);

            map.set(h.period_of_report, {
                shareChange,
                valueChange,
                portfolioChange
            });

            // Check for synthetic exits - only for HISTORICAL gaps, not for current holdings
            // A gap means there's a nextH record and the gap between them is >100 days
            let hasGapAfter = false;

            if (nextH) {
                const curDate = new Date(h.period_of_report);
                const nextDate = new Date(nextH.period_of_report);
                const daysDiff = (nextDate.getTime() - curDate.getTime()) / (1000 * 60 * 60 * 24);
                hasGapAfter = daysDiff > 100;
            }
            // NOTE: Removed isLateExit check - if the position is in the latest filing,
            // it's still held. We should NOT create synthetic exits for current holdings.

            if (hasGapAfter && h.shares > 0) {
                const exitDate = new Date(h.period_of_report);
                exitDate.setDate(exitDate.getDate() + 45);
                const exitDateStr = exitDate.toISOString().split('T')[0];

                map.set(exitDateStr, {
                    shareChange: -h.shares,
                    valueChange: -h.value,
                    portfolioChange: -(h.percent_portfolio || 0)
                });
            }
        });

        return map;
    }, [history]);

    // Get action details for hovered data point (find closest match within 5 days)
    const getActionDetails = (dateStr: string) => {
        // Try exact match first
        if (actionDetailsMap.has(dateStr)) {
            return actionDetailsMap.get(dateStr);
        }
        // Try to find closest match within 5 days
        const targetTime = new Date(dateStr).getTime();
        for (const [filingDate, details] of actionDetailsMap) {
            const diff = Math.abs(new Date(filingDate).getTime() - targetTime);
            if (diff <= 5 * 24 * 60 * 60 * 1000) {
                return details;
            }
        }
        return null;
    };

    // Helper to format date as quarter
    const formatQuarter = (dateStr: string) => {
        const d = new Date(dateStr);
        const q = Math.floor(d.getMonth() / 3) + 1;
        const year = d.getFullYear().toString().slice(2);
        return `${q}Q '${year}`;
    };

    if (filteredChartData.length < 2) return null;

    const handleNextAction = () => {
        const next = jumpIndex + 1;
        if (next < actionPoints.length) {
            setJumpIndex(next);
            const idx = filteredChartData.findIndex(d => d.date === actionPoints[next].date);
            setActiveActionIndex(idx);
            setHoveredData(filteredChartData[idx]);
        }
    };

    const handlePrevAction = () => {
        const prev = jumpIndex - 1;
        if (prev >= 0) {
            setJumpIndex(prev);
            const idx = filteredChartData.findIndex(d => d.date === actionPoints[prev].date);
            setActiveActionIndex(idx);
            setHoveredData(filteredChartData[idx]);
        }
    };

    return (
        <div ref={chartContainerRef} style={{ width: '100%', height: '260px', marginBottom: '48px', position: 'relative' }}>
            {/* Chart Header & Legend Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                }}>
                    Adjusted Price History ($)
                </div>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    {/* Pan Controls - Show for time ranges except ALL and CUSTOM */}
                    {timeRange !== 'ALL' && timeRange !== 'CUSTOM' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                            <button
                                onClick={(e) => { e.stopPropagation(); handlePanBack(); }}
                                disabled={!canPanBack}
                                style={{ background: 'none', border: 'none', color: canPanBack ? '#60a5fa' : '#475569', cursor: canPanBack ? 'pointer' : 'default', padding: '0 2px', display: 'flex', alignItems: 'center' }}
                                title="Pan back in time"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>
                                {dateOffset > 0 ? `-${Math.floor(dateOffset / 30)}m` : 'NOW'}
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); handlePanForward(); }}
                                disabled={!canPanForward}
                                style={{ background: 'none', border: 'none', color: canPanForward ? '#60a5fa' : '#475569', cursor: canPanForward ? 'pointer' : 'default', padding: '0 2px', display: 'flex', alignItems: 'center' }}
                                title="Pan forward in time"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    )}
                    {/* Time Range Toggles */}
                    <div style={{ display: 'flex', gap: '2px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '6px', padding: '2px' }}>
                        {(['YTD', '1Y', '3Y', '5Y', '10Y', 'CUSTOM', 'ALL'] as const).map(range => (
                            <button
                                key={range}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (range === 'CUSTOM') {
                                        setTimeRange(prev => prev === 'CUSTOM' ? 'ALL' : 'CUSTOM');
                                    } else {
                                        setTimeRange(range);
                                    }
                                }}
                                style={{
                                    background: timeRange === range ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                                    border: timeRange === range ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid transparent',
                                    color: timeRange === range ? '#60a5fa' : '#64748b',
                                    fontSize: '9px',
                                    fontWeight: 600,
                                    padding: '3px 6px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                    {/* Legend */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#34d399' }}></div>
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>Buy/Add</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f87171' }}></div>
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>Sell/Trim</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Custom Range Selection Dropdowns */}
            {timeRange === 'CUSTOM' && (
                <div style={{
                    position: 'absolute',
                    top: '32px',
                    right: '0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: '#0f172a',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #1e293b',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    zIndex: 20
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>FROM:</span>
                        <div style={{ position: 'relative' }}>
                            <div
                                onClick={() => { setShowStartDropdown(!showStartDropdown); setShowEndDropdown(false); }}
                                style={{
                                    background: '#1e293b',
                                    border: '1px solid #334155',
                                    color: '#e2e8f0',
                                    fontSize: '10px',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    minWidth: '60px'
                                }}
                            >
                                {formatQuarter(customStartQuarter)}
                                <ChevronDown size={14} style={{ opacity: 0.6 }} />
                            </div>
                            {showStartDropdown && (
                                <div
                                    className="quarter-dropdown"
                                    style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: '0',
                                        marginTop: '4px',
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        borderRadius: '8px',
                                        padding: '4px',
                                        zIndex: 1000,
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
                                    }}
                                >
                                    {availableQuarters.map(q => (
                                        <div
                                            key={q}
                                            onClick={() => { setCustomStartQuarter(q); setShowStartDropdown(false); }}
                                            style={{
                                                padding: '8px 12px',
                                                cursor: 'pointer',
                                                borderRadius: '4px',
                                                fontSize: '13px',
                                                color: q === customStartQuarter ? '#38bdf8' : '#e2e8f0',
                                                backgroundColor: q === customStartQuarter ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                                                whiteSpace: 'nowrap'
                                            }}
                                            onMouseEnter={(e) => { if (q !== customStartQuarter) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                                            onMouseLeave={(e) => { if (q !== customStartQuarter) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                        >
                                            {formatQuarter(q)}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>TO:</span>
                        <div style={{ position: 'relative' }}>
                            <div
                                onClick={() => { setShowEndDropdown(!showEndDropdown); setShowStartDropdown(false); }}
                                style={{
                                    background: '#1e293b',
                                    border: '1px solid #334155',
                                    color: '#e2e8f0',
                                    fontSize: '10px',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    minWidth: '60px'
                                }}
                            >
                                {formatQuarter(customEndQuarter)}
                                <ChevronDown size={14} style={{ opacity: 0.6 }} />
                            </div>
                            {showEndDropdown && (
                                <div
                                    className="quarter-dropdown"
                                    style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: '0',
                                        marginTop: '4px',
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        borderRadius: '8px',
                                        padding: '4px',
                                        zIndex: 1000,
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
                                    }}
                                >
                                    {availableQuarters
                                        .filter(q => new Date(q).getTime() >= new Date(customStartQuarter).getTime())
                                        .map(q => (
                                            <div
                                                key={q}
                                                onClick={() => { setCustomEndQuarter(q); setShowEndDropdown(false); }}
                                                style={{
                                                    padding: '8px 12px',
                                                    cursor: 'pointer',
                                                    borderRadius: '4px',
                                                    fontSize: '13px',
                                                    color: q === customEndQuarter ? '#38bdf8' : '#e2e8f0',
                                                    backgroundColor: q === customEndQuarter ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                                                    whiteSpace: 'nowrap'
                                                }}
                                                onMouseEnter={(e) => { if (q !== customEndQuarter) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                                                onMouseLeave={(e) => { if (q !== customEndQuarter) e.currentTarget.style.backgroundColor = 'transparent'; }}
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


            {/* FIXED HUD INFO BAR */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                background: 'rgba(15, 23, 42, 0.4)',
                border: '1px solid rgba(51, 65, 85, 0.3)',
                borderRadius: '8px',
                padding: '8px 16px',
                marginBottom: '16px',
                minHeight: '40px'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: '150px' }}>
                    <span style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Period</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontSize: '13px', color: '#f1f5f9', fontWeight: 700, fontFamily: 'monospace' }}>
                            {hoveredData ? formatQuarter(hoveredData.date) : '-'}
                        </span>
                        {hoveredData && (
                            <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                                {hoveredData.date}
                            </span>
                        )}
                    </div>
                </div>

                {/* Price and Return */}
                <div style={{ display: 'flex', gap: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: '80px' }}>
                        <span style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Price</span>
                        <span style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace' }}>
                            {hoveredData ? `$${hoveredData.value.toFixed(2)}` : '-'}
                        </span>
                    </div>
                    {anchorPrice && hoveredData && (
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: '80px' }}>
                            <span style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Return</span>
                            <span style={{
                                fontSize: '13px',
                                color: (hoveredData.value / anchorPrice - 1) >= 0 ? '#34d399' : '#f87171',
                                fontWeight: 700,
                                fontFamily: 'monospace'
                            }}>
                                {(hoveredData.value / anchorPrice - 1) >= 0 ? '+' : ''}{((hoveredData.value / anchorPrice - 1) * 100).toFixed(1)}%
                            </span>
                        </div>
                    )}
                </div>

                {/* Action Tag and Details */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {hoveredData && hoveredData.action !== 'HOLD' ? (
                        <>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: `${hoveredData.actionColor}20`,
                                border: `1px solid ${hoveredData.actionColor}40`,
                                padding: '4px 12px',
                                borderRadius: '6px'
                            }}>
                                <span style={{ color: hoveredData.actionColor, fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>
                                    {hoveredData.action}
                                </span>
                            </div>
                            {/* Action Details from history lookup */}
                            {(() => {
                                const details = getActionDetails(hoveredData.date);
                                if (!details) return null;
                                return (
                                    <div style={{ display: 'flex', gap: '16px', fontSize: '11px' }}>
                                        <span style={{ color: '#94a3b8' }}>
                                            <span style={{ color: '#64748b' }}>Δ Shares:</span>{' '}
                                            <span style={{ color: details.shareChange >= 0 ? '#34d399' : '#f87171', fontWeight: 600 }}>
                                                {details.shareChange >= 0 ? '+' : ''}{details.shareChange.toLocaleString()}
                                            </span>
                                        </span>
                                        <span style={{ color: '#94a3b8' }}>
                                            <span style={{ color: '#64748b' }}>Δ Value:</span>{' '}
                                            <span style={{ color: details.valueChange >= 0 ? '#34d399' : '#f87171', fontWeight: 600 }}>
                                                {details.valueChange >= 0 ? '+' : '-'}{
                                                    Math.abs(details.valueChange) >= 1000000
                                                        ? `$${(Math.abs(details.valueChange) / 1000000).toFixed(1)}M`
                                                        : Math.abs(details.valueChange) >= 1000
                                                            ? `$${(Math.abs(details.valueChange) / 1000).toFixed(0)}K`
                                                            : `$${Math.abs(details.valueChange).toLocaleString()}`
                                                }
                                            </span>
                                        </span>
                                        <span style={{ color: '#94a3b8' }}>
                                            <span style={{ color: '#64748b' }}>Δ % Port:</span>{' '}
                                            <span style={{ color: details.portfolioChange >= 0 ? '#34d399' : '#f87171', fontWeight: 600 }}>
                                                {details.portfolioChange >= 0 ? '+' : ''}{details.portfolioChange.toFixed(2)}%
                                            </span>
                                        </span>
                                    </div>
                                );
                            })()}
                        </>
                    ) : hoveredData ? (
                        <span style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>No filing for this date</span>
                    ) : (
                        <span style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>Hover over chart to see details</span>
                    )}
                </div>

                {/* Navigation Controls */}
                <div style={{ display: 'flex', gap: '4px', padding: '2px 4px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); handlePrevAction(); }}
                        disabled={jumpIndex <= 0}
                        style={{ background: 'none', border: 'none', color: jumpIndex <= 0 ? '#475569' : '#60a5fa', cursor: jumpIndex <= 0 ? 'default' : 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center' }}
                        title="Previous Trade"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, minWidth: '45px', textAlign: 'center' }}>
                        {jumpIndex === -1 ? 'Trades' : `${jumpIndex + 1} / ${actionPoints.length}`}
                    </span>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleNextAction(); }}
                        disabled={jumpIndex >= actionPoints.length - 1}
                        style={{ background: 'none', border: 'none', color: jumpIndex >= actionPoints.length - 1 ? '#475569' : '#60a5fa', cursor: jumpIndex >= actionPoints.length - 1 ? 'default' : 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center' }}
                        title="Next Trade"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>
            <ResponsiveContainer width="100%" height="80%">
                <AreaChart
                    data={filteredChartData}
                    margin={{ top: 30, right: 10, left: -20, bottom: 0 }}
                    onMouseMove={(e) => {
                        if (e.activeTooltipIndex !== undefined) {
                            const idx = e.activeTooltipIndex;
                            const baseData = filteredChartData[idx];
                            // Search for nearby actions (+/- 7 days)
                            let nearestActionIdx = -1;
                            let minDistance = 999;

                            for (let i = Math.max(0, idx - 7); i <= Math.min(filteredChartData.length - 1, idx + 7); i++) {
                                if (filteredChartData[i].action !== 'HOLD') {
                                    const dist = Math.abs(i - idx);
                                    if (dist < minDistance) {
                                        minDistance = dist;
                                        nearestActionIdx = i;
                                    }
                                }
                            }

                            if (nearestActionIdx !== -1) {
                                setActiveActionIndex(nearestActionIdx);
                                const rawData = filteredChartData[nearestActionIdx];
                                setHoveredData({
                                    ...rawData,
                                    date: (rawData as any).intendedDate || rawData.date
                                });
                                const actionDate = rawData.date;
                                const jIdx = actionPoints.findIndex(ap => ap.date === actionDate);
                                if (jIdx !== -1) setJumpIndex(jIdx);
                            } else {
                                setActiveActionIndex(null);
                                setHoveredData(baseData);
                            }
                        }
                    }}
                    onMouseLeave={() => {
                        setActiveActionIndex(null);
                        setHoveredData(null);
                        setJumpIndex(-1);
                    }}
                >
                    <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#334155" strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                        dataKey="time"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        ticks={uniqueQuarterTicks}
                        interval={0}
                        scale="time"
                        type="number"
                        domain={xDomain}
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
                        domain={[0, (dataMax: number) => dataMax * 1.15]}
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        tickFormatter={(val) => {
                            if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
                            if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
                            if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
                            return val.toFixed(0);
                        }}
                    />
                    <RechartsTooltip content={() => null} />
                    <Area
                        type="linear"
                        dataKey="value"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorValue)"
                        isAnimationActive={false}
                        animationDuration={0}
                        dot={(props: any) => {
                            const { cx, cy, payload, index } = props;
                            if (payload.action === 'HOLD') return <g />;
                            const isSnapped = activeActionIndex !== null && filteredChartData[activeActionIndex]?.date === payload.date;
                            const isMajorAction = payload.action === 'NEW' || payload.action === 'EXIT';
                            const baseRadius = isMajorAction ? 5 : 3;
                            const radius = isSnapped ? baseRadius + 2 : baseRadius;
                            return (
                                <circle
                                    key={`dot-${payload.date}-${index}`}
                                    cx={cx}
                                    cy={cy - 12}
                                    r={radius}
                                    fill={payload.actionColor}
                                    stroke={isSnapped ? '#fff' : 'none'}
                                    strokeWidth={isSnapped ? 1.5 : 0}
                                    style={{ transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
                                />
                            );
                        }}
                    />
                    {hoveredData && hoveredData.action !== 'HOLD' && hoveredData.prevDate && (
                        <Area
                            type="linear"
                            dataKey={(d: any) => {
                                if (!hoveredData.prevDate) return null;
                                const curTime = new Date(d.date).getTime();
                                const endTime = new Date(hoveredData.date).getTime();
                                let startTime = new Date(hoveredData.prevDate).getTime();

                                // Limit highlight to roughly one quarter (~92 days)
                                // Standardizes "length" (width) across all action types
                                const maxLookback = 92 * 24 * 60 * 60 * 1000;
                                if (endTime - startTime > maxLookback) {
                                    startTime = endTime - maxLookback;
                                }

                                // Add a tiny buffer to include the boundary points
                                return (curTime >= startTime - 1000 && curTime <= endTime + 1000) ? d.value : null;
                            }}
                            stroke={hoveredData.actionColor}
                            strokeWidth={3}
                            fill={hoveredData.actionColor}
                            fillOpacity={0.15}
                            isAnimationActive={false}
                            dot={false}
                            connectNulls={false}
                        />
                    )}
                    {activeActionIndex !== null && filteredChartData[activeActionIndex] && (
                        <ReferenceLine
                            x={filteredChartData[activeActionIndex].time}
                            stroke={filteredChartData[activeActionIndex].actionColor}
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            opacity={0.8}
                        />
                    )}
                    {closestViewDate && (
                        <ReferenceLine
                            x={closestViewDate}
                            stroke="#fb7185"
                            strokeDasharray="3 3"
                            label={{ value: 'VIEW', position: 'insideTopRight', fill: '#fb7185', fontSize: 10, fontWeight: 700 }}
                        />
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export const HoldingsTable: React.FC<HoldingsTableProps> = ({ history, fundName }) => {
    // Helper to generate unique key for each position (including put_call to distinguish options)
    const getPositionKey = (h: HistoricalHolding) => {
        const baseKey = h.ticker || h.cusip;
        const putCall = (h as any).put_call;
        return putCall ? `${baseKey}:${putCall.toUpperCase()}` : baseKey;
    };

    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<SortField>('value');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [quarterIndex, setQuarterIndex] = useState(0); // 0 = latest
    const [showQuarterDropdown, setShowQuarterDropdown] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    // 1. Extract unique sorted quarters
    const sortedQuarters = useMemo(() => {
        const dates = new Set(history.map(h => h.period_of_report));
        return Array.from(dates).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [history]);

    // Track which quarters have amendments (13F-HR/A filings)
    const amendedQuarters = useMemo(() => {
        const amended = new Set<string>();
        history.forEach(h => {
            if (h.has_amendment) amended.add(h.period_of_report);
        });
        return amended;
    }, [history]);

    const currentQuarterDate = sortedQuarters[quarterIndex] || '';
    const currentQuarterHasAmendment = amendedQuarters.has(currentQuarterDate);

    // 2. Filter data for the selected quarter
    const currentQuarterData = useMemo(() => {
        if (!currentQuarterDate) return [];
        return history.filter(h => h.period_of_report === currentQuarterDate);
    }, [history, currentQuarterDate]);

    // 3. Previous Quarter Data for Deltas
    const previousQuarterDate = sortedQuarters[quarterIndex + 1];
    const previousQuarterData = useMemo(() => {
        if (!previousQuarterDate) return [];
        return history.filter(h => h.period_of_report === previousQuarterDate);
    }, [history, previousQuarterDate]);

    const prevHoldingMap = useMemo(() => {
        const map = new Map<string, HistoricalHolding>();
        previousQuarterData.forEach(h => {
            // Use position key (includes put_call) for unique grouping
            const key = getPositionKey(h);
            map.set(key, h);
        });
        return map;
    }, [previousQuarterData]);

    // 4. Calculate portfolio total for this specific quarter
    const totalPortfolioValue = useMemo(() => {
        return currentQuarterData.reduce((sum, h) => sum + h.value, 0);
    }, [currentQuarterData]);

    const previousTotalPortfolioValue = useMemo(() => {
        return previousQuarterData.reduce((sum, h) => sum + h.value, 0);
    }, [previousQuarterData]);

    if (!history || history.length === 0) {
        return (
            <div className="loading-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '40px', padding: '40px' }}>
                <List size={48} style={{ color: '#64748b', opacity: 0.5 }} />
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#94a3b8' }}>No Holdings Recorded</div>
                <div style={{ fontSize: '14px', color: '#64748b', maxWidth: '400px', lineHeight: 1.5, textAlign: 'center' }}>
                    We couldn't find any individual stock positions for this fund.
                    This usually means the fund hasn't filed any 13F-HR forms with the SEC yet, or their filings are still being processed.
                </div>
            </div>
        );
    }

    // Build a set of current quarter position keys for quick lookup
    const currentQuarterKeys = useMemo(() => {
        return new Set(currentQuarterData.map(h => getPositionKey(h)));
    }, [currentQuarterData]);

    // Build a set of previous quarter position keys for detecting new positions
    const previousQuarterKeys = useMemo(() => {
        return new Set(previousQuarterData.map(h => getPositionKey(h)));
    }, [previousQuarterData]);

    // Find positions sold off from previous quarter (existed before, not now)
    const soldOffPositions = useMemo(() => {
        if (!previousQuarterData.length) return [];

        return previousQuarterData
            .filter(prevH => !currentQuarterKeys.has(getPositionKey(prevH)))
            .map(prevH => ({
                ...prevH,
                // Override with 0 values to show as sold
                shares: 0,
                value: 0,
                period_of_report: currentQuarterDate, // Show in current quarter
                isSoldOff: true, // Flag for special styling
                previousShares: prevH.shares,
                previousValue: prevH.value,
            }));
    }, [previousQuarterData, currentQuarterKeys, currentQuarterDate]);

    // 4. Calculate quarterly totals for weights
    const quarterTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        history.forEach(h => {
            const period = h.period_of_report;
            if (!totals[period]) totals[period] = 0;
            totals[period] += h.value;
        });
        return totals;
    }, [history]);

    // Fast lookup for history
    const historicalDataMap = useMemo(() => {
        const map: Record<string, Map<string, HistoricalHolding>> = {};
        history.forEach(h => {
            if (!map[h.period_of_report]) map[h.period_of_report] = new Map();
            map[h.period_of_report].set(getPositionKey(h), h);
        });
        return map;
    }, [history]);

    // 5. Pre-calculate PnL and Capital Allocation for all tickers
    const allTickerStats = useMemo(() => {
        const stats: Record<string, { pnl: number, cap: number, roi: number, irr: number, committed: number }> = {};

        // Group by position key (ticker/cusip + put_call)
        const groups: Record<string, HistoricalHolding[]> = {};
        history.forEach(h => {
            const key = getPositionKey(h);
            if (!groups[key]) groups[key] = [];
            groups[key].push(h);
        });

        // Calculate for each group
        Object.keys(groups).forEach(key => {
            // Cap the data at the current quarter date to show metrics "as of" that time
            const cutoffTime = new Date(currentQuarterDate).getTime();
            const data = groups[key]
                .sort((a, b) => new Date(a.period_of_report).getTime() - new Date(b.period_of_report).getTime())
                .filter(a => new Date(a.period_of_report).getTime() <= cutoffTime);

            if (data.length === 0) {
                stats[key] = { pnl: 0, cap: 0, roi: 0, irr: 0, committed: 0 };
                return;
            }

            let pnl = 0;
            let cap = data[0]?.value || 0;
            let committed = cap;

            // Cash flows for IRR: First entry is negative (outflow)
            const cfs: number[] = [-cap];

            for (let i = 1; i < data.length; i++) {
                const h = data[i];
                const prev = data[i - 1];

                const p1 = prev.shares > 0 ? prev.value / prev.shares : 0;
                const p2 = h.shares > 0 ? h.value / h.shares : p1;

                pnl += (p2 - p1) * prev.shares;

                const flow = (h.shares - prev.shares) * p2;
                cap += flow;
                if (flow > 0) committed += flow;

                // Intermediate cash flows: negative if adding (outflow), positive if trimming (inflow)
                cfs.push(-flow);
            }

            // Final "inflow" is the current market value
            const lastValue = data[data.length - 1]?.value || 0;
            if (cfs.length > 0) {
                cfs[cfs.length - 1] += lastValue;
            }

            const quarterlyRate = calculateIRR(cfs);
            const irr = (Math.pow(1 + quarterlyRate, 4) - 1) * 100; // Annualized

            const roi = committed > 0 ? (pnl / committed) * 100 : 0;
            stats[key] = { pnl, cap, roi, irr, committed };
        });

        return stats;
    }, [history, currentQuarterDate]);

    const processedData = useMemo(() => {
        // Combine current holdings with sold-off positions
        let combined = [...currentQuarterData, ...soldOffPositions];

        // Filter
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            combined = combined.filter(h =>
                (h.ticker?.toLowerCase() || '').includes(lowerTerm) ||
                h.issuer_name.toLowerCase().includes(lowerTerm) ||
                h.cusip.toLowerCase().includes(lowerTerm)
            );
        }

        // Sort
        return [...combined].sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            switch (sortField) {
                case 'name':
                    valA = a.issuer_name;
                    valB = b.issuer_name;
                    break;
                case 'shares':
                    valA = a.shares;
                    valB = b.shares;
                    break;
                case 'value':
                    valA = a.value;
                    valB = b.value;
                    break;
                case 'percent':
                    valA = a.value;
                    valB = b.value;
                    break;
                case 'pnl':
                    valA = allTickerStats[a.ticker || a.cusip]?.pnl || 0;
                    valB = allTickerStats[b.ticker || b.cusip]?.pnl || 0;
                    break;
                case 'cap_allocation':
                    valA = allTickerStats[a.ticker || a.cusip]?.cap || 0;
                    valB = allTickerStats[b.ticker || b.cusip]?.cap || 0;
                    break;
                case 'roi':
                    valA = allTickerStats[a.ticker || a.cusip]?.roi || 0;
                    valB = allTickerStats[b.ticker || b.cusip]?.roi || 0;
                    break;
                case 'irr':
                    valA = allTickerStats[a.ticker || a.cusip]?.irr || 0;
                    valB = allTickerStats[b.ticker || b.cusip]?.irr || 0;
                    break;
                case 'percent_delta': {
                    const prevHA = prevHoldingMap.get(a.ticker || a.cusip);
                    const prevPercentA = prevHA ? (prevHA.value / previousTotalPortfolioValue) * 100 : 0;
                    valA = ((a.value / totalPortfolioValue) * 100) - prevPercentA;

                    const prevHB = prevHoldingMap.get(b.ticker || b.cusip);
                    const prevPercentB = prevHB ? (prevHB.value / previousTotalPortfolioValue) * 100 : 0;
                    valB = ((b.value / totalPortfolioValue) * 100) - prevPercentB;
                    break;
                }
                case 'price_delta': {
                    // Logic MUST match row rendering split logic for sorting to match display
                    const calcPriceDelta = (h: any) => {
                        const prevH = prevHoldingMap.get(h.ticker || h.cusip);
                        if (!prevH) return 0;
                        const p2 = h.shares > 0 ? h.value / h.shares : 0;
                        const p1 = prevH.shares > 0 ? prevH.value / prevH.shares : 0;
                        if (p1 === 0) return 0;

                        // Split Detection
                        const shareRatio = h.shares > 0 ? h.shares / prevH.shares : 1;
                        const priceRatio = p1 > 0 ? p2 / p1 : 1;
                        const valueRatio = prevH.value > 0 ? h.value / prevH.value : 1;

                        let adjustedP1 = p1;
                        if (shareRatio > 1.4 && priceRatio < 0.72 && valueRatio > 0.5 && valueRatio < 2.5) {
                            adjustedP1 = p1 / shareRatio;
                        }
                        return ((p2 / adjustedP1) - 1) * 100;
                    };
                    valA = calcPriceDelta(a);
                    valB = calcPriceDelta(b);
                    break;
                }
            }

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [currentQuarterData, soldOffPositions, searchTerm, sortField, sortDirection, allTickerStats]);

    const totalPages = Math.ceil(processedData.length / itemsPerPage);

    // Metrics for the currently expanded ticker
    const expandedMetrics = useMemo(() => {
        if (!expandedTicker) return null;

        const cutoffTime = new Date(currentQuarterDate).getTime();
        const tickerData = history.filter(h => getPositionKey(h) === expandedTicker)
            .sort((a, b) => new Date(a.period_of_report).getTime() - new Date(b.period_of_report).getTime())
            .filter(h => new Date(h.period_of_report).getTime() <= cutoffTime);

        if (tickerData.length === 0) return {
            maxValue: 0,
            maxValueQuarter: '',
            maxWeight: 0,
            maxWeightQuarter: '',
            curWeight: 0,
            totalPnL: 0,
            totalCapAlloc: 0,
            totalCommitted: 0,
            roi: 0,
            irr: 0,
            episodes: []
        };

        // Peak Value & Weight
        let maxValue = 0;
        let maxValueQuarter = '';
        let maxWeight = 0;
        let maxWeightQuarter = '';

        // PnL vs Capital Allocation
        let totalPnL = 0;
        let totalCapAlloc = tickerData[0]?.value || 0; // Initial investment
        let totalCommitted = totalCapAlloc; // Track total positive outflows

        // Cash flows for IRR: First entry is negative (outflow)
        const cfs: number[] = [-totalCapAlloc];

        for (let i = 0; i < tickerData.length; i++) {
            const h = tickerData[i];
            const prev = tickerData[i - 1];

            // 1. Peak Stats
            if (h.value > maxValue) {
                maxValue = h.value;
                maxValueQuarter = h.period_of_report;
            }
            const weight = h.value / (quarterTotals[h.period_of_report] || 1);
            if (weight > maxWeight) {
                maxWeight = weight;
                maxWeightQuarter = h.period_of_report;
            }

            // 2. PnL / Cap Allocation Logic
            if (prev) {
                const p1 = prev.shares > 0 ? prev.value / prev.shares : 0;
                const p2 = h.shares > 0 ? h.value / h.shares : p1; // Use prev price if exited

                const pnlChange = (p2 - p1) * prev.shares;
                const capChange = (h.shares - prev.shares) * p2;

                totalPnL += pnlChange;
                totalCapAlloc += capChange;
                if (capChange > 0) totalCommitted += capChange;

                cfs.push(-capChange);
            }
        }

        // Current view's weight
        const curEntry = tickerData.find(h => h.period_of_report === currentQuarterDate);
        const curWeight = curEntry ? (curEntry.value / (quarterTotals[currentQuarterDate] || 1)) * 100 : 0;

        // Price Performance Episodes
        const episodes: { startQ: string, endQ: string, perf: number }[] = [];
        let currentEpisode: { startPrice: number, startQ: string } | null = null;

        const getQuarterId = (dateStr: string) => {
            const d = new Date(dateStr);
            return d.getFullYear() * 4 + Math.floor(d.getMonth() / 3);
        };

        // 2a. Build Normalized Price History (Backwards Pass to adjust for splits)
        const normalizedPrices = new Array(tickerData.length).fill(0);
        let cumulativeSplitFactor = 1;

        // Iterate backwards from newest to oldest
        for (let i = tickerData.length - 1; i >= 0; i--) {
            const h = tickerData[i];
            const newer = tickerData[i + 1];

            let rawPrice = h.shares > 0 ? h.value / h.shares : 0;

            if (newer) {
                const newerRawPrice = newer.shares > 0 ? newer.value / newer.shares : 0;

                // Detect Split between 'h' (older) and 'newer' (newer)
                // Split means: newer.shares >>> h.shares AND newer.price <<< h.price
                const shareRatio = h.shares > 0 ? newer.shares / h.shares : 1;
                const priceRatio = rawPrice > 0 ? newerRawPrice / rawPrice : 1;
                const valueRatio = h.value > 0 ? newer.value / h.value : 1;

                // Thresholds: Shares > 1.4x, Price < 0.72x, Value not explosive (0.5x - 2.5x)
                if (shareRatio > 1.4 && priceRatio < 0.72 && valueRatio > 0.5 && valueRatio < 2.5) {
                    const splitRatio = shareRatio; // Assume the share increase is the split factor
                    cumulativeSplitFactor *= splitRatio;
                }
            }

            normalizedPrices[i] = rawPrice / cumulativeSplitFactor;
        }

        for (let i = 0; i < tickerData.length; i++) {
            const h = tickerData[i];
            const next = tickerData[i + 1];

            // Use normalized price for performance
            const price = normalizedPrices[i];

            if (!currentEpisode && h.shares > 0) {
                currentEpisode = { startPrice: price, startQ: h.period_of_report };
            }

            if (currentEpisode) {
                let episodeEnds = false;

                if (!next) {
                    episodeEnds = true;
                } else {
                    const qId = getQuarterId(h.period_of_report);
                    const nextQId = getQuarterId(next.period_of_report);

                    if (nextQId - qId > 1 || next.shares === 0) {
                        episodeEnds = true;
                    }
                }

                if (episodeEnds) {
                    const endPrice = price;
                    if (currentEpisode.startPrice > 0 && endPrice > 0) {
                        episodes.push({
                            startQ: currentEpisode.startQ,
                            endQ: h.period_of_report,
                            perf: ((endPrice / currentEpisode.startPrice) - 1) * 100
                        });
                    }
                    currentEpisode = null;
                }
            }
        }

        // Final "inflow" for IRR is the most recent reported value
        const lastVal = tickerData[tickerData.length - 1]?.value || 0;
        if (cfs.length > 0) {
            cfs[cfs.length - 1] += lastVal;
        }

        const quarterlyRate = calculateIRR(cfs);
        const irr = (Math.pow(1 + quarterlyRate, 4) - 1) * 100;

        return {
            maxValue,
            maxValueQuarter,
            maxWeight: maxWeight * 100,
            maxWeightQuarter,
            curWeight,
            totalPnL,
            totalCapAlloc,
            totalCommitted,
            roi: totalCommitted > 0 ? (totalPnL / totalCommitted) * 100 : 0,
            irr,
            episodes: episodes.reverse() // Show newest episode first
        };
    }, [expandedTicker, history, quarterTotals, currentQuarterDate]);

    // Identify all unique filings for the current quarter
    const quarterFilings = useMemo(() => {
        if (!currentQuarterData.length) return [];

        // Get period_filings from the first holding (all holdings in the same period share the same period_filings)
        const firstHolding = currentQuarterData[0] as any;
        const periodFilingsData = firstHolding?.period_filings || [];
        const cik = firstHolding?.cik;

        // If we have period_filings from the API, use it
        if (periodFilingsData.length > 0 && cik) {
            return periodFilingsData.map((f: { accession_number: string; is_amendment: boolean }) => ({
                accession: f.accession_number,
                cik: cik,
                url: getEdgarUrl(cik, f.accession_number),
                label: f.is_amendment ? '13F AMENDMENT' : '13F FILING',
                isAmendment: f.is_amendment
            }));
        }

        // Fallback to old logic if period_filings not available
        const unique = new Map<string, string>(); // accession -> cik
        currentQuarterData.forEach(h => {
            if (h.accession_number && h.cik) {
                unique.set(h.accession_number, h.cik);
            }
        });

        const sortedAccessions = Array.from(unique.keys()).sort().reverse();
        return sortedAccessions.map((acc) => ({
            accession: acc,
            cik: unique.get(acc),
            url: getEdgarUrl(unique.get(acc), acc),
            label: '13F FILING',
            isAmendment: false
        }));
    }, [currentQuarterData]);



    const paginatedData = processedData.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const renderSortIcon = (field: SortField) => {
        if (sortField !== field) return <ArrowUpDown size={14} className="text-slate-500 opacity-50" />;
        return sortDirection === 'asc'
            ? <ArrowUp size={14} className="text-blue-400" />
            : <ArrowDown size={14} className="text-blue-400" />;
    };

    // Format Quarter Label
    const formatQuarterLabel = (dateStr: string) => {
        if (!dateStr) return 'Loading...';
        const d = new Date(dateStr);
        const q = Math.floor(d.getMonth() / 3) + 1;
        const year = d.getFullYear().toString().slice(2);
        return `${q}Q '${year}`;
    };

    const renderDelta = (delta: number, isCurrency: boolean = false) => {
        if (!delta || delta === 0) return null;
        const isPositive = delta > 0;
        const colorClass = isPositive ? 'delta-positive' : 'delta-negative';
        const formatted = isCurrency
            ? formatCurrency(Math.abs(delta)) // Use existing formatter for compact K/M
            : Math.abs(delta).toLocaleString();

        return (
            <span className={`delta-tag ${colorClass}`} style={{ fontSize: '11px', marginLeft: '6px', fontWeight: 500 }}>
                ({isPositive ? '+' : '-'}{formatted})
            </span>
        );
    };

    return (
        <div className="holdings-table-wrapper">
            <div className="table-controls">
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flex: 1 }}>
                    <div className="search-input-wrapper">
                        <Search size={16} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search ticker, company, or CUSIP..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="table-search-input"
                        />
                    </div>
                    <button
                        className="download-csv-btn"
                        onClick={() => setIsExportModalOpen(true)}
                        title="Download CSV"
                    >
                        <Download size={16} />
                        <span>Export</span>
                    </button>
                </div>

                <div className="table-actions-right">
                    {/* Quarter Navigation */}
                    {/* Quarter Navigation */}
                    {quarterFilings.map((filing: {
                        accession: string;
                        cik: string;
                        url: string | undefined;
                        label: string;
                        isAmendment: boolean;
                    }) => (
                        <a
                            key={filing.accession}
                            href={filing.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="view-13f-link"
                            title={`View SEC ${filing.label}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '11px',
                                color: filing.isAmendment ? '#fb923c' : '#38bdf8',
                                textDecoration: 'none',
                                padding: '4px 8px',
                                backgroundColor: filing.isAmendment ? 'rgba(251, 146, 60, 0.1)' : 'rgba(56, 189, 248, 0.1)',
                                borderRadius: '4px',
                                marginRight: '12px',
                                fontWeight: 600,
                                border: `1px solid ${filing.isAmendment ? 'rgba(251, 146, 60, 0.2)' : 'rgba(56, 189, 248, 0.2)'}`,
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = filing.isAmendment ? 'rgba(251, 146, 60, 0.2)' : 'rgba(56, 189, 248, 0.2)';
                                e.currentTarget.style.borderColor = filing.isAmendment ? 'rgba(251, 146, 60, 0.4)' : 'rgba(56, 189, 248, 0.4)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = filing.isAmendment ? 'rgba(251, 146, 60, 0.1)' : 'rgba(56, 189, 248, 0.1)';
                                e.currentTarget.style.borderColor = filing.isAmendment ? 'rgba(251, 146, 60, 0.2)' : 'rgba(56, 189, 248, 0.2)';
                            }}
                        >
                            <ExternalLink size={12} />
                            {filing.label}
                        </a>
                    ))}
                    <div className="quarter-nav-controls" style={{ position: 'relative' }}>
                        <button
                            className="quarter-nav-btn"
                            onClick={() => setQuarterIndex(Math.min(sortedQuarters.length - 1, quarterIndex + 1))}
                            disabled={quarterIndex >= sortedQuarters.length - 1}
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span
                            className="quarter-label"
                            onClick={() => setShowQuarterDropdown(!showQuarterDropdown)}
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            {formatQuarterLabel(currentQuarterDate)}

                            <ChevronDown size={14} style={{ opacity: 0.6 }} />
                        </span>

                        {showQuarterDropdown && (
                            <div
                                className="quarter-dropdown"
                                style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    marginTop: '4px',
                                    backgroundColor: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: '8px',
                                    padding: '4px',
                                    zIndex: 1000,
                                    minWidth: '100px',
                                    maxHeight: '300px',
                                    overflowY: 'auto',
                                    boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
                                }}
                            >
                                {sortedQuarters.map((q, idx) => (
                                    <div
                                        key={q}
                                        onClick={() => {
                                            setQuarterIndex(idx);
                                            setShowQuarterDropdown(false);
                                        }}
                                        style={{
                                            padding: '8px 12px',
                                            cursor: 'pointer',
                                            borderRadius: '4px',
                                            fontSize: '13px',
                                            color: idx === quarterIndex ? '#38bdf8' : '#e2e8f0',
                                            backgroundColor: idx === quarterIndex ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                                            fontWeight: idx === quarterIndex ? 600 : 400
                                        }}
                                        onMouseEnter={(e) => {
                                            if (idx !== quarterIndex) {
                                                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (idx !== quarterIndex) {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                            }
                                        }}
                                    >
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {formatQuarterLabel(q)}
                                            {amendedQuarters.has(q) && (
                                                <span style={{ fontSize: '9px', fontWeight: 700, color: '#fb923c' }}>A</span>
                                            )}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button
                            className="quarter-nav-btn"
                            onClick={() => setQuarterIndex(Math.max(0, quarterIndex - 1))}
                            disabled={quarterIndex === 0}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <div className="entry-count-divider">
                        Showing {processedData.length} holdings
                    </div>
                </div>
            </div>

            <div className="holdings-table-container">
                <table className="holdings-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('name')} className="sortable-th">
                                <div className="th-content">
                                    Ticker / Name
                                    {renderSortIcon('name')}
                                </div>
                            </th>
                            <th onClick={() => handleSort('shares')} className="sortable-th text-right" style={{ width: '12%' }}>
                                <div className="th-content justify-end">
                                    <div className="flex flex-col items-end">
                                        <span>Shares</span>
                                    </div>
                                    {renderSortIcon('shares')}
                                </div>
                            </th>
                            <th onClick={() => handleSort('value')} className="sortable-th text-right" style={{ width: '14%' }}>
                                <div className="th-content justify-end">
                                    <div className="flex flex-col items-end">
                                        <span>Value</span>
                                    </div>
                                    {renderSortIcon('value')}
                                </div>
                            </th>
                            <th onClick={() => handleSort('cap_allocation')} className="sortable-th text-right" style={{ width: '12%' }}>
                                <div className="th-content justify-end">
                                    <div className="whitespace-normal leading-tight" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                        <span>Cap. Allocation </span>
                                        <span className="text-[9px] text-slate-500 font-normal mt-0.5 block">(Net Invested)</span>
                                    </div>
                                    {renderSortIcon('cap_allocation')}
                                </div>
                            </th>

                            <th onClick={() => handleSort('percent')} className="sortable-th text-right">
                                <div className="th-content justify-end">
                                    % Portfolio
                                    {renderSortIcon('percent')}
                                </div>
                            </th>
                            <th onClick={() => handleSort('percent_delta')} className="sortable-th text-right">
                                <div className="th-content justify-end">
                                    <div className="whitespace-normal leading-tight" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                        <span>Δ % Port</span>
                                    </div>
                                    {renderSortIcon('percent_delta')}
                                </div>
                            </th>
                            <th onClick={() => handleSort('price_delta')} className="sortable-th text-right">
                                <div className="th-content justify-end">
                                    <div className="whitespace-normal leading-tight" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                        <span>Price Δ %</span>
                                    </div>
                                    {renderSortIcon('price_delta')}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((h) => {
                            const percent = (h.value / totalPortfolioValue) * 100;
                            const key = getPositionKey(h);
                            const prevH = prevHoldingMap.get(key);

                            const deltaShares = h.shares - (prevH ? prevH.shares : 0);
                            const deltaValue = h.value - (prevH ? prevH.value : 0);

                            // Only show delta if there IS a previous quarter (don't show for very first quarter in history)
                            const showDeltas = !!previousQuarterDate;

                            // Detect if this is a newly added position (not in previous quarter)
                            const isNewPosition = previousQuarterData.length > 0 && !previousQuarterKeys.has(key) && !(h as any).isSoldOff;

                            const isExpanded = expandedTicker === key;

                            // History for this specific ticker (use CUSIP for matching)
                            let fullHist: HistoricalHolding[] = [];
                            let tickerHistory: { past: any[], future: HistoricalHolding[] } = { past: [], future: [] };
                            let relevantQuarters: string[] = [];
                            let tableQuarters: string[] = [];
                            if (isExpanded) {
                                fullHist = history.filter(item => getPositionKey(item) === key)
                                    .sort((a, b) => new Date(b.period_of_report).getTime() - new Date(a.period_of_report).getTime());

                                const currentQTime = new Date(currentQuarterDate).getTime();

                                // Get quarters where this ticker was held
                                const heldQuartersSet = new Set(fullHist.map(item => item.period_of_report));

                                // Find first quarter this stock was held (oldest)
                                const firstHeldQuarter = fullHist.length > 0
                                    ? fullHist[fullHist.length - 1].period_of_report
                                    : currentQuarterDate;

                                // Build complete timeline from first position to the LATEST of (current view) or (last held quarter)
                                const firstQIdx = sortedQuarters.indexOf(firstHeldQuarter);
                                const lastRealHoldingDate = fullHist[0]?.period_of_report || currentQuarterDate;
                                const lastRealHoldingIdx = sortedQuarters.indexOf(lastRealHoldingDate);
                                const currentQIdx = sortedQuarters.indexOf(currentQuarterDate);

                                // Use the minimum index (latest chronological date) between last held and current view
                                const latestIdxToInclude = Math.min(lastRealHoldingIdx, currentQIdx);

                                // Extend the timeline: include one quarter BEFORE the first held quarter (if available)
                                // Since sortedQuarters is newest to oldest, adding 1 to firstQIdx makes it older
                                const extendedFirstQIdx = Math.min(sortedQuarters.length - 1, firstQIdx + 1);
                                relevantQuarters = sortedQuarters.slice(latestIdxToInclude, extendedFirstQIdx + 1); // latest to oldest

                                // Quarters to show in the trade history table (EXCLUDES the extra context quarter)
                                tableQuarters = sortedQuarters.slice(latestIdxToInclude, firstQIdx + 1);

                                // Build timeline with gaps
                                const timelineItems: any[] = [];
                                let gapStart: string | null = null;
                                let gapCount = 0;

                                for (let i = 0; i < tableQuarters.length; i++) {
                                    const quarter = tableQuarters[i];
                                    const holding = fullHist.find(item => item.period_of_report === quarter);

                                    if (holding) {
                                        // If we were in a gap, close it and add the holding
                                        if (gapCount > 0) {
                                            // Last gap quarter (closest to holding chronologically) = EXIT row
                                            // Earlier gap quarters = regular gap rows
                                            const exitQuarter = relevantQuarters[i - 1]; // This is the quarter right before the holding (first gap chronologically)
                                            const remainingGapCount = gapCount - 1;

                                            // First add regular gap rows (all except the last one which becomes EXIT)
                                            if (remainingGapCount > 0) {
                                                if (remainingGapCount <= 3) {
                                                    for (let g = 0; g < remainingGapCount; g++) {
                                                        const gapQuarter = relevantQuarters[i - gapCount + g];
                                                        timelineItems.push({
                                                            id: `${h.cusip}-gap-${gapQuarter}`,
                                                            period_of_report: gapQuarter,
                                                            shares: 0,
                                                            value: 0,
                                                            issuer_name: h.issuer_name,
                                                            ticker: h.ticker,
                                                            cusip: h.cusip,
                                                            isGap: true,
                                                        });
                                                    }
                                                } else {
                                                    // Consolidated gap row for remaining gaps
                                                    const gapEndQuarter = relevantQuarters[i - gapCount];
                                                    const gapStartQuarter = relevantQuarters[i - 2]; // One before EXIT
                                                    timelineItems.push({
                                                        id: `${h.cusip}-gap-consolidated-${gapEndQuarter}`,
                                                        period_of_report: gapEndQuarter,
                                                        gapEndQuarter: gapEndQuarter,
                                                        gapStartQuarter: gapStartQuarter,
                                                        shares: 0,
                                                        value: 0,
                                                        issuer_name: h.issuer_name,
                                                        ticker: h.ticker,
                                                        cusip: h.cusip,
                                                        isConsolidatedGap: true,
                                                        gapCount: remainingGapCount,
                                                    });
                                                }
                                            }

                                            // Insert the EXIT row (the quarter right before the holding)
                                            timelineItems.push({
                                                id: `${h.cusip}-exit-${exitQuarter}`,
                                                period_of_report: exitQuarter,
                                                shares: 0,
                                                value: 0,
                                                issuer_name: h.issuer_name,
                                                ticker: h.ticker,
                                                cusip: h.cusip,
                                                isExitRow: true,
                                                exitFromShares: holding.shares,
                                                exitFromValue: holding.value,
                                            });

                                            // Now add the holding (this is the last position before they exited)
                                            timelineItems.push({
                                                ...holding,
                                            });

                                            gapCount = 0;
                                            gapStart = null;
                                        } else {
                                            // Check if this is a re-entry (previous item was a gap or exit)
                                            const prevQuarter = tableQuarters[i + 1];
                                            const wasHeldPreviously = prevQuarter && heldQuartersSet.has(prevQuarter);
                                            const isReEntry = prevQuarter && !wasHeldPreviously && i < tableQuarters.length - 1;

                                            timelineItems.push({
                                                ...holding,
                                                isReEntry: isReEntry,
                                            });
                                        }
                                    } else {
                                        // This is a gap quarter
                                        if (gapCount === 0) {
                                            gapStart = quarter;
                                        }
                                        gapCount++;
                                    }
                                }

                                // Handle trailing gap (shouldn't happen normally, but just in case)
                                if (gapCount > 0) {
                                    const gapEndQuarter = relevantQuarters[relevantQuarters.length - gapCount];
                                    if (gapCount <= 3) {
                                        for (let g = 0; g < gapCount; g++) {
                                            const gapQuarter = relevantQuarters[relevantQuarters.length - gapCount + g];
                                            timelineItems.push({
                                                id: `${h.cusip}-gap-${gapQuarter}`,
                                                period_of_report: gapQuarter,
                                                shares: 0,
                                                value: 0,
                                                issuer_name: h.issuer_name,
                                                ticker: h.ticker,
                                                cusip: h.cusip,
                                                isGap: true,
                                            });
                                        }
                                    } else {
                                        const gapStartQuarter = tableQuarters[tableQuarters.length - 1];
                                        timelineItems.push({
                                            id: `${h.cusip}-gap-consolidated-${gapEndQuarter}`,
                                            period_of_report: gapEndQuarter,
                                            gapEndQuarter: gapEndQuarter,
                                            gapStartQuarter: gapStartQuarter,
                                            shares: 0,
                                            value: 0,
                                            issuer_name: h.issuer_name,
                                            ticker: h.ticker,
                                            cusip: h.cusip,
                                            isConsolidatedGap: true,
                                            gapCount: gapCount,
                                        });
                                    }
                                }

                                // Split into past and future
                                tickerHistory.past = timelineItems.filter(item => new Date(item.period_of_report).getTime() <= currentQTime);
                                tickerHistory.future = timelineItems.filter(item => new Date(item.period_of_report).getTime() > currentQTime);

                                // For sold-off positions (current view quarter has 0 shares), add synthetic EXIT entry
                                if ((h as any).isSoldOff && !tickerHistory.past.some(item => item.period_of_report === currentQuarterDate)) {
                                    const exitEntry = {
                                        ...h,
                                        id: `${h.cusip}-exit-${currentQuarterDate}`,
                                        shares: 0,
                                        value: 0,
                                        period_of_report: currentQuarterDate,
                                        isExitEntry: true,
                                    };
                                    tickerHistory.past = [exitEntry, ...tickerHistory.past];
                                }
                            }

                            return (
                                <React.Fragment key={`${h.cusip}-${h.period_of_report}-${h.id}`}>
                                    <tr
                                        className={`cursor-pointer hover:bg-slate-800/50 transition-colors ${isExpanded ? 'bg-slate-800/80 border-l-2 border-blue-500' : ''} ${(h as any).isSoldOff ? 'opacity-60' : ''}`}
                                        onClick={() => setExpandedTicker(isExpanded ? null : key)}
                                    >
                                        <td className="name-cell">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {isExpanded ? <ChevronDown size={14} className="text-blue-400" /> : <ChevronRight size={14} className="text-slate-500" />}
                                                <div>
                                                    <div className="ticker" style={(h as any).isSoldOff ? { color: '#f87171' } : isNewPosition ? { color: '#34d399' } : {}}>
                                                        {h.issuer_name}
                                                        {(h as any).put_call?.toUpperCase() === 'PUT' && <span style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 6px', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', borderRadius: '4px', fontWeight: 600 }}>🔻 PUT</span>}
                                                        {(h as any).put_call?.toUpperCase() === 'CALL' && <span style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 6px', backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', borderRadius: '4px', fontWeight: 600 }}>🔺 CALL</span>}
                                                        {(h as any).isSoldOff && <span style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 6px', backgroundColor: 'rgba(248, 113, 113, 0.2)', color: '#f87171', borderRadius: '4px', fontWeight: 600 }}>EXIT</span>}
                                                        {isNewPosition && <span style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 6px', backgroundColor: 'rgba(52, 211, 153, 0.2)', color: '#34d399', borderRadius: '4px', fontWeight: 600 }}>NEW</span>}
                                                    </div>
                                                    <div className="company-name">{h.ticker ? h.ticker : h.cusip}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-right number-cell">
                                            {(h as any).isSoldOff ? (
                                                <span style={{ color: '#64748b' }}>0</span>
                                            ) : (
                                                h.shares.toLocaleString()
                                            )}
                                            {showDeltas && (h as any).isSoldOff ? (
                                                <span className="delta-tag delta-negative">-{(h as any).previousShares?.toLocaleString()}</span>
                                            ) : (
                                                showDeltas && renderDelta(deltaShares)
                                            )}
                                        </td>
                                        <td className="text-right number-cell font-medium">
                                            {(h as any).isSoldOff ? (
                                                <span style={{ color: '#64748b' }}>$0</span>
                                            ) : (
                                                formatCurrency(h.value)
                                            )}
                                            {showDeltas && (h as any).isSoldOff ? (
                                                <span className="delta-tag delta-negative">-{formatCurrency((h as any).previousValue || 0)}</span>
                                            ) : (
                                                showDeltas && renderDelta(deltaValue, true)
                                            )}
                                        </td>
                                        <td className="text-right number-cell font-medium text-slate-300">
                                            {formatCurrency(allTickerStats[key]?.cap || 0)}
                                        </td>
                                        <td className="text-right">
                                            <div className="percent-cell">
                                                <span className="percent-text" style={(h as any).isSoldOff ? { color: '#64748b' } : {}}>{percent.toFixed(2)}%</span>
                                                <div className="percent-bar-bg">
                                                    <div
                                                        className="percent-bar-fill"
                                                        style={{ width: `${Math.min(percent, 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-right number-cell">
                                            {(() => {
                                                const prevPercent = prevH ? (prevH.value / previousTotalPortfolioValue) * 100 : 0;
                                                const delta = percent - prevPercent;
                                                if (!showDeltas || (h as any).isSoldOff) return <span className="text-slate-600">-</span>;

                                                return (
                                                    <span style={{ color: delta > 0 ? '#34d399' : delta < 0 ? '#f87171' : '#64748b', fontWeight: 500 }}>
                                                        {delta > 0 ? '+' : ''}{delta.toFixed(2)}%
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td className="text-right number-cell">
                                            {(() => {
                                                if (!showDeltas || (h as any).isSoldOff || !prevH || prevH.shares === 0) return <span className="text-slate-600">-</span>;

                                                const p2 = h.shares > 0 ? h.value / h.shares : 0;
                                                const p1 = prevH.shares > 0 ? prevH.value / prevH.shares : 0;

                                                if (p1 === 0) return <span className="text-slate-600">-</span>;

                                                // Split Detection Logic (QoQ)
                                                const shareRatio = h.shares > 0 ? h.shares / prevH.shares : 1;
                                                const priceRatio = p1 > 0 ? p2 / p1 : 1;
                                                const valueRatio = prevH.value > 0 ? h.value / prevH.value : 1;

                                                let adjustedP1 = p1;
                                                let isSplit = false;
                                                if (shareRatio > 1.4 && priceRatio < 0.72 && valueRatio > 0.5 && valueRatio < 2.5) {
                                                    adjustedP1 = p1 / shareRatio;
                                                    isSplit = true;
                                                }

                                                const priceDelta = ((p2 / adjustedP1) - 1) * 100;

                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                        <span style={{ color: priceDelta > 0 ? '#34d399' : priceDelta < 0 ? '#f87171' : '#64748b', fontWeight: 500 }}>
                                                            {priceDelta > 0 ? '+' : ''}{priceDelta.toFixed(1)}%
                                                        </span>
                                                        {isSplit && (
                                                            <span className="text-[9px] px-1 rounded bg-purple-900/30 text-purple-400 font-bold">SPLIT</span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="expanded-row-content bg-slate-900/50">
                                            <td colSpan={7} className="p-0">
                                                <div className="p-6 border-b border-slate-700/50">
                                                    {/* Stock History Chart - TOP */}
                                                    <StockHistoryChart
                                                        history={fullHist}
                                                        currentQuarter={currentQuarterDate}
                                                        ticker={h.ticker || h.cusip}
                                                        issuerName={h.issuer_name}
                                                        allQuarters={relevantQuarters}
                                                        selectableQuarters={tableQuarters}
                                                    />

                                                    {/* Flex container: Table on left, Summary on right - HORIZONTAL LAYOUT */}
                                                    <div style={{ display: 'flex', flexDirection: 'row', gap: '32px', alignItems: 'flex-start' }}>
                                                        {/* Trade History Table - FIRST (LEFT) */}
                                                        <div style={{ flex: 'none' }}>
                                                            <table className="w-full text-sm">
                                                                <thead>
                                                                    <tr className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 border-b border-slate-700/50">
                                                                        <th className="text-left py-2 px-2 w-20">Date</th>
                                                                        <th className="text-left py-2 px-2 w-16">Action</th>
                                                                        <th className="text-right py-2 px-2 w-20">Shares</th>
                                                                        <th className="text-right py-2 px-2 w-20">Δ Shares</th>
                                                                        <th className="text-right py-2 px-2 w-20">Value</th>
                                                                        <th className="text-right py-2 px-2 w-20">Δ Value</th>
                                                                        <th className="text-right py-2 px-2 w-16">% Port</th>
                                                                        <th className="text-right py-2 px-2 w-16">Δ %</th>
                                                                        <th className="text-right py-2 px-2 w-16">Price Δ</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {(() => {
                                                                        return [...tickerHistory.future, ...tickerHistory.past].flatMap((item, idx) => {
                                                                            const allItems = [...tickerHistory.future, ...tickerHistory.past];
                                                                            const prevItem = allItems[idx + 1];

                                                                            const isFuture = idx < tickerHistory.future.length;
                                                                            const isLatestPast = idx === tickerHistory.future.length;
                                                                            const isLastFuture = idx === tickerHistory.future.length - 1;

                                                                            // Insert separator row after last FUT item
                                                                            const separatorRow = (isLastFuture && tickerHistory.future.length > 0) ? (
                                                                                <tr key="fut-now-separator" style={{ height: '4px', background: 'transparent' }}>
                                                                                    <td colSpan={9} style={{ padding: 0, height: '4px', borderBottom: '3px solid #3b82f6' }}></td>
                                                                                </tr>
                                                                            ) : null;

                                                                            // Handle consolidated gap rows specially
                                                                            if ((item as any).isConsolidatedGap) {
                                                                                return (
                                                                                    <tr key={item.id} className="border-b border-dashed border-slate-700/30">
                                                                                        <td className="py-2 px-2 font-mono text-slate-500 whitespace-nowrap text-xs" colSpan={2}>
                                                                                            {formatQuarterLabel((item as any).gapStartQuarter)} — {formatQuarterLabel((item as any).gapEndQuarter)}
                                                                                            {isFuture && <span className="text-[8px] text-yellow-500 font-bold"> FUT</span>}
                                                                                            <span className="ml-2 text-[10px] text-slate-600"> (not held for {(item as any).gapCount} Q's)</span>
                                                                                        </td>
                                                                                        <td className="py-2 px-2 text-center text-slate-600 text-xs" colSpan={7}>—</td>
                                                                                    </tr>
                                                                                );
                                                                            }

                                                                            // Handle individual gap row
                                                                            if ((item as any).isGap) {
                                                                                return (
                                                                                    <tr key={item.id} className="border-b border-dashed border-slate-700/30 opacity-50">
                                                                                        <td className="py-2 px-2 font-mono text-slate-500 whitespace-nowrap text-xs">
                                                                                            {formatQuarterLabel(item.period_of_report)}
                                                                                            {isFuture && <span className="text-[8px] text-yellow-500 font-bold"> FUT</span>}
                                                                                        </td>
                                                                                        <td className="py-2 px-2 text-right text-slate-500 text-xs">—</td>
                                                                                        <td className="py-2 px-2 text-right text-slate-500 text-xs">0</td>
                                                                                        <td className="py-2 px-2 text-right text-slate-500 text-xs">—</td>
                                                                                        <td className="py-2 px-2 text-right text-slate-500 text-xs">$0</td>
                                                                                        <td className="py-2 px-2 text-right text-slate-500 text-xs">—</td>
                                                                                        <td className="py-2 px-2 text-right text-slate-500 text-xs">0.00%</td>
                                                                                        <td className="py-2 px-2 text-right text-slate-500 text-xs">—</td>
                                                                                        <td className="py-2 px-2 text-right text-slate-500 text-xs">—</td>
                                                                                    </tr>
                                                                                );
                                                                            }

                                                                            const shareChange = prevItem ? item.shares - prevItem.shares : item.shares;
                                                                            const valueChange = prevItem ? item.value - prevItem.value : item.value;

                                                                            // Calculate % of portfolio for this item and previous
                                                                            const quarterTotal = quarterTotals[item.period_of_report] || 1;
                                                                            const pctOfPortfolio = (item.value / quarterTotal) * 100;
                                                                            const prevQuarterTotal = prevItem ? (quarterTotals[prevItem.period_of_report] || 1) : 1;
                                                                            const prevPctOfPortfolio = prevItem ? (prevItem.value / prevQuarterTotal) * 100 : 0;
                                                                            const pctChange = prevItem ? pctOfPortfolio - prevPctOfPortfolio : 0;

                                                                            // Determine action type - check for special flags first
                                                                            let type = 'HOLD';
                                                                            if ((item as any).isExitEntry || (item as any).isExitRow) {
                                                                                type = 'EXIT';
                                                                            } else if ((item as any).isReEntry) {
                                                                                type = 'NEW'; // Re-entry shows as NEW
                                                                            } else if (!prevItem || (prevItem as any).isGap || (prevItem as any).isConsolidatedGap || (prevItem as any).isExitRow) {
                                                                                type = 'NEW';
                                                                            } else if (shareChange > 0) {
                                                                                type = 'ADD';
                                                                            } else if (shareChange < 0) {
                                                                                type = 'TRIM';
                                                                            }

                                                                            // Action text color only - no box
                                                                            let actionColor = '#64748b'; // slate
                                                                            if (type === 'NEW' || type === 'ADD') {
                                                                                actionColor = '#34d399'; // green
                                                                            } else if (type === 'TRIM' || type === 'EXIT') {
                                                                                actionColor = '#f87171'; // red
                                                                            }

                                                                            // Row styling
                                                                            let rowClass = "";
                                                                            let rowStyle: React.CSSProperties = {};
                                                                            if (isFuture) {
                                                                                rowClass = "opacity-50";
                                                                                if (isLastFuture) {
                                                                                    rowStyle = { borderBottom: '3px solid #3b82f6' }; // Bold blue line after last FUT
                                                                                }
                                                                            } else if (isLatestPast) {
                                                                                rowClass = "bg-blue-900/20";
                                                                            }

                                                                            return [
                                                                                <tr key={item.id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${rowClass}`} style={rowStyle}>
                                                                                    <td className="py-2 px-2 font-mono text-slate-400 whitespace-nowrap text-xs">
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                            {isLatestPast ? (
                                                                                                <span style={{ color: '#a855f7', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                                    {formatQuarterLabel(item.period_of_report)} NOW
                                                                                                    {(item as any).has_amendment && (
                                                                                                        <span
                                                                                                            title="Amended Filing (13F-HR/A)"
                                                                                                            style={{
                                                                                                                fontSize: '8px',
                                                                                                                fontWeight: 700,
                                                                                                                color: '#fb923c',
                                                                                                                backgroundColor: 'rgba(251, 146, 60, 0.15)',
                                                                                                                padding: '1px 3px',
                                                                                                                borderRadius: '2px',
                                                                                                                border: '1px solid rgba(251, 146, 60, 0.3)',
                                                                                                            }}
                                                                                                        >
                                                                                                            A
                                                                                                        </span>
                                                                                                    )}
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                                    {formatQuarterLabel(item.period_of_report)}
                                                                                                    {(item as any).has_amendment && (
                                                                                                        <span
                                                                                                            title="Amended Filing (13F-HR/A)"
                                                                                                            style={{
                                                                                                                fontSize: '8px',
                                                                                                                fontWeight: 700,
                                                                                                                color: '#fb923c',
                                                                                                                backgroundColor: 'rgba(251, 146, 60, 0.15)',
                                                                                                                padding: '1px 3px',
                                                                                                                borderRadius: '2px',
                                                                                                                border: '1px solid rgba(251, 146, 60, 0.3)',
                                                                                                            }}
                                                                                                        >
                                                                                                            A
                                                                                                        </span>
                                                                                                    )}
                                                                                                    {isFuture && <span className="text-[8px] text-yellow-500 font-bold ml-1"> FUT</span>}
                                                                                                </span>
                                                                                            )}
                                                                                            {getEdgarUrl(item.cik, item.accession_number) && (
                                                                                                <a
                                                                                                    href={getEdgarUrl(item.cik, item.accession_number)}
                                                                                                    target="_blank"
                                                                                                    rel="noopener noreferrer"
                                                                                                    style={{ color: '#64748b', transition: 'color 0.2s', display: 'flex' }}
                                                                                                    onMouseEnter={(e) => e.currentTarget.style.color = '#38bdf8'}
                                                                                                    onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                                                                                                    title="View SEC 13F Filing"
                                                                                                >
                                                                                                    <ExternalLink size={10} />
                                                                                                </a>
                                                                                            )}
                                                                                        </div>
                                                                                    </td>

                                                                                    <td className="py-2 px-2">
                                                                                        {(type === 'EXIT' || type === 'NEW') ? (
                                                                                            <span
                                                                                                className="text-xs font-bold"
                                                                                                style={{
                                                                                                    color: actionColor,
                                                                                                    padding: '2px 6px',
                                                                                                    borderRadius: '4px',
                                                                                                    backgroundColor: type === 'EXIT' ? 'rgba(248, 113, 113, 0.2)' : 'rgba(52, 211, 153, 0.2)'
                                                                                                }}
                                                                                            >
                                                                                                {type}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="text-xs font-semibold" style={{ color: actionColor }}>
                                                                                                {type}
                                                                                            </span>
                                                                                        )}
                                                                                    </td>

                                                                                    <td className="py-2 px-2 text-right font-medium text-slate-200 font-mono text-xs">
                                                                                        {item.shares.toLocaleString()}
                                                                                    </td>

                                                                                    <td
                                                                                        className="py-2 px-2 text-right font-mono font-bold text-xs"
                                                                                        style={{ color: shareChange > 0 ? '#34d399' : shareChange < 0 ? '#f87171' : '#64748b' }}
                                                                                    >
                                                                                        {prevItem ? (
                                                                                            <>{shareChange > 0 ? '+' : ''}{shareChange.toLocaleString()}</>
                                                                                        ) : '—'}
                                                                                    </td>

                                                                                    <td className="py-2 px-2 text-right font-medium text-slate-300 text-xs">
                                                                                        {formatCurrency(item.value)}
                                                                                    </td>

                                                                                    <td
                                                                                        className="py-2 px-2 text-right font-mono font-bold text-xs"
                                                                                        style={{ color: valueChange > 0 ? '#34d399' : valueChange < 0 ? '#f87171' : '#64748b' }}
                                                                                    >
                                                                                        {prevItem ? (
                                                                                            <>{valueChange > 0 ? '+' : valueChange < 0 ? '-' : ''}{formatCurrency(Math.abs(valueChange))}</>
                                                                                        ) : '—'}
                                                                                    </td>

                                                                                    <td className="py-2 px-2 text-right font-medium text-slate-300 text-xs">
                                                                                        {pctOfPortfolio.toFixed(2)}%
                                                                                    </td>

                                                                                    <td
                                                                                        className="py-2 px-2 text-right font-mono font-bold text-xs"
                                                                                        style={{ color: pctChange > 0 ? '#34d399' : pctChange < 0 ? '#f87171' : '#64748b' }}
                                                                                    >
                                                                                        {prevItem ? (
                                                                                            <>{pctChange > 0 ? '+' : ''}{pctChange.toFixed(2)}%</>
                                                                                        ) : '—'}
                                                                                    </td>
                                                                                    <td className="py-2 px-2 text-right font-mono font-bold text-xs">
                                                                                        {(() => {
                                                                                            if (!prevItem) return <span className="text-slate-600">—</span>;

                                                                                            // If we have exited (0 shares), we cannot calculate a meaningful price change
                                                                                            if (item.shares === 0) return <span className="text-slate-600">—</span>;

                                                                                            const p2 = item.shares > 0 ? item.value / item.shares : 0;
                                                                                            const p1 = prevItem.shares > 0 ? prevItem.value / prevItem.shares : 0;
                                                                                            if (p1 === 0) return <span className="text-slate-600">—</span>;

                                                                                            // Split Detection Logic
                                                                                            const shareRatio = item.shares > 0 ? item.shares / prevItem.shares : 1;
                                                                                            const priceRatio = p1 > 0 ? p2 / p1 : 1;
                                                                                            const valueRatio = prevItem.value > 0 ? item.value / prevItem.value : 1;

                                                                                            let adjustedP1 = p1;
                                                                                            let isSplit = false;
                                                                                            if (shareRatio > 1.4 && priceRatio < 0.72 && valueRatio > 0.5 && valueRatio < 2.5) {
                                                                                                adjustedP1 = p1 / shareRatio;
                                                                                                isSplit = true;
                                                                                            }

                                                                                            const priceDelta = ((p2 / adjustedP1) - 1) * 100;

                                                                                            return (
                                                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1 }}>
                                                                                                    <span style={{ color: priceDelta > 0 ? '#34d399' : priceDelta < 0 ? '#f87171' : '#64748b' }}>
                                                                                                        {priceDelta > 0 ? '+' : ''}{priceDelta.toFixed(1)}%
                                                                                                    </span>
                                                                                                    {isSplit && <span className="text-[8px] text-purple-400 font-bold tracking-wide mt-0.5">SPLIT</span>}
                                                                                                </div>
                                                                                            );
                                                                                        })()}
                                                                                    </td>
                                                                                </tr>,
                                                                                separatorRow
                                                                            ].filter(Boolean);
                                                                        });
                                                                    })()}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        {/* Summary Box - SECOND (RIGHT) */}
                                                        <div style={{ width: '280px', flexShrink: 0 }}>
                                                            <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', borderRadius: '12px', border: '1px solid rgba(51, 65, 85, 0.6)', padding: '20px', color: '#f1f5f9' }}>
                                                                <h4 style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: '#64748b', marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid rgba(51, 65, 85, 0.5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                        <span>Position Summary</span>
                                                                        {(h as any).put_call?.toUpperCase() === 'PUT' && <span style={{ marginLeft: '8px', fontSize: '9px', padding: '1px 4px', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.3)', letterSpacing: 'normal' }}>PUT</span>}
                                                                        {(h as any).put_call?.toUpperCase() === 'CALL' && <span style={{ marginLeft: '8px', fontSize: '9px', padding: '1px 4px', backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', borderRadius: '4px', border: '1px solid rgba(34, 197, 94, 0.3)', letterSpacing: 'normal' }}>CALL</span>}
                                                                    </div>
                                                                    <span style={{ color: '#64748b', fontWeight: 400, fontSize: '10px', whiteSpace: 'nowrap' }}>As of <span style={{ color: '#f1f5f9' }}>{formatQuarterLabel(currentQuarterDate)}</span></span>
                                                                </h4>

                                                                {/* HISTORY SECTION */}
                                                                <div style={{ marginBottom: '24px' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                                        <span style={{ fontSize: '12px', color: '#64748b' }}>First Position</span>
                                                                        <span style={{ fontSize: '13px', fontWeight: 500 }}>
                                                                            {formatQuarterLabel(tickerHistory.past[tickerHistory.past.length - 1]?.period_of_report || 'N/A')}
                                                                        </span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                                        <span style={{ fontSize: '12px', color: '#64748b' }}>Quarters Held</span>
                                                                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{tickerHistory.past.filter(h => h.shares > 0).length}</span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <span style={{ fontSize: '12px', color: '#64748b' }}>Active Trades</span>
                                                                        <span style={{ fontSize: '13px', fontWeight: 500 }}>
                                                                            {tickerHistory.past.filter((h, i, arr) => {
                                                                                const prev = arr[i + 1];
                                                                                return !prev || h.shares !== prev.shares;
                                                                            }).length}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* CONVICTION SECTION */}
                                                                <div style={{ marginBottom: '24px', paddingTop: '16px', borderTop: '1px dashed rgba(51, 65, 85, 0.6)' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                                        <span style={{ fontSize: '12px', color: '#64748b' }}>Portfolio Weight</span>
                                                                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{expandedMetrics?.curWeight?.toFixed(2) || '0.00'}%</span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                        <span style={{ fontSize: '12px', color: '#64748b' }}>Max Weight</span>
                                                                        <div style={{ textAlign: 'right' }}>
                                                                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#60a5fa' }}>{expandedMetrics?.maxWeight?.toFixed(2) || '0.00'}%</span><br />
                                                                            <span style={{ fontSize: '10px', color: '#475569' }}>in {formatQuarterLabel(expandedMetrics?.maxWeightQuarter || '')}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* PERFORMANCE SECTION */}
                                                                <div style={{ marginBottom: '24px', paddingTop: '16px', borderTop: '1px dashed rgba(51, 65, 85, 0.6)' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                                        <span style={{ fontSize: '12px', color: '#64748b' }}>Current Value</span>
                                                                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{formatCurrency(tickerHistory.past[0]?.value || 0)}</span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                                                        <span style={{ fontSize: '12px', color: '#64748b' }}>Max Value</span>
                                                                        <div style={{ textAlign: 'right' }}>
                                                                            <span style={{ fontSize: '13px', fontWeight: 500 }}>{formatCurrency(expandedMetrics?.maxValue || 0)}</span><br />
                                                                            <span style={{ fontSize: '10px', color: '#475569' }}>in {formatQuarterLabel(expandedMetrics?.maxValueQuarter || '')}</span>
                                                                        </div>
                                                                    </div>
                                                                    {(() => {
                                                                        const firstValue = tickerHistory.past[tickerHistory.past.length - 1]?.value || 0;
                                                                        const currentValue = tickerHistory.past[0]?.value || 0;
                                                                        const diff = currentValue - (firstValue || 0);
                                                                        return (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                    <span style={{ fontSize: '12px', color: '#64748b' }}>Est. PnL (Price)</span>
                                                                                    <span style={{ fontSize: '13px', fontWeight: 700, color: (expandedMetrics?.totalPnL || 0) >= 0 ? '#34d399' : '#f87171' }}>
                                                                                        {(expandedMetrics?.totalPnL || 0) >= 0 ? '+' : ''}{formatCurrency(expandedMetrics?.totalPnL || 0)}
                                                                                    </span>
                                                                                </div>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                    <span style={{ fontSize: '12px', color: '#64748b' }}>Est. ROI %</span>
                                                                                    <span style={{ fontSize: '13px', fontWeight: 700, color: (expandedMetrics?.roi || 0) >= 0 ? '#34d399' : '#f87171', display: 'flex', alignItems: 'center' }}>
                                                                                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 500, marginRight: '6px' }}>
                                                                                            ({(1 + (expandedMetrics?.roi || 0) / 100).toFixed(2)}x)
                                                                                        </span>
                                                                                        {(expandedMetrics?.roi || 0) >= 0 ? '+' : ''}{(expandedMetrics?.roi || 0).toFixed(1)}%
                                                                                    </span>
                                                                                </div>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                    <span style={{ fontSize: '12px', color: '#64748b' }}>Est. IRR % (Ann.)</span>
                                                                                    <span style={{ fontSize: '13px', fontWeight: 700, color: (expandedMetrics?.irr || 0) >= 0 ? '#34d399' : '#f87171' }}>
                                                                                        {(expandedMetrics?.irr || 0) >= 0 ? '+' : ''}{(expandedMetrics?.irr || 0).toFixed(1)}%
                                                                                    </span>
                                                                                </div>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                    <span style={{ fontSize: '12px', color: '#64748b' }}>Cap. Allocation</span>
                                                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
                                                                                        {formatCurrency(expandedMetrics?.totalCapAlloc || 0)}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </div>

                                                                {/* TRADING PERFORMANCE SECTION */}
                                                                <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(51, 65, 85, 0.5)' }}>
                                                                    <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Stock Price Performance</span>
                                                                    <div style={{ marginTop: '12px' }}>
                                                                        {expandedMetrics?.episodes?.map((ep, i) => {
                                                                            const epCount = expandedMetrics?.episodes?.length || 0;
                                                                            return (
                                                                                <div key={i} style={{ marginBottom: '10px', borderBottom: i < (epCount - 1) ? '1px solid rgba(51, 65, 85, 0.2)' : 'none', paddingBottom: i < (epCount - 1) ? '8px' : '0' }}>
                                                                                    {epCount === 1 ? (
                                                                                        /* Single Episode: Compact Row */
                                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                            <span style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 500 }}>
                                                                                                {formatQuarterLabel(ep.startQ)} — {formatQuarterLabel(ep.endQ)}
                                                                                            </span>
                                                                                            <span style={{ color: ep.perf >= 0 ? '#34d399' : '#f87171', fontWeight: 700, fontSize: '14px' }}>
                                                                                                {ep.perf >= 0 ? '+' : ''}{ep.perf.toFixed(1)}%
                                                                                            </span>
                                                                                        </div>
                                                                                    ) : (
                                                                                        /* Multiple Episodes: Stacked with Labels */
                                                                                        <>
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                                                                                                <span style={{ color: '#94a3b8', fontWeight: 500, fontSize: '12px' }}>Period {epCount - i}</span>
                                                                                                <span style={{ color: ep.perf >= 0 ? '#34d399' : '#f87171', fontWeight: 700, fontSize: '14px' }}>
                                                                                                    {ep.perf >= 0 ? '+' : ''}{ep.perf.toFixed(1)}%
                                                                                                </span>
                                                                                            </div>
                                                                                            <div style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 500 }}>
                                                                                                {formatQuarterLabel(ep.startQ)} — {formatQuarterLabel(ep.endQ)}
                                                                                            </div>
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                        {(!expandedMetrics?.episodes || expandedMetrics?.episodes?.length === 0) && (
                                                                            <span style={{ fontSize: '12px', color: '#475569' }}>N/A</span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {tickerHistory.future.length > 0 && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: 'rgba(234, 179, 8, 0.8)', backgroundColor: 'rgba(113, 63, 18, 0.1)', padding: '6px 8px', borderRadius: '4px', marginTop: '16px' }}>
                                                                        <Clock size={12} />
                                                                        <span>{tickerHistory.future.length} future quarters</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {paginatedData.length === 0 && (
                            <tr>
                                <td colSpan={8} className="empty-table-message text-center py-8 text-slate-500">
                                    No holdings found matching "{searchTerm}"
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div >

            <div className="pagination-controls-container">
                <div className="rows-selector">
                    <span>Show</span>
                    <select
                        value={itemsPerPage === processedData.length ? 'all' : itemsPerPage}
                        onChange={(e) => {
                            const val = e.target.value;
                            const newSize = val === 'all' ? processedData.length : parseInt(val);
                            setItemsPerPage(newSize);
                            setCurrentPage(1); // Reset to first page when changing size
                        }}
                        className="rows-select"
                    >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value="all">All</option>
                    </select>
                    <span>entries</span>
                </div>

                <div className="pagination-controls">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="pagination-btn"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="page-info">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="pagination-btn"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            <CsvExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                currentQuarterData={processedData.map(h => {
                    const key = getPositionKey(h);
                    const stats = allTickerStats[key] || { pnl: 0, cap: 0, roi: 0, irr: 0 };
                    const prevH = prevHoldingMap.get(key);

                    const currentWeight = totalPortfolioValue > 0 ? (h.value / totalPortfolioValue) * 100 : 0;
                    const prevWeight = (prevH && previousTotalPortfolioValue > 0) ? (prevH.value / previousTotalPortfolioValue) * 100 : 0;

                    // Price Delta logic (simplified for export)
                    const p2 = h.shares > 0 ? h.value / h.shares : 0;
                    const p1 = (prevH && prevH.shares > 0) ? prevH.value / prevH.shares : 0;
                    let priceDelta = 0;
                    if (p1 > 0) {
                        // Basic split detection for export
                        const shareRatio = h.shares > 0 ? h.shares / prevH!.shares : 1;
                        const priceRatio = p2 / p1;
                        const valueRatio = h.value / prevH!.value;
                        let adjustedP1 = p1;
                        if (shareRatio > 1.4 && priceRatio < 0.72 && valueRatio > 0.5 && valueRatio < 2.5) {
                            adjustedP1 = p1 / shareRatio;
                        }
                        priceDelta = ((p2 / adjustedP1) - 1) * 100;
                    }

                    return {
                        ...h,
                        percent: currentWeight,
                        deltaShares: h.shares - (prevH?.shares || 0),
                        deltaValue: h.value - (prevH?.value || 0),
                        percent_delta: currentWeight - prevWeight,
                        price_delta: priceDelta,
                        cap_allocation: stats.cap,
                        roi: stats.roi,
                        irr: stats.irr
                    };
                })}
                fullHistoryData={history.map(h => {
                    const key = getPositionKey(h);
                    const stats = allTickerStats[key] || { pnl: 0, cap: 0, roi: 0, irr: 0 };

                    const period = h.period_of_report;
                    const quarterIdx = sortedQuarters.indexOf(period);
                    const prevPeriod = sortedQuarters[quarterIdx + 1];
                    const prevH = prevPeriod ? historicalDataMap[prevPeriod]?.get(key) : undefined;

                    const qTotal = quarterTotals[period] || 0;
                    const prevQTotal = prevPeriod ? quarterTotals[prevPeriod] : 0;

                    const currentWeight = qTotal > 0 ? (h.value / qTotal) * 100 : 0;
                    const prevWeight = (prevH && prevQTotal > 0) ? (prevH.value / prevQTotal) * 100 : 0;

                    // Price Delta logic (simplified for export)
                    const p2 = h.shares > 0 ? h.value / h.shares : 0;
                    const p1 = (prevH && prevH.shares > 0) ? prevH.value / prevH.shares : 0;
                    let priceDelta = 0;
                    if (p1 > 0) {
                        const shareRatio = h.shares > 0 ? h.shares / prevH!.shares : 1;
                        const priceRatio = p2 / p1;
                        const valueRatio = h.value / prevH!.value;
                        let adjustedP1 = p1;
                        if (shareRatio > 1.4 && priceRatio < 0.72 && valueRatio > 0.5 && valueRatio < 2.5) {
                            adjustedP1 = p1 / shareRatio;
                        }
                        priceDelta = ((p2 / adjustedP1) - 1) * 100;
                    }

                    return {
                        ...h,
                        percent: currentWeight,
                        deltaShares: h.shares - (prevH?.shares || 0),
                        deltaValue: h.value - (prevH?.value || 0),
                        percent_delta: currentWeight - prevWeight,
                        price_delta: priceDelta,
                        cap_allocation: stats.cap,
                        roi: stats.roi,
                        irr: stats.irr
                    };
                }).sort((a, b) => {
                    // Sort history export by period (desc) then value (desc)
                    if (a.period_of_report !== b.period_of_report) {
                        return new Date(b.period_of_report).getTime() - new Date(a.period_of_report).getTime();
                    }
                    return b.value - a.value;
                })}
                availableQuarters={sortedQuarters}
                fundName={fundName}
                quarterLabel={formatQuarterLabel(currentQuarterDate)}
            />
            {/* Anchored Copyright Notice */}

        </div>
    );
};
