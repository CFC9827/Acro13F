import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { TrendingUp, Activity, Info, RefreshCw, BarChart3, AlertCircle } from 'lucide-react';
import { createPortal } from 'react-dom';

interface MimicDataPoint {
    date: string;
    period: string;
    return: number;
    label: string;
    benchmark_return: number;
}

interface MimicPerformanceResponse {
    cik: string;
    fund_name: string;
    series: MimicDataPoint[];
    error?: string;
}

interface MimicPerformanceChartProps {
    cik: string;
    fundName: string;
}

const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
};

export const MimicPerformanceChart: React.FC<MimicPerformanceChartProps> = ({ cik, fundName }) => {
    const [data, setData] = useState<MimicDataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showBenchmark, setShowBenchmark] = useState(true);
    const [showMethodologyTooltip, setShowMethodologyTooltip] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/funds/${cik}/mimic-performance`);
                const result: MimicPerformanceResponse = await res.json();
                if (result.error) {
                    setError(result.error);
                } else {
                    setData(result.series || []);
                }
            } catch (err) {
                setError("Failed to fetch mimic performance data");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (cik) fetchData();
    }, [cik]);

    const stats = useMemo(() => {
        if (data.length === 0) return { totalReturn: 0, benchmarkTotal: 0, outperformance: 0 };
        const last = data[data.length - 1];
        return {
            totalReturn: last.return,
            benchmarkTotal: last.benchmark_return,
            outperformance: last.return - last.benchmark_return
        };
    }, [data]);

    if (loading) {
        return (
            <div className="loading-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '100px' }}>
                <RefreshCw className="spin" size={48} style={{ color: '#3b82f6' }} />
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#94a3b8' }}>Simulating Mimic Portfolio...</div>
                <div style={{ fontSize: '14px', color: '#64748b' }}>Calculating returns based on 13F filing dates</div>
            </div>
        );
    }

    if (error || data.length < 2) {
        return (
            <div className="loading-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '100px' }}>
                <AlertCircle size={48} style={{ color: '#ef4444', opacity: 0.5 }} />
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#94a3b8' }}>
                    {error || "Insufficient Data for Simulation"}
                </div>
                <div style={{ fontSize: '14px', color: '#64748b', maxWidth: '400px', textAlign: 'center' }}>
                    We need at least two historical filings with valid price data to simulate a mimicked portfolio.
                    {error && " " + error}
                </div>
            </div>
        );
    }

    return (
        <div className="portfolio-dashboard-v2">
            <div className="performance-summary-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '30px' }}>
                <div className="summary-card">
                    <div className="summary-label">Mimic Portfolio Return</div>
                    <div className={`summary-value ${stats.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                        {stats.totalReturn >= 0 ? '+' : ''}{stats.totalReturn.toFixed(2)}%
                    </div>
                    <div className="summary-subtext">Total return since first filing</div>
                </div>

                <div className="summary-card">
                    <div className="summary-label">S&P 500 (SPY) Return</div>
                    <div className={`summary-value ${stats.benchmarkTotal >= 0 ? 'positive' : 'negative'}`} style={{ color: '#6366f1' }}>
                        {stats.benchmarkTotal >= 0 ? '+' : ''}{stats.benchmarkTotal.toFixed(2)}%
                    </div>
                    <div className="summary-subtext">Benchmark performance over same period</div>
                </div>

                <div className="summary-card">
                    <div className="summary-label">Alpha (vs Benchmark)</div>
                    <div className={`summary-value ${stats.outperformance >= 0 ? 'positive' : 'negative'}`}>
                        {stats.outperformance >= 0 ? '+' : ''}{stats.outperformance.toFixed(2)}%
                    </div>
                    <div className="summary-subtext">Excess return from mimicking fund</div>
                </div>
            </div>

            <div className="chart-panel-v2" style={{ height: '550px', position: 'relative' }}>
                <div className="chart-header-v2">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="chart-title-v2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Mimic Portfolio Tracker
                            <Info
                                size={16}
                                style={{ color: '#94a3b8', cursor: 'help' }}
                                onMouseEnter={(e) => setShowMethodologyTooltip({ x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setShowMethodologyTooltip(null)}
                            />
                        </div>
                        <button
                            className={`quarter-nav-btn ${showBenchmark ? 'active' : ''}`}
                            onClick={() => setShowBenchmark(!showBenchmark)}
                            style={{
                                fontSize: '13px',
                                border: '1px solid #e2e8f0',
                                color: showBenchmark ? '#2563eb' : '#64748b',
                                background: showBenchmark ? '#eff6ff' : 'transparent',
                                borderColor: showBenchmark ? '#bfdbfe' : '#e2e8f0'
                            }}
                        >
                            <Activity size={14} style={{ marginRight: 6 }} />
                            {showBenchmark ? 'Hide S&P 500' : 'Compare S&P 500'}
                        </button>
                    </div>
                </div>

                <div className="chart-content-v2">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <defs>
                                <linearGradient id="colorMimic" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(str: string) => {
                                    const d = new Date(str);
                                    const q = Math.floor((d.getMonth() + 3) / 3);
                                    return `Q${q} '${d.getFullYear().toString().slice(2)}`;
                                }}
                                tick={{ fontSize: 11, fill: '#94a3b8' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tickFormatter={(val) => `${val > 0 ? '+' : ''}${val.toFixed(0)}%`}
                                tick={{ fontSize: 12, fill: '#94a3b8' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        const d = new Date(label as string);
                                        const qLabel = `Q${Math.floor(d.getMonth() / 3) + 1} '${d.getFullYear().toString().slice(2)}`;
                                        const item = payload[0].payload;

                                        return (
                                            <div style={{
                                                backgroundColor: '#0f172a',
                                                border: '1px solid #334155',
                                                borderRadius: '8px',
                                                padding: '12px',
                                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                                minWidth: '200px'
                                            }}>
                                                <div style={{ fontWeight: 600, marginBottom: '8px', color: '#f1f5f9', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>
                                                    {qLabel} ({item.date})
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span style={{ color: '#3b82f6', fontSize: '12px' }}>Mimic Return:</span>
                                                    <span style={{ fontWeight: 600, color: item.return >= 0 ? '#10b981' : '#ef4444' }}>
                                                        {item.return >= 0 ? '+' : ''}{item.return.toFixed(2)}%
                                                    </span>
                                                </div>
                                                {showBenchmark && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#6366f1', fontSize: '12px' }}>S&P 500:</span>
                                                        <span style={{ fontWeight: 600, color: item.benchmark_return >= 0 ? '#6366f1' : '#ef4444' }}>
                                                            {item.benchmark_return >= 0 ? '+' : ''}{item.benchmark_return.toFixed(2)}%
                                                        </span>
                                                    </div>
                                                )}
                                                <div style={{ marginTop: '8px', fontSize: '10px', color: '#64748b', fontStyle: 'italic' }}>
                                                    {item.label}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Area
                                name="Mimic Portfolio"
                                type="monotone"
                                dataKey="return"
                                stroke="#3b82f6"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorMimic)"
                            />
                            {showBenchmark && (
                                <Line
                                    name="S&P 500"
                                    type="monotone"
                                    dataKey="benchmark_return"
                                    stroke="#6366f1"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                />
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {showMethodologyTooltip && createPortal(
                <div
                    className="kpi-tooltip"
                    style={{
                        left: showMethodologyTooltip.x > window.innerWidth - 400 ? 'auto' : showMethodologyTooltip.x + 15,
                        right: showMethodologyTooltip.x > window.innerWidth - 400 ? window.innerWidth - showMethodologyTooltip.x + 15 : 'auto',
                        top: showMethodologyTooltip.y + 20,
                        maxWidth: '380px'
                    }}
                >
                    <div className="tooltip-title">Mimic Portfolio Methodology</div>
                    <div style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.6, marginBottom: '12px' }}>
                        This simulation aims to replicate the performance of a user following a fund's 13F filings.
                        <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                            <li><strong>Entry/Exit:</strong> Simulated trades occur on the exact <span style={{ color: '#e2e8f0', fontWeight: 600 }}>Filing Release Date</span>.</li>
                            <li><strong>Weights:</strong> Position sizes are determined by the shares reported in the most recent filing.</li>
                            <li><strong>Execution Price:</strong> Uses the market closing price on the filing day.</li>
                        </ul>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.5, borderTop: '1px solid #334155', paddingTop: '10px' }}>
                        This differs from TWR by reflecting the <span style={{ fontStyle: 'italic' }}>delay</span> between a quarter ending and the filing becoming public (up to 45 days).
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
