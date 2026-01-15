import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Filter, Download, ChevronUp, ChevronDown, Flame, Target } from 'lucide-react';
import { ActivityExportModal } from './ActivityExportModal';

interface HistoricalHolding {
    period_of_report: string;
    ticker?: string;
    issuer_name: string;
    cusip: string;
    shares: number;
    value: number;
    put_call?: string;
}

interface ActivityItem {
    period: string;
    ticker: string;
    issuer_name: string;
    activityType: 'Buy' | 'Sell' | 'Add' | 'Reduce';
    activityPercent: number;
    shareChange: number;
    valueTraded: number;
    portfolioImpact: number;
    conviction?: 'building' | 'exiting' | null;
    consecutiveQuarters?: number;
}

type ActivityFilter = 'all' | 'buys' | 'sells';
type SortField = 'ticker' | 'activity' | 'shares' | 'value' | 'portfolio';
type SortDirection = 'asc' | 'desc';

interface ActivityViewProps {
    history: HistoricalHolding[];
    fundName?: string;
}

const formatQ = (dateStr: string) => {
    const d = new Date(dateStr);
    const q = Math.floor((d.getMonth() + 3) / 3);
    return `Q${q} ${d.getFullYear()}`;
};

const formatNumber = (num: number) => {
    return num.toLocaleString();
};

const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
};

