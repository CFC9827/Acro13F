import React from 'react';
import {
    Info,
    BarChart3,
    TrendingUp,
    Activity,
    Target,
    GitFork,
    LayoutGrid,
    Layers,
    Clock,
    Database,
    MousePointer2,
    PieChart,
    Search,
    PlusCircle
} from 'lucide-react';

export const AboutPage: React.FC = () => {
    return (
        <div className="about-page" style={{ padding: '32px 32px 64px 32px', color: '#e2e8f0', maxWidth: '1000px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '48px', textAlign: 'center' }}>
                <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#f8fafc', marginBottom: '16px', letterSpacing: '-0.02em' }}>
                    Institutional Exposure <span style={{ color: '#38bdf8' }}>& Performance Analytics</span>
                </h1>
                <p style={{ fontSize: '18px', color: '#94a3b8', maxWidth: '800px', margin: '0 auto', lineHeight: 1.6 }}>
                    A systematic framework for dissecting institutional positioning, isolating manager alpha,
                    and quantifying net capital flows using SEC persistent metadata.
                </p>
            </div>

            {/* Quick Start for New Users */}
            <div style={{ marginBottom: '64px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{
                        background: 'rgba(59, 130, 246, 0.1)',
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <PlusCircle className="text-blue-400" size={24} />
                    </div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Getting Started</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                    {[
                        {
                            step: "01",
                            title: "Add a Fund",
                            desc: "Use the 'Add Fund' button in the sidebar. Search by manager name or enter a 10-digit SEC CIK."
                        },
                        {
                            step: "02",
                            title: "Initial Sync",
                            desc: "The engine pulls 10 years of history. First sync takes 30-60s to resolve splits and CUSIPs."
                        },
                        {
                            step: "03",
                            title: "Explore Alpha",
                            desc: "Analyze conviction signals, sector rotation, and manager performance once synced."
                        }
                    ].map((item, i) => (
                        <div key={i} style={{
                            background: 'rgba(30, 41, 59, 0.3)',
                            border: '1px solid rgba(51, 65, 85, 0.3)',
                            borderRadius: '16px',
                            padding: '24px',
                            position: 'relative'
                        }}>
                            <div style={{
                                position: 'absolute',
                                top: '20px',
                                right: '24px',
                                fontSize: '24px',
                                fontWeight: 900,
                                opacity: 0.05,
                                color: '#3b82f6'
                            }}>
                                {item.step}
                            </div>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>{item.title}</h3>
                            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* 1. What is this generally? */}
            <div style={{ marginBottom: '64px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{
                        background: 'rgba(56, 189, 248, 0.1)',
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <Info className="text-blue-400" size={24} />
                    </div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Investment Thesis & Methodology</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                    <div>
                        <p style={{ fontSize: '15px', color: '#cbd5e1', lineHeight: 1.7, marginBottom: '20px' }}>
                            This engine transforms raw SEC 13F-HR filings into high-fidelity investment signals. While 13F data is notoriously noisy due to non-standardized issuer names and reporting gaps, our pipeline applies a rigorous cleansing process to resolve CUSIP metadata into precise ticker-level positioning.
                        </p>
                        <p style={{ fontSize: '15px', color: '#cbd5e1', lineHeight: 1.7 }}>
                            By triangulating share count deltas across consecutive reporting cycles, we derive estimated net transaction volume to identify institutional accumulation or distribution. This isolates "Smart Money" flows from passive price action, revealing the sectors and tickers where high-conviction capital is actually being committed.
                        </p>
                    </div>
                    <div style={{ background: 'rgba(30, 41, 59, 0.3)', border: '1px solid rgba(51, 65, 85, 0.3)', borderRadius: '16px', padding: '24px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>Core Principles</h3>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {[
                                { icon: <Database size={16} />, text: "Data Fidelity: Robust ticker and split resolution." },
                                { icon: <Activity size={16} />, text: "Alpha Isolation: Separating trading skill from AUM growth." },
                                { icon: <Clock size={16} />, text: "Temporal Awareness: Accounting for 45-day reporting lags." }
                            ].map((item, i) => (
                                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#e2e8f0' }}>
                                    <span style={{ color: '#38bdf8' }}>{item.icon}</span>
                                    {item.text}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* 2. Feature List */}
            <div style={{ marginBottom: '64px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <Layers className="text-emerald-400" size={24} />
                    </div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Core Features</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                    {[
                        { icon: <LayoutGrid />, title: "Global Dashboard", desc: "Real-time summary of 'Big Movers', institutional buying pressure, and new position snapshots across all tracked funds." },
                        { icon: <MousePointer2 />, title: "Drag-and-Drop Groups", desc: "Organize funds into custom clusters (e.g., 'Tiger Cubs', 'Macro') with persistent ordering saved to the database." },
                        { icon: <BarChart3 />, title: "Performance Benchmarking", desc: "Compare fund or group performance against the S&P 500 using weighted Time-Weighted Return (TWR) models." },
                        { icon: <Search />, title: "Ticker Conviction", desc: "Deep-dive into specific holdings to see which managers are accumulating vs. exiting a particular ticker." },
                        { icon: <Activity />, title: "Swoop Opportunities", desc: "Identify 'broken charts'—stocks where institutions bought heavily but the price has significantly corrected since the report." },
                        { icon: <PieChart />, title: "Sector Exposure", desc: "Automatic GICS resolution reveals exactly which sectors are attracting institutional capital this quarter." }
                    ].map((feature, i) => (
                        <div key={i} style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '20px' }}>
                            <div style={{ color: '#10b981', marginBottom: '12px' }}>{feature.icon}</div>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>{feature.title}</h3>
                            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>{feature.desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* 3. Mechanisms & Math */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{
                        background: 'rgba(245, 158, 11, 0.1)',
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <Activity className="text-amber-400" size={24} />
                    </div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Mechanisms & Methodology</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                    {/* ROI Section */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px', background: 'rgba(15, 23, 42, 0.3)', border: '1px solid rgba(51, 65, 85, 0.2)', borderRadius: '16px', padding: '32px' }}>
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Performance Math</div>
                            <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Est. ROI % (Committed Capital)</h3>
                            <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '20px' }}>
                                We anchor percentage returns to **Total Committed Capital** (the sum of all purchases). This prevents the "Infinite ROI" distortion that occurs in standard math when a fund holds a position that has grown significantly but has zero remaining principal.
                            </p>
                        </div>
                        <div style={{ background: '#0f172a', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <code style={{ fontSize: '14px', color: '#38bdf8', lineHeight: 1.6 }}>ROI % = (Total PnL / Σ Purchases) × 100</code>
                        </div>
                    </div>

                    {/* TWR Section */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px', background: 'rgba(15, 23, 42, 0.3)', border: '1px solid rgba(51, 65, 85, 0.2)', borderRadius: '16px', padding: '32px' }}>
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Context Isolation</div>
                            <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Time-Weighted Return (TWR)</h3>
                            <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '20px' }}>
                                TWR eliminates the distorting effects of capital inflows and outflows. We estimate period flows by tracking share count changes, allowing us to see how well the *manager* performs independently of how their *investors* add or withdraw funds.
                            </p>
                        </div>
                        <div style={{ background: '#0f172a', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>PERIOD RETURN CALCULATION:</div>
                            <code style={{ fontSize: '13px', color: '#60a5fa', display: 'block', marginBottom: '12px' }}>Net Flow = Σ [(Δ Shares) × Price_t]</code>
                            <code style={{ fontSize: '13px', color: '#60a5fa', display: 'block' }}>R = (Val_t - Net Flow) / Val_prev - 1</code>
                        </div>
                    </div>

                    {/* Technical Grid (Smaller Blocks) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                        <div style={{ background: 'rgba(30, 41, 59, 0.3)', border: '1px solid rgba(51, 65, 85, 0.2)', borderRadius: '12px', padding: '24px' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#e2e8f0', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <GitFork size={18} className="text-purple-400" /> Split Detection
                            </h4>
                            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                                Automatically detects stock splits by monitoring share count spikes (&gt;1.4x) paired with proportional price drops (&lt;0.72x) where total holdings value remains stable.
                            </p>
                        </div>

                        <div style={{ background: 'rgba(30, 41, 59, 0.3)', border: '1px solid rgba(51, 65, 85, 0.2)', borderRadius: '12px', padding: '24px' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#e2e8f0', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={18} className="text-rose-400" /> 45-Day Reporting Lag
                            </h4>
                            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                                Filings reflect the portfolio as of quarter-end but aren't filed until 45 days later. Our PnL models use historical prices aligned to these exact reporting windows to maintain ROI integrity.
                            </p>
                        </div>

                        <div style={{ background: 'rgba(30, 41, 59, 0.3)', border: '1px solid rgba(51, 65, 85, 0.2)', borderRadius: '12px', padding: '24px' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#e2e8f0', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Database size={18} className="text-emerald-400" /> Sector Mapping
                            </h4>
                            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                                Uses GICS (Global Industry Classification Standard) tiers. Our mapping engine resolves orphan CUSIPs via S&P 500 benchmarks and manual classification for international listings.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Disclaimer Section */}
            <div style={{ marginTop: '80px', padding: '32px', borderTop: '1px solid rgba(51, 65, 85, 0.3)', textAlign: 'center' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>
                    Standard Disclaimer
                </h3>
                <p style={{ fontSize: '12px', color: '#64748b', maxWidth: '700px', margin: '0 auto', lineHeight: 1.8, fontStyle: 'italic' }}>
                    This application is an open-source educational tool. Data is sourced from SEC EDGAR and Yahoo Finance; while we strive for accuracy, no guarantee is provided.
                    Institutional filings (13Fs) are subject to significant delays (up to 45 days) and do not include short positions or non-equity holdings.
                    This software does not constitute financial advice. Use at your own risk.
                </p>
            </div>

            {/* Anchored Copyright Notice */}
            <footer style={{
                marginTop: 'auto',
                paddingTop: '60px',
                paddingBottom: '40px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                opacity: 0.3
            }}>
                <div style={{ width: '40px', height: '1px', background: 'rgba(255, 255, 255, 0.1)', marginBottom: '24px' }}></div>
                <p style={{
                    fontSize: '10px',
                    color: '#94a3b8',
                    letterSpacing: '0.2em',
                    margin: 0,
                    fontWeight: 600,
                    textTransform: 'uppercase'
                }}>
                    © JONAH ABRAMS - ALL RIGHTS RESERVED
                </p>
            </footer>
        </div>
    );
};
