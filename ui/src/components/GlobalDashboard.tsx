import React, { useState } from 'react';
import { TrendingUp, Activity, ChevronRight, ArrowUp, ArrowDown, Info, LayoutGrid, Briefcase, DollarSign, PlusCircle, MinusCircle, Users, Sparkles } from 'lucide-react';

interface Holding {
    ticker?: string;
    issuer_name: string;
    value: number;
    shares: number;
}

interface FundHighlight {
    cik: string;
    name: string;
    total_value: number;
    period: string;
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
    };
}

interface DashboardSummary {
    fund_highlights: FundHighlight[];
    big_movers: Mover[];
    portfolio_shifts: Shift[];
    latest_period?: string;
    prior_period?: string;
    kpis?: KPIs;
    crowding_signals?: CrowdingSignals;
    new_positions?: NewPosition[];
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

type MoversMode = 'dollar' | 'percent' | 'funds';

export const GlobalDashboard: React.FC<GlobalDashboardProps> = ({ summary, onSelectFund }) => {
    const [moversMode, setMoversMode] = useState<MoversMode>('dollar');
    const kpis = summary.kpis;
    const aumChange = kpis ? kpis.total_aum - kpis.prior_aum : 0;
    const aumChangePercent = kpis && kpis.prior_aum > 0 ? ((aumChange / kpis.prior_aum) * 100).toFixed(1) : '0';
    const crowding = summary.crowding_signals;
    const newPositions = summary.new_positions || [];
    const tickerActivity = summary.ticker_fund_activity || {};

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
                    <p className="dashboard-time-context">
                        Data reflects latest filed 13Fs ({formatQ(summary.latest_period)}).
                        {summary.prior_period && ` Changes are vs ${formatQ(summary.prior_period)}.`}
                    </p>
                )}
            </div>

            {/* KPI Tiles */}
            {kpis && (
                <div className="kpi-tiles-row">
                    <div className="kpi-tile">
                        <div className="kpi-icon"><Briefcase size={18} /></div>
                        <div className="kpi-content">
                            <span className="kpi-value">{kpis.fund_count}</span>
                            <span className="kpi-label">Tracked Funds</span>
                        </div>
                    </div>
                    <div className="kpi-tile">
                        <div className="kpi-icon"><DollarSign size={18} /></div>
                        <div className="kpi-content">
                            <span className="kpi-value">{formatCurrency(kpis.total_aum)}</span>
                            <span className="kpi-label">Total AUM</span>
                        </div>
                    </div>
                    <div className="kpi-tile">
                        <div className={`kpi-icon ${aumChange >= 0 ? 'positive' : 'negative'}`}>
                            {aumChange >= 0 ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                        </div>
                        <div className="kpi-content">
                            <span className={`kpi-value ${aumChange >= 0 ? 'positive' : 'negative'}`}>
                                {aumChange >= 0 ? '+' : ''}{aumChangePercent}%
                            </span>
                            <span className="kpi-label">AUM Δ QoQ</span>
                        </div>
                    </div>
                    <div className="kpi-tile">
                        <div className="kpi-icon positive"><PlusCircle size={18} /></div>
                        <div className="kpi-content">
                            <span className="kpi-value positive">{kpis.new_positions}</span>
                            <span className="kpi-label">New Positions</span>
                        </div>
                    </div>
                    <div className="kpi-tile">
                        <div className="kpi-icon negative"><MinusCircle size={18} /></div>
                        <div className="kpi-content">
                            <span className="kpi-value negative">{kpis.exited_positions}</span>
                            <span className="kpi-label">Exited</span>
                        </div>
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
                                    <span className="info-tooltip" title="Long equity positions per 13F. Excludes derivatives and short positions.">
                                        <Info size={12} />
                                    </span>
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
                                            <span className="fund-period">{formatQ(fund.period)}</span>
                                        </div>
                                        <div className="fund-value">{formatCurrency(fund.total_value)}</div>
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
                                            </div>
                                        ))}
                                    </div>

                                    <div className="card-footer">
                                        <span>View Full Portfolio</span>
                                        <ChevronRight size={14} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
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
                                    return (
                                        <div key={i} className="mover-item">
                                            <div className="mover-info">
                                                <span className="mover-ticker">{mover.ticker || 'N/A'}</span>
                                                <span className="mover-fund">{mover.fund_name}</span>
                                            </div>
                                            <div className={`mover-delta ${moversMode !== 'funds' ? (isPositive ? 'positive' : 'negative') : ''}`}>
                                                {moversMode !== 'funds' && (isPositive ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                                                {getMoverDisplay(mover)}
                                                {moversMode === 'percent' && mover.curr_weight !== undefined && (
                                                    <span className="weight-current">@ {mover.curr_weight.toFixed(1)}%</span>
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
                                        {crowding.most_held.slice(0, 3).map((item, i) => (
                                            <div key={i} className="crowding-item">
                                                <span className="crowding-ticker">{item.ticker || 'N/A'}</span>
                                                <span className="crowding-count">{item.fund_count} funds</span>
                                            </div>
                                        ))}
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
                                <Sparkles className="section-icon-small" />
                                <div>
                                    <h3 className="section-title-small">New This Quarter</h3>
                                    <p className="section-desc-small">First-time positions and initial weights</p>
                                </div>
                            </div>

                            <div className="new-positions-list scrollable">
                                {newPositions.map((pos, i) => (
                                    <div key={i} className="new-position-item">
                                        <div className="new-position-info">
                                            <span className="new-position-ticker">{pos.ticker || 'N/A'}</span>
                                            <span className="new-position-fund">{pos.fund_name}</span>
                                        </div>
                                        <div className="new-position-weight">
                                            {pos.weight.toFixed(1)}%
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
