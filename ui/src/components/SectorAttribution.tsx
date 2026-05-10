import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { PieChart, Activity, Info, ArrowUp, ArrowDown } from 'lucide-react';
import { fetchWithAuth } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

interface SectorAttributionProps {
    cik: string;
}

interface Attribution {
    sector: string;
    value: number;
    percent: number;
    shift: number;
}

interface PeriodData {
    period: string;
    total_value: number;
    attribution: Attribution[];
}

export const SectorAttribution: React.FC<SectorAttributionProps> = ({ cik }) => {
    const [data, setData] = useState<PeriodData[]>([]);
    const [loading, setLoading] = useState(true);
    const { session } = useAuth();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await fetchWithAuth(`/api/funds/${cik}/sector-attribution`, {}, session);
                if (!res.ok) throw new Error("Failed to fetch sector attribution");
                const result = await res.json();
                setData(result);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [cik]);

    const latestData = useMemo(() => {
        if (data.length === 0) return null;
        return data[data.length - 1];
    }, [data]);

    const chartData = useMemo(() => {
        if (!latestData) return [];
        return latestData.attribution.map(a => ({
            name: a.sector,
            weight: a.percent,
            shift: a.shift
        })).sort((a, b) => b.weight - a.weight);
    }, [latestData]);

    if (loading) return <div className="loading-state">Loading sector data...</div>;
    if (error) return <div className="error-state">Error: {error}</div>;
    if (!latestData) return <div className="empty-state">No sector data available</div>;

    return (
        <div className="sector-attribution-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '20px' }}>
            <div className="attribution-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>Sector Attribution</h2>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Portfolio weighting and quarter-over-quarter shifts</p>
                </div>
            </div>

            <div className="attribution-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
                {/* Chart Section */}
                <div className="attribution-card" style={{ background: 'rgba(30, 41, 59, 0.5)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ height: '400px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={chartData}
                                layout="vertical"
                                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                                <XAxis type="number" unit="%" stroke="#94a3b8" fontSize={12} />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    stroke="#94a3b8" 
                                    fontSize={11}
                                    width={100}
                                />
                                <Tooltip 
                                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                                    formatter={(value: number) => [`${value.toFixed(2)}%`, 'Weight']}
                                />
                                <Bar dataKey="weight" radius={[0, 4, 4, 0]}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={`hsl(${220 - index * 15}, 70%, 60%)`} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Table Section */}
                <div className="attribution-card" style={{ background: 'rgba(30, 41, 59, 0.5)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)', overflowY: 'auto', maxHeight: '440px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ textAlign: 'left', padding: '12px 8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>SECTOR</th>
                                <th style={{ textAlign: 'right', padding: '12px 8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>WEIGHT</th>
                                <th style={{ textAlign: 'right', padding: '12px 8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>SHIFT</th>
                            </tr>
                        </thead>
                        <tbody>
                            {latestData.attribution.map((item, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '12px 8px', color: '#f1f5f9', fontSize: '13px', fontWeight: 500 }}>{item.sector}</td>
                                    <td style={{ padding: '12px 8px', textAlign: 'right', color: '#f1f5f9', fontSize: '13px', fontWeight: 600 }}>
                                        {item.percent.toFixed(2)}%
                                    </td>
                                    <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', color: item.shift > 0 ? '#10b981' : item.shift < 0 ? '#ef4444' : '#94a3b8' }}>
                                            {item.shift > 0 ? <ArrowUp size={12} /> : item.shift < 0 ? <ArrowDown size={12} /> : null}
                                            {Math.abs(item.shift).toFixed(2)}%
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
