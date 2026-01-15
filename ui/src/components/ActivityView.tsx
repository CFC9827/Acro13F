import { useState, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Filter } from 'lucide-react';

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
    portfolioImpact: number;
}

type ActivityFilter = 'all' | 'buys' | 'sells';

interface ActivityViewProps {
    history: HistoricalHolding[];
}

const formatQ = (dateStr: string) => {
    const d = new Date(dateStr);
    const q = Math.floor((d.getMonth() + 3) / 3);
    return `Q${q} ${d.getFullYear()}`;
};

const formatNumber = (num: number) => {
    return num.toLocaleString();
};

export function ActivityView({ history }: ActivityViewProps) {
    const [filter, setFilter] = useState<ActivityFilter>('all');

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
                // Aggregate same ticker in same period
                existing.shares += h.shares;
                existing.value += h.value;
            } else {
                periodMap.get(period)!.set(key, { ...h });
            }
        }

        // Sort periods chronologically
        const sortedPeriods = Array.from(periodMap.keys()).sort();

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

                if (!prev) {
                    // New position (Buy)
                    activities.push({
                        period: currPeriod,
                        ticker,
                        issuer_name: curr.issuer_name,
                        activityType: 'Buy',
                        activityPercent: 0,
                        shareChange: curr.shares,
                        portfolioImpact: currTotal > 0 ? (curr.value * 100 / currTotal) : 0
                    });
                } else if (curr.shares > prev.shares) {
                    // Added to position
                    const pctChange = ((curr.shares - prev.shares) * 100 / prev.shares);
                    activities.push({
                        period: currPeriod,
                        ticker,
                        issuer_name: curr.issuer_name,
                        activityType: 'Add',
                        activityPercent: pctChange,
                        shareChange: curr.shares - prev.shares,
                        portfolioImpact: currTotal > 0 ? (curr.value * 100 / currTotal) : 0
                    });
                } else if (curr.shares < prev.shares) {
                    // Reduced position
                    const pctChange = ((prev.shares - curr.shares) * 100 / prev.shares);
                    activities.push({
                        period: currPeriod,
                        ticker,
                        issuer_name: curr.issuer_name,
                        activityType: 'Reduce',
                        activityPercent: pctChange,
                        shareChange: curr.shares - prev.shares,
                        portfolioImpact: currTotal > 0 ? (curr.value * 100 / currTotal) : 0
                    });
                }
            }

            // Check for exited positions
            for (const [key, prev] of prevHoldings.entries()) {
                if (!currHoldings.has(key)) {
                    const ticker = prev.ticker || prev.cusip;
                    activities.push({
                        period: currPeriod,
                        ticker,
                        issuer_name: prev.issuer_name,
                        activityType: 'Sell',
                        activityPercent: 100,
                        shareChange: -prev.shares,
                        portfolioImpact: 0
                    });
                }
            }
        }

        // Sort by period descending, then by absolute portfolio impact
        activities.sort((a, b) => {
            if (a.period !== b.period) return b.period.localeCompare(a.period);
            return Math.abs(b.portfolioImpact) - Math.abs(a.portfolioImpact);
        });

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

    // Group by period for display
    const groupedByPeriod = useMemo(() => {
        const groups = new Map<string, ActivityItem[]>();
        for (const item of filteredActivities) {
            if (!groups.has(item.period)) {
                groups.set(item.period, []);
            }
            groups.get(item.period)!.push(item);
        }
        return groups;
    }, [filteredActivities]);

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
        <div className="activity-view">
            <div className="activity-header">
                <h3>Trading Activity</h3>
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
            </div>

            <div className="activity-table-container">
                <table className="activity-table">
                    <thead>
                        <tr>
                            <th style={{ width: '25%' }}>Stock</th>
                            <th style={{ width: '20%' }}>Activity</th>
                            <th style={{ width: '20%', textAlign: 'right' }}>Share Change</th>
                            <th style={{ width: '20%', textAlign: 'right' }}>% of Portfolio</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from(groupedByPeriod.entries()).map(([period, items]) => (
                            <>
                                <tr key={`header-${period}`} className="activity-period-header">
                                    <td colSpan={4}>{formatQ(period)}</td>
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
                                            {formatNumber(Math.abs(item.shareChange))}
                                        </td>
                                        <td className="activity-impact">
                                            {item.portfolioImpact.toFixed(2)}%
                                        </td>
                                    </tr>
                                ))}
                            </>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
