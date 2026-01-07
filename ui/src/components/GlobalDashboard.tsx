import React, { useState } from 'react';
import { TrendingUp, Activity, ChevronRight, ArrowUp, ArrowDown, Info, LayoutGrid, Briefcase, DollarSign, PlusCircle, MinusCircle, Users, Sparkles } from 'lucide-react';

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

type MoversMode = 'dollar' | 'percent' | 'funds';

export const GlobalDashboard: React.FC<GlobalDashboardProps> = ({ summary, onSelectFund }) => {
    const [moversMode, setMoversMode] = useState<MoversMode>('dollar');
    const [moverTooltip, setMoverTooltip] = useState<{ x: number, y: number, ticker: string } | null>(null);
    const [crowdingTooltip, setCrowdingTooltip] = useState<{ x: number, y: number, ticker: string } | null>(null);
    const [kpiTooltip, setKpiTooltip] = useState<{ x: number, y: number, type: string } | null>(null);
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
                                {newPositions.slice(0, 8).map((pos, i) => (
                                    <div key={i} className="tooltip-position-row">
                                        <span className="pos-ticker">{pos.ticker || 'N/A'}</span>
                                        <span className="pos-fund">{pos.fund_name}</span>
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
                                {exitedPositions.slice(0, 8).map((pos, i) => (
                                    <div key={i} className="tooltip-position-row">
                                        <span className="pos-ticker">{pos.ticker || 'N/A'}</span>
                                        <span className="pos-fund">{pos.fund_name}</span>
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
                                            <span className="stat-value">{fund.concentration?.toFixed(0) || '—'}%</span>
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
                            </div>

                            <div className="new-positions-list scrollable">
                                {newPositions.map((pos, i) => (
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
                            </div>

                            <div className="exited-positions-list scrollable">
                                {exitedPositions.map((pos, i) => (
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
