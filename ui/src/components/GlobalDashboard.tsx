import React from 'react';
import { TrendingUp, Activity, ChevronRight, ArrowUp, ArrowDown, Info, LayoutGrid, Briefcase, DollarSign, PlusCircle, MinusCircle } from 'lucide-react';

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

interface DashboardSummary {
    fund_highlights: FundHighlight[];
    big_movers: Mover[];
    portfolio_shifts: Shift[];
    latest_period?: string;
    prior_period?: string;
    kpis?: KPIs;
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

export const GlobalDashboard: React.FC<GlobalDashboardProps> = ({ summary, onSelectFund }) => {
    const kpis = summary.kpis;
    const aumChange = kpis ? kpis.total_aum - kpis.prior_aum : 0;
    const aumChangePercent = kpis && kpis.prior_aum > 0 ? ((aumChange / kpis.prior_aum) * 100).toFixed(1) : '0';

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

                {/* Right Column: Movers & Shifts */}
                <div className="dashboard-sidebar">
                    <section className="dashboard-section compact">
                        <div className="section-header">
                            <TrendingUp className="section-icon-small" />
                            <h3 className="section-title-small">
                                Big Movers ($ Change)
                                <span className="info-tooltip" title="Largest net position changes across all tracked funds (QoQ, $ notional)">
                                    <Info size={12} />
                                </span>
                            </h3>
                        </div>

                        <div className="movers-list">
                            {summary.big_movers.slice(0, 8).map((mover, i) => (
                                <div key={i} className="mover-item">
                                    <div className="mover-info">
                                        <span className="mover-ticker">{mover.ticker || 'N/A'}</span>
                                        <span className="mover-fund">{mover.fund_name}</span>
                                    </div>
                                    <div className={`mover-delta ${mover.val_change >= 0 ? 'positive' : 'negative'}`}>
                                        {mover.val_change >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                                        {formatCurrency(mover.val_change)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="dashboard-section compact mt-1">
                        <div className="section-header">
                            <Activity className="section-icon-small" />
                            <h3 className="section-title-small">
                                Portfolio Shifts
                                <span className="info-tooltip" title="Positions with weight changes ≥ 3% (QoQ)">
                                    <Info size={12} />
                                </span>
                            </h3>
                        </div>

                        <div className="shifts-list">
                            {summary.portfolio_shifts.slice(0, 8).map((shift, i) => (
                                <div key={i} className="shift-item">
                                    <div className="shift-info">
                                        <span className="shift-ticker">{shift.ticker || 'N/A'}</span>
                                        <span className="shift-fund">{shift.fund_name}</span>
                                    </div>
                                    <div className={`shift-weight ${shift.weight_delta >= 0 ? 'positive' : 'negative'}`}>
                                        {shift.weight_delta >= 0 ? '+' : ''}{shift.weight_delta.toFixed(1)}%
                                        <span className="weight-current">@ {shift.curr_weight.toFixed(1)}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