export function ActivityView({ history, fundName = 'Fund' }: ActivityViewProps) {
    const [filter, setFilter] = useState<ActivityFilter>('all');
    const [sortField, setSortField] = useState<SortField>('portfolio');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [showExportModal, setShowExportModal] = useState(false);

    // Compute activity from historical holdings
    const activityData = useMemo(() => {
        if (!history || history.length === 0) return [];

        // Group holdings by period
        const periodMap = new Map<string, Map<string, HistoricalHolding>>();
        for (const h of history) {
            const period = h.period_of_report;
            if (!periodMap.has(period)) {
                periodMap.set(period, new Map());
            }
            const key = (h.ticker || h.cusip) + (h.put_call ? `_${h.put_call}` : '');
            const existing = periodMap.get(period)!.get(key);
            if (existing) {
                existing.shares += h.shares;
                existing.value += h.value;
            } else {
                periodMap.get(period)!.set(key, { ...h });
            }
        }

        // Sort periods chronologically
        const sortedPeriods = Array.from(periodMap.keys()).sort();

        // Track conviction patterns (consecutive quarters of same direction)
        const tickerPatterns = new Map<string, { direction: 'up' | 'down' | null; count: number; lastPeriod: string }>();

        const activities: ActivityItem[] = [];

        // Compare consecutive periods
        for (let i = 1; i < sortedPeriods.length; i++) {
            const prevPeriod = sortedPeriods[i - 1];
            const currPeriod = sortedPeriods[i];
            const prevHoldings = periodMap.get(prevPeriod)!;
            const currHoldings = periodMap.get(currPeriod)!;

            // Calculate total portfolio value for current period
            let currTotal = 0;
            for (const h of currHoldings.values()) {
                currTotal += h.value;
            }

            // Check for new positions and changes
            for (const [key, curr] of currHoldings.entries()) {
                const prev = prevHoldings.get(key);
                const ticker = curr.ticker || curr.cusip;

                let activity: ActivityItem | null = null;

                if (!prev) {
                    // New position (Buy)
                    activity = {
                        period: currPeriod,
                        ticker,
                        issuer_name: curr.issuer_name,
                        activityType: 'Buy',
                        activityPercent: 0,
                        shareChange: curr.shares,
                        valueTraded: curr.value,
                        portfolioImpact: currTotal > 0 ? (curr.value * 100 / currTotal) : 0
                    };
                } else if (curr.shares > prev.shares) {
                    // Added to position
                    const pctChange = ((curr.shares - prev.shares) * 100 / prev.shares);
                    const pricePerShare = curr.value / curr.shares;
                    const valueTraded = (curr.shares - prev.shares) * pricePerShare;
                    activity = {
                        period: currPeriod,
                        ticker,
                        issuer_name: curr.issuer_name,
                        activityType: 'Add',
                        activityPercent: pctChange,
                        shareChange: curr.shares - prev.shares,
                        valueTraded: valueTraded,
                        portfolioImpact: currTotal > 0 ? (curr.value * 100 / currTotal) : 0
                    };
                } else if (curr.shares < prev.shares) {
                    // Reduced position
                    const pctChange = ((prev.shares - curr.shares) * 100 / prev.shares);
                    const pricePerShare = curr.value / curr.shares;
                    const valueTraded = (prev.shares - curr.shares) * pricePerShare;
                    activity = {
                        period: currPeriod,
                        ticker,
                        issuer_name: curr.issuer_name,
                        activityType: 'Reduce',
                        activityPercent: pctChange,
                        shareChange: curr.shares - prev.shares,
                        valueTraded: valueTraded,
                        portfolioImpact: currTotal > 0 ? (curr.value * 100 / currTotal) : 0
                    };
                }

                if (activity) {
                    // Track conviction patterns
                    const direction = (activity.activityType === 'Buy' || activity.activityType === 'Add') ? 'up' : 'down';
                    const pattern = tickerPatterns.get(ticker);

                    if (pattern && pattern.direction === direction) {
                        pattern.count++;
                        pattern.lastPeriod = currPeriod;
                    } else {
                        tickerPatterns.set(ticker, { direction, count: 1, lastPeriod: currPeriod });
                    }

                    const currentPattern = tickerPatterns.get(ticker)!;
                    if (currentPattern.count >= 2 && currentPattern.lastPeriod === currPeriod) {
                        activity.conviction = direction === 'up' ? 'building' : 'exiting';
                        activity.consecutiveQuarters = currentPattern.count;
                    }

                    activities.push(activity);
                }
            }

            // Check for exited positions
            for (const [key, prev] of prevHoldings.entries()) {
                if (!currHoldings.has(key)) {
                    const ticker = prev.ticker || prev.cusip;
                    const activity: ActivityItem = {
                        period: currPeriod,
                        ticker,
                        issuer_name: prev.issuer_name,
                        activityType: 'Sell',
                        activityPercent: 100,
                        shareChange: -prev.shares,
                        valueTraded: prev.value,
                        portfolioImpact: 0
                    };

                    // Check for exiting pattern
                    const pattern = tickerPatterns.get(ticker);
                    if (pattern && pattern.direction === 'down') {
                        pattern.count++;
                        activity.conviction = 'exiting';
                        activity.consecutiveQuarters = pattern.count;
                    }

                    activities.push(activity);
                }
            }
        }

        return activities;
    }, [history]);

    // Filter activities based on selected filter
    const filteredActivities = useMemo(() => {
        if (filter === 'all') return activityData;
        if (filter === 'buys') {
            return activityData.filter(a => a.activityType === 'Buy' || a.activityType === 'Add');
        }
        return activityData.filter(a => a.activityType === 'Sell' || a.activityType === 'Reduce');
    }, [activityData, filter]);

    // Sort activities
    const sortedActivities = useMemo(() => {
        const sorted = [...filteredActivities];

        sorted.sort((a, b) => {
            // Always group by period first (descending)
            if (a.period !== b.period) return b.period.localeCompare(a.period);

            // Then sort by selected field within period
            let comparison = 0;
            switch (sortField) {
                case 'ticker':
                    comparison = a.ticker.localeCompare(b.ticker);
                    break;
                case 'activity':
                    comparison = a.activityPercent - b.activityPercent;
                    break;
                case 'shares':
                    comparison = Math.abs(a.shareChange) - Math.abs(b.shareChange);
                    break;
                case 'value':
                    comparison = a.valueTraded - b.valueTraded;
                    break;
                case 'portfolio':
                    comparison = a.portfolioImpact - b.portfolioImpact;
                    break;
            }
            return sortDirection === 'desc' ? -comparison : comparison;
        });

        return sorted;
    }, [filteredActivities, sortField, sortDirection]);

    // Group by period for display
    const groupedByPeriod = useMemo(() => {
        const groups = new Map<string, ActivityItem[]>();
        for (const item of sortedActivities) {
            if (!groups.has(item.period)) {
                groups.set(item.period, []);
            }
            groups.get(item.period)!.push(item);
        }
        return groups;
    }, [sortedActivities]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // Get unique available quarters from activity data
    const availableQuarters = useMemo(() => {
        const quarters = Array.from(new Set(activityData.map(a => a.period))).sort().reverse();
        return quarters;
    }, [activityData]);

    const openExportModal = () => {
        setShowExportModal(true);
    };

    const getActivityLabel = (item: ActivityItem) => {
        if (item.activityType === 'Buy') return 'Buy';
        if (item.activityType === 'Sell') return 'Sell 100%';
        if (item.activityType === 'Add') return `Add ${item.activityPercent.toFixed(2)}%`;
        return `Reduce ${item.activityPercent.toFixed(2)}%`;
    };

    const getActivityClass = (type: string) => {
        if (type === 'Buy' || type === 'Add') return 'activity-buy';
        return 'activity-sell';
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortDirection === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />;
    };

    if (activityData.length === 0) {
        return (
            <div className="activity-view">
                <div className="activity-empty">
                    <Filter size={48} />
                    <p>No activity data available. Need at least 2 quarters of history.</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="activity-view">
                <div className="activity-header">
                    <h3>Trading Activity</h3>
                    <div className="activity-controls">
                        <div className="activity-filters">
                            <button
                                className={`activity-filter-btn ${filter === 'all' ? 'active' : ''}`}
                                onClick={() => setFilter('all')}
                            >
                                Total Activity
                            </button>
                            <button
                                className={`activity-filter-btn ${filter === 'buys' ? 'active' : ''}`}
                                onClick={() => setFilter('buys')}
                            >
                                <TrendingUp size={14} />
                                Buys
                            </button>
                            <button
                                className={`activity-filter-btn ${filter === 'sells' ? 'active' : ''}`}
                                onClick={() => setFilter('sells')}
                            >
                                <TrendingDown size={14} />
                                Sells
                            </button>
                        </div>
                        <button className="activity-export-btn" onClick={openExportModal} title="Export to CSV">
                            <Download size={16} />
                            Export CSV
                        </button>
                    </div>
                </div>

                <div className="activity-table-container">
                    <table className="activity-table">
                        <thead>
                            <tr>
                                <th
                                    className="sortable"
                                    onClick={() => handleSort('ticker')}
                                    style={{ width: '22%' }}
                                >
                                    Stock <SortIcon field="ticker" />
                                </th>
                                <th
                                    className="sortable"
                                    onClick={() => handleSort('activity')}
                                    style={{ width: '18%' }}
                                >
                                    Activity <SortIcon field="activity" />
                                </th>
                                <th
                                    className="sortable"
                                    onClick={() => handleSort('shares')}
                                    style={{ width: '15%', textAlign: 'right' }}
                                >
                                    Shares Δ <SortIcon field="shares" />
                                </th>
                                <th
                                    className="sortable"
                                    onClick={() => handleSort('value')}
                                    style={{ width: '15%', textAlign: 'right' }}
                                >
                                    Value <SortIcon field="value" />
                                </th>
                                <th
                                    className="sortable"
                                    onClick={() => handleSort('portfolio')}
                                    style={{ width: '15%', textAlign: 'right' }}
                                >
                                    % Portfolio <SortIcon field="portfolio" />
                                </th>
                                <th style={{ width: '15%', textAlign: 'center' }}>Signal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from(groupedByPeriod.entries()).map(([period, items]) => (
                                <>
                                    <tr key={`header-${period}`} className="activity-period-header">
                                        <td colSpan={6}>{formatQ(period)}</td>
                                    </tr>
                                    {items.map((item, idx) => (
                                        <tr key={`${period}-${item.ticker}-${idx}`} className="activity-row">
                                            <td className="activity-stock">
                                                <span className="activity-ticker">{item.ticker}</span>
                                                <span className="activity-issuer">{item.issuer_name}</span>
                                            </td>
                                            <td>
                                                <span className={`activity-badge ${getActivityClass(item.activityType)}`}>
                                                    {getActivityLabel(item)}
                                                </span>
                                            </td>
                                            <td className={`activity-shares ${item.shareChange >= 0 ? 'positive' : 'negative'}`}>
                                                {item.shareChange >= 0 ? '+' : ''}{formatNumber(item.shareChange)}
                                            </td>
                                            <td className="activity-value">
                                                {formatCurrency(item.valueTraded)}
                                            </td>
                                            <td className="activity-impact">
                                                {item.portfolioImpact.toFixed(2)}%
                                            </td>
                                            <td className="activity-conviction">
                                                {item.conviction === 'building' && (
                                                    <span className="conviction-badge building" title={`Building position for ${item.consecutiveQuarters} consecutive quarters`}>
                                                        <Flame size={14} />
                                                        {item.consecutiveQuarters}Q
                                                    </span>
                                                )}
                                                {item.conviction === 'exiting' && (
                                                    <span className="conviction-badge exiting" title={`Exiting position for ${item.consecutiveQuarters} consecutive quarters`}>
                                                        <Target size={14} />
                                                        {item.consecutiveQuarters}Q
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <ActivityExportModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                activityData={activityData}
                availableQuarters={availableQuarters}
                fundName={fundName}
            />
        </>
    );
}

