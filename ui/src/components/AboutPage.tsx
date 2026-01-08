import React from 'react';
import { Info, BarChart3, TrendingUp, Activity, Target, GitFork } from 'lucide-react';

export const AboutPage: React.FC = () => {
    return (
        <div className="about-page" style={{ padding: '32px', color: '#e2e8f0', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ marginBottom: '40px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <Info className="text-blue-400" size={32} />
                    Methodology & Metrics
                </h1>
                <p style={{ fontSize: '16px', color: '#94a3b8', lineHeight: 1.6 }}>
                    This application aggregates, visualizes, and calculates estimated performance metrics for hedge fund holdings using SEC 13F-HR filings.
                    It displays position-level data with historical tracking, composition charts, and performance analytics.
                    Since 13F data only captures long equity positions at quarter-end, the performance metrics below are estimates derived from reported share counts and market values.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '24px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#60a5fa' }}>
                        <TrendingUp size={20} />
                        Est. PnL (Price Action)
                    </h2>
                    <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.5, marginBottom: '16px' }}>
                        Wealth generated solely by the change in a stock's market price. This isolates "Trading Alpha" from the noise of capital inflows or outflows.
                    </p>
                    <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8' }}>
                        PnL = Σ (Price_t - Price_t-1) × Shares_t-1
                    </div>
                </div>

                <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '24px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#34d399' }}>
                        <Target size={20} />
                        Est. ROI % (Return on Committed Capital)
                    </h2>
                    <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.5, marginBottom: '16px' }}>
                        Total percentage return relative to the actual cash the fund put at risk. We anchor this to <strong>Total Committed Capital</strong> (the sum of all purchases) to prevent misleading results when a fund is playing with "House Money."
                    </p>
                    <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8' }}>
                        ROI % = (Total PnL / Total Committed Capital) × 100
                    </div>
                </div>

                <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '24px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#f59e0b' }}>
                        <Activity size={20} />
                        Est. IRR % (Annualized Internal Rate of Return)
                    </h2>
                    <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.5, marginBottom: '16px' }}>
                        The gold standard of performance tracking. Accounts for the time-value of money by solving for the internal discount rate using the robust Bisection method over quarterly cash flows.
                    </p>
                    <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8' }}>
                        Annualized IRR = ((1 + Quarterly_IRR)^4 - 1) × 100
                    </div>
                </div>

                <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '24px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#3b82f6' }}>
                        <TrendingUp size={20} />
                        Time-Weighted Return (TWR)
                    </h2>
                    <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.5, marginBottom: '16px' }}>
                        Used in the Global Comparison Chart. TWR eliminates the distorting effects on growth rates created by cash inflows and outflows, isolating the true investment performance of the manager.
                    </p>
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#94a3b8' }}>1. Estimate Net Flow:</div>
                        <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '8px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                            Net Flow = Σ [(Shares_t - Shares_prev) × Price_t]
                        </div>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#94a3b8' }}>2. Calculate Period Return:</div>
                        <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '8px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                            R_period = (Total Value_t - Net Flow) / Total Value_prev - 1
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#94a3b8' }}>3. Compound Cumulative Return:</div>
                        <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '8px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                            Cumulative = [(1 + R1) × (1 + R2) × ... × (1 + Rn)] - 1
                        </div>
                    </div>
                </div>

                <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '24px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#94a3b8' }}>
                        <BarChart3 size={20} />
                        Cap. Allocation (Net Spend)
                    </h2>
                    <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.5, marginBottom: '16px' }}>
                        The net dollar amount the fund has invested in a position. If negative, the fund has "taken the principal off the table" and is holding a profit-only position.
                    </p>
                    <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8' }}>
                        Net Cap Alloc = Ending Value - Total PnL
                    </div>
                </div>

                <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '24px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#60a5fa' }}>
                        <Activity size={20} />
                        Est. Portfolio Turnover %
                    </h2>
                    <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.5, marginBottom: '16px' }}>
                        An estimate of how frequently the manager trades their portfolio. Because 13F filings are only quarterly snapshots, this metric serves as a <strong>proxy for activity</strong>.
                    </p>
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#94a3b8' }}>Methodology:</div>
                        <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.4, marginBottom: '8px' }}>
                            We sum the absolute value of all position changes (buys and sells) to capture total rebalancing activity. We divide by 2 to normalize (preventing double-counting of typical buy-sell rotation) and then by the average AUM of the period.
                        </p>
                    </div>
                    <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8' }}>
                        Turnover = (Σ |Value_t - Value_prev|) / 2 / Avg_AUM
                    </div>
                </div>

                <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '24px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#a855f7' }}>
                        <GitFork size={20} />
                        Automated Split Detection
                    </h2>
                    <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.5, marginBottom: '16px' }}>
                        13F filings do not report corporate actions. We detect stock splits by identifying when share counts spike, prices drop proportionally, but total value remains stable (0.5x-2.5x). This ensures historical performance is calculated accurately on a split-adjusted basis.
                    </p>
                    <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8' }}>
                        Trigger: (Shares ↑ &gt; 1.4x) AND (Price ↓ &lt; 0.72x) AND (Value stable 0.5x-2.5x)
                    </div>
                </div>
            </div>
        </div>
    );
};
