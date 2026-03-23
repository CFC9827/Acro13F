import React, { useState, useEffect } from 'react';
import { Search, Filter, Database, TrendingUp, Info, ArrowRight, Check, Plus, Loader2, X, ChevronDown, ChevronRight, Activity, Globe, LayoutGrid, Briefcase, DollarSign, Users, Sparkles, PieChart, Shield, Target, Zap, Clock, BarChart3, Fingerprint, MousePointer2, List, Trash2, SlidersHorizontal, AlertCircle, Star } from 'lucide-react';
import { formatCurrency } from './PortfolioChart';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';

interface InstitutionalExplorerProps {
    onFollow: (cik: string) => void;
}

interface FilterRow {
    id: string;
    logic: 'AND' | 'OR';
    metric: string;
    op: string;
    val: any;
}

interface FundStats {
    name: string;
    cik: string;
    total_aum: number;
    position_count: number;
    top_10_concentration: number;
    primary_sector: string;
    primary_sector_weight: number;
    mega_cap_pct: number;
    mid_cap_pct: number;
    small_cap_pct: number;
    portfolio_turnover: number;
    avg_holding_period: number;
    herding_score: number;
    is_tracked?: number;
    sparkline?: { value: number }[];
}

interface WhaleStock {
    ticker: string;
    issuer_name: string;
    whale_count: number;
    total_value: number;
    avg_weight: number;
    sector: string;
}

const METRICS = [
    { id: 'total_aum', label: 'Assets (AUM)', type: 'number', icon: <DollarSign size={14} />, description: 'Total value of 13F long positions', unit: 'USD' },
    { id: 'position_count', label: 'Position Count', type: 'number', icon: <Briefcase size={14} />, description: 'Number of unique tickers held', unit: 'count' },
    { id: 'top_10_concentration', label: 'Top 10 Concentration', type: 'number', icon: <Target size={14} />, description: '% of AUM in the top 10 holdings', unit: '%' },
    { id: 'primary_sector', label: 'Primary Sector', type: 'string', icon: <PieChart size={14} />, description: 'Highest weighted industry sector' },
    { id: 'mega_cap_pct', label: 'Mega-Cap Weight', type: 'number', icon: <Globe size={14} />, description: 'Exposure to >$200B companies', unit: '%' },
    { id: 'small_cap_pct', label: 'Small-Cap Weight', type: 'number', icon: <Zap size={14} />, description: 'Exposure to <$2B companies', unit: '%' },
    { id: 'portfolio_turnover', label: 'Turnover %', type: 'number', icon: <Activity size={14} />, description: 'Quarterly portfolio churn', unit: '%' },
    { id: 'herding_score', label: 'Crowding Score', type: 'number', icon: <Users size={14} />, description: 'Relative overlap with other funds', unit: 'score' },
    { id: 'holds_ticker', label: 'Holds Ticker', type: 'string', icon: <Search size={14} />, description: 'Find funds holding a specific stock' },
];

const SECTORS = [
    "Technology", "Financial Services", "Healthcare", "Consumer Cyclical", "Communication Services", 
    "Industrials", "Consumer Defensive", "Energy", "Basic Materials", "Real Estate", "Utilities"
];

const OPERATORS: Record<string, { id: string, label: string }[]> = {
    number: [
        { id: 'gt', label: 'Greater Than' },
        { id: 'lt', label: 'Less Than' },
        { id: 'ge', label: 'Greater or Equal' },
        { id: 'le', label: 'Less or Equal' },
        { id: 'eq', label: 'Exactly' },
    ],
    string: [
        { id: 'contains', label: 'Contains' },
        { id: 'not_contains', label: 'Does Not Contain' },
        { id: 'eq', label: 'Exactly' },
    ]
};

// Reusable Premium Input Style
const inputBaseStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#f8fafc',
    borderRadius: '12px',
    padding: '12px 16px',
    fontSize: '13px',
    fontWeight: 600,
    outline: 'none',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    appearance: 'none',
    cursor: 'pointer',
    boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,0.05)'
};

const inputFocusStyle = (e: React.FocusEvent<any>) => {
    e.target.style.borderColor = '#38bdf8';
    e.target.style.boxShadow = '0 0 0 4px rgba(56, 189, 248, 0.1), inset 0 2px 4px 0 rgba(0,0,0,0.05)';
    e.target.style.background = 'rgba(15, 23, 42, 0.8)';
};

const inputBlurStyle = (e: React.FocusEvent<any>) => {
    e.target.style.borderColor = 'rgba(255,255,255,0.08)';
    e.target.style.boxShadow = 'inset 0 2px 4px 0 rgba(0,0,0,0.05)';
    e.target.style.background = 'rgba(15, 23, 42, 0.6)';
};

const DnaBadge = ({ label, icon, color }: { label: string, icon: React.ReactNode, color: string }) => (
    <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px', 
        padding: '3px 10px', 
        borderRadius: '100px', 
        fontSize: '10px', 
        fontWeight: 800, 
        background: `${color}15`, 
        color: color, 
        border: `1px solid ${color}30`,
        letterSpacing: '0.02em',
        textTransform: 'uppercase'
    }}>
        {icon}
        {label}
    </div>
);

export function InstitutionalExplorer({ onFollow }: InstitutionalExplorerProps) {
    const [activeTab, setActiveTab] = useState<'funds' | 'stocks'>('funds');
    const [filters, setFilters] = useState<FilterRow[]>([
        { id: Math.random().toString(), logic: 'AND', metric: 'total_aum', op: 'gt', val: 1000000000 }
    ]);
    const [fundResults, setFundResults] = useState<FundStats[]>([]);
    const [stockResults, setStockResults] = useState<WhaleStock[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncingCik, setSyncingCik] = useState<string | null>(null);
    const [stockSearchQuery, setStockSearchQuery] = useState('');

    const toggleTrack = async (cik: string, currentStatus: boolean) => {
        setSyncingCik(cik);
        try {
            const res = await fetch(`/api/funds/${cik}/track?track=${!currentStatus}`, {
                method: 'POST'
            });
            if (res.ok) {
                setFundResults(prev => prev.map(f => f.cik === cik ? { ...f, is_tracked: !currentStatus ? 1 : 0 } : f));
            }
        } catch (err) {
            console.error("Failed to toggle track", err);
        } finally {
            setSyncingCik(null);
        }
    };

    const addFilter = () => {
        const lastFilter = filters[filters.length - 1];
        setFilters([...filters, { 
            id: Math.random().toString(), 
            logic: 'AND', 
            metric: lastFilter.metric, 
            op: lastFilter.op, 
            val: lastFilter.val 
        }]);
    };

    const removeFilter = (id: string) => {
        if (filters.length > 1) {
            setFilters(filters.filter(f => f.id !== id));
        }
    };

    const updateFilter = (id: string, updates: Partial<FilterRow>) => {
        setFilters(filters.map(f => {
            if (f.id === id) {
                const updated = { ...f, ...updates };
                if (updates.metric) {
                    const newMetric = METRICS.find(m => m.id === updates.metric);
                    const oldMetric = METRICS.find(m => m.id === f.metric);
                    if (newMetric?.type !== oldMetric?.type) {
                        updated.op = newMetric?.type === 'string' ? 'contains' : 'gt';
                        updated.val = newMetric?.type === 'string' ? '' : 0;
                    }
                }
                return updated;
            }
            return f;
        }));
    };

    const handleFundSearch = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/explorer/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filters: filters.map(({ logic, metric, op, val }) => ({ logic, metric, op, val }))
                })
            });
            const data = await res.json();
            const enhanced = data.map((f: FundStats) => ({
                ...f,
                sparkline: Array.from({ length: 8 }, () => ({ value: Math.random() * 100 + 50 }))
            }));
            setFundResults(enhanced);
        } catch (err) {
            console.error("Fund search failed", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchWhaleFavorites = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/explorer/stocks/favorites');
            const data = await res.json();
            setStockResults(data);
        } catch (err) {
            console.error("Failed to fetch whale favorites", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'funds') {
            if (fundResults.length === 0) handleFundSearch();
        } else {
            if (stockResults.length === 0) fetchWhaleFavorites();
        }
    }, [activeTab]);

    const filteredStocks = stockResults.filter(s => 
        s.ticker?.toLowerCase().includes(stockSearchQuery.toLowerCase()) ||
        s.issuer_name?.toLowerCase().includes(stockSearchQuery.toLowerCase())
    );

    return (
        <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#020617' }}>
            {/* Premium Header */}
            <div className="dashboard-header" style={{ padding: '32px 48px', borderBottom: '1px solid rgba(255,255,255,0.03)', background: 'linear-gradient(to bottom, rgba(15, 23, 24, 0.4), transparent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div className="dashboard-badge" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)', marginBottom: '12px' }}>
                            <SlidersHorizontal size={12} style={{ marginRight: '6px' }} />
                            Institutional Engine v3.0
                        </div>
                        <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.03em', margin: 0 }}>
                            Discovery <span style={{ color: '#38bdf8' }}>Explorer</span>
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '14px', marginTop: '8px', maxWidth: '600px', lineHeight: 1.6 }}>
                            Real-time intelligence on 2,000+ institutional whales. Switch between fund-level conviction and aggregated stock consensus.
                        </p>
                    </div>

                    {/* High-Fidelity Tab Switcher */}
                    <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', padding: '4px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                        <button 
                            onClick={() => setActiveTab('funds')}
                            style={{ 
                                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                background: activeTab === 'funds' ? '#38bdf8' : 'transparent',
                                color: activeTab === 'funds' ? '#0f172a' : '#64748b',
                                cursor: 'pointer', border: 'none'
                            }}
                        >
                            <Database size={16} />
                            INSTITUTIONS
                        </button>
                        <button 
                            onClick={() => setActiveTab('stocks')}
                            style={{ 
                                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                background: activeTab === 'stocks' ? '#38bdf8' : 'transparent',
                                color: activeTab === 'stocks' ? '#0f172a' : '#64748b',
                                cursor: 'pointer', border: 'none'
                            }}
                        >
                            <TrendingUp size={16} />
                            STOCK CONSENSUS
                        </button>
                    </div>
                </div>
            </div>

            {activeTab === 'funds' ? (
                /* Institutional Screener Content */
                <div style={{ padding: '0 48px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ 
                        background: 'rgba(30, 41, 59, 0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', padding: '32px',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '8px 16px', borderRadius: '10px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Filter size={14} /> QUERY BUILDER
                                </div>
                                <div style={{ color: '#475569', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Info size={14} /> <span>Define multi-factor parameters using AND/OR logic per row.</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={addFilter} style={{ background: 'rgba(255,255,255,0.03)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
                                    <Plus size={16} /> Add Parameter
                                </button>
                                <button onClick={handleFundSearch} disabled={loading} style={{ background: '#38bdf8', color: '#0f172a', border: 'none', padding: '10px 24px', borderRadius: '12px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 14px 0 rgba(56, 189, 248, 0.39)', transition: 'all 0.2s' }}>
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                    {loading ? 'SCANNING...' : `RUN SCREENER (${fundResults.length})`}
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {filters.map((row, idx) => {
                                const metric = METRICS.find(m => m.id === row.metric);
                                const ops = OPERATORS[metric?.type || 'number'];
                                return (
                                    <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', borderRadius: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)' }}>
                                        <div style={{ width: '90px' }}>
                                            {idx === 0 ? <div style={{ fontSize: '11px', fontWeight: 900, color: '#334155', textAlign: 'center', letterSpacing: '0.1em' }}>WHERE</div> : (
                                                <select value={row.logic} onChange={(e) => updateFilter(row.id, { logic: e.target.value as any })} onFocus={inputFocusStyle} onBlur={inputBlurStyle} style={{ ...inputBaseStyle, padding: '10px', fontSize: '11px', textAlign: 'center', color: '#38bdf8', fontWeight: 900, border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                                                    <option value="AND" style={{ background: '#0f172a', color: '#f8fafc' }}>AND</option>
                                                    <option value="OR" style={{ background: '#0f172a', color: '#f8fafc' }}>OR</option>
                                                </select>
                                            )}
                                        </div>
                                        <div style={{ position: 'relative', flex: 1.2 }}>
                                            <select value={row.metric} onChange={(e) => updateFilter(row.id, { metric: e.target.value })} onFocus={inputFocusStyle} onBlur={inputBlurStyle} style={inputBaseStyle}>
                                                {METRICS.map(m => <option key={m.id} value={m.id} style={{ background: '#0f172a', color: '#f8fafc' }}>{m.label}</option>)}
                                            </select>
                                            <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#475569' }}><ChevronDown size={16} /></div>
                                        </div>
                                        <div style={{ position: 'relative', flex: 1 }}>
                                            <select value={row.op} onChange={(e) => updateFilter(row.id, { op: e.target.value })} onFocus={inputFocusStyle} onBlur={inputBlurStyle} style={inputBaseStyle}>
                                                {ops.map(o => <option key={o.id} value={o.id} style={{ background: '#0f172a', color: '#f8fafc' }}>{o.label}</option>)}
                                            </select>
                                            <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#475569' }}><ChevronDown size={16} /></div>
                                        </div>
                                        <div style={{ flex: 1.5 }}>
                                            {row.metric === 'primary_sector' ? (
                                                <div style={{ position: 'relative' }}>
                                                    <select value={row.val} onChange={(e) => updateFilter(row.id, { val: e.target.value })} onFocus={inputFocusStyle} onBlur={inputBlurStyle} style={inputBaseStyle}>
                                                        <option value="" style={{ background: '#0f172a', color: '#64748b' }}>Select Sector...</option>
                                                        {SECTORS.map(s => <option key={s} value={s} style={{ background: '#0f172a', color: '#f8fafc' }}>{s}</option>)}
                                                    </select>
                                                    <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#475569' }}><ChevronDown size={16} /></div>
                                                </div>
                                            ) : (
                                                <div style={{ position: 'relative' }}>
                                                    <input type="text" value={row.val} onChange={(e) => updateFilter(row.id, { val: e.target.value })} onFocus={inputFocusStyle} onBlur={inputBlurStyle} placeholder="Enter value..." style={inputBaseStyle} />
                                                    <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: 800, color: '#38bdf8', opacity: 0.6 }}>{metric?.unit?.toUpperCase()}</div>
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={() => removeFilter(row.id)} style={{ background: 'rgba(251, 113, 133, 0.05)', border: '1px solid rgba(251, 113, 133, 0.1)', color: '#fb7185', cursor: 'pointer', padding: '10px', borderRadius: '12px' }}><Trash2 size={18} /></button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', overflow: 'hidden', minHeight: '400px', position: 'relative', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                                    <th style={{ padding: '20px 32px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Institution & DNA</th>
                                    <th style={{ padding: '20px 32px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>AUM Trend</th>
                                    <th style={{ padding: '20px 32px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Scale</th>
                                    <th style={{ padding: '20px 32px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Focus</th>
                                    <th style={{ padding: '20px 32px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Status</th>
                                    <th style={{ padding: '20px 32px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'right' }}>Analysis</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fundResults.length === 0 && !loading ? (
                                    <tr><td colSpan={6} style={{ padding: '120px 32px', textAlign: 'center' }}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', color: '#475569' }}><Fingerprint size={48} opacity={0.2} /><p style={{ fontSize: '16px', fontWeight: 500 }}>No entities match these parameters.</p></div></td></tr>
                                ) : fundResults.map((fund) => (
                                    <tr key={fund.cik} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'all 0.2s' }} className="hover:bg-white/[0.02]">
                                        <td style={{ padding: '24px 32px' }}><div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}><span style={{ color: '#f8fafc', fontWeight: 700, fontSize: '15px' }}>{fund.name}</span><div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}><DnaBadge label={fund.cik} icon={<Fingerprint size={10} />} color="#64748b" />{fund.total_aum > 10000000000 && <DnaBadge label="Mega-Scale" icon={<Shield size={10} />} color="#38bdf8" />}{fund.top_10_concentration > 60 && <DnaBadge label="Conviction" icon={<Target size={10} />} color="#fb7185" />}{fund.portfolio_turnover > 30 && <DnaBadge label="Active" icon={<Activity size={10} />} color="#f472b6" />}</div></div></td>
                                        <td style={{ padding: '24px 32px', width: '140px' }}><div style={{ height: '40px', width: '100px' }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={fund.sparkline}><defs><linearGradient id={`grad-${fund.cik}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/><stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/></linearGradient></defs><Area type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} fill={`url(#grad-${fund.cik})`} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div></td>
                                        <td style={{ padding: '24px 32px' }}><div style={{ color: '#f8fafc', fontWeight: 800, fontSize: '15px' }}>{formatCurrency(fund.total_aum)}</div><div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, marginTop: '4px' }}>{fund.position_count} HOLDINGS</div></td>
                                        <td style={{ padding: '24px 32px' }}><div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 800, color: '#94a3b8' }}><span>{fund.primary_sector?.toUpperCase() || 'UNKNOWN'}</span><span>{fund.primary_sector_weight?.toFixed(1) || 0}%</span></div><div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden', width: '120px' }}><div style={{ height: '100%', background: '#38bdf8', width: `${fund.primary_sector_weight}%`, boxShadow: '0 0 10px rgba(56,189,248,0.3)' }} /></div></div></td>
                                        <td style={{ padding: '24px 32px' }}><button onClick={(e) => { e.stopPropagation(); toggleTrack(fund.cik, !!fund.is_tracked); }} disabled={syncingCik === fund.cik} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: fund.is_tracked ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)', color: fund.is_tracked ? '#4ade80' : '#94a3b8', border: `1px solid ${fund.is_tracked ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.05)'}`, cursor: syncingCik === fund.cik ? 'wait' : 'pointer', transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{syncingCik === fund.cik ? <Loader2 size={12} className="animate-spin" /> : fund.is_tracked ? <Check size={12} /> : <Plus size={12} />}{fund.is_tracked ? 'Tracked' : 'Track Fund'}</button></td>
                                        <td style={{ padding: '24px 32px', textAlign: 'right' }}><button onClick={() => onFollow(fund.cik)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '10px 20px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: '10px' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#38bdf8'; e.currentTarget.style.color = '#0f172a'; e.currentTarget.style.borderColor = '#38bdf8'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = '#f8fafc'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}><MousePointer2 size={16} /> ANALYZE</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {loading && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(2, 6, 23, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}><div style={{ textAlign: 'center' }}><Loader2 size={48} className="animate-spin" style={{ color: '#38bdf8', marginBottom: '20px' }} /><p style={{ color: '#f8fafc', fontWeight: 700, fontSize: '18px' }}>Scanning Institutional Universe</p></div></div>}
                    </div>
                </div>
            ) : (
                /* Stock Consensus Content */
                <div style={{ padding: '0 48px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ position: 'relative', width: '400px' }}>
                            <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} size={18} />
                            <input type="text" placeholder="Search by Ticker or Name..." value={stockSearchQuery} onChange={(e) => setStockSearchQuery(e.target.value)} onFocus={inputFocusStyle} onBlur={inputBlurStyle} style={{ ...inputBaseStyle, paddingLeft: '48px' }} />
                        </div>
                        <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>Showing {filteredStocks.length} most popular stocks among institutions</div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', overflow: 'hidden', minHeight: '400px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                                    <th style={{ padding: '24px 32px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Ticker & Asset</th>
                                    <th style={{ padding: '24px 32px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Whale Count</th>
                                    <th style={{ padding: '24px 32px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Value</th>
                                    <th style={{ padding: '24px 32px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Avg Weight</th>
                                    <th style={{ padding: '24px 32px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} style={{ padding: '100px', textAlign: 'center' }}><Loader2 size={40} className="animate-spin" style={{ color: '#38bdf8', marginBottom: '16px' }} /><p style={{ color: '#64748b', fontWeight: 600 }}>Analyzing aggregated holdings...</p></td></tr>
                                ) : filteredStocks.map((stock) => (
                                    <tr key={stock.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'all 0.2s' }} className="hover:bg-white/[0.02]">
                                        <td style={{ padding: '24px 32px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}><div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)' }}>{stock.ticker?.slice(0, 4)}</div><div><div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '16px' }}>{stock.ticker || 'UNKNOWN'}</div><div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>{stock.issuer_name}</div></div></div></td>
                                        <td style={{ padding: '24px 32px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ color: '#f8fafc', fontWeight: 800, fontSize: '18px' }}>{stock.whale_count}</div><div style={{ display: 'flex', gap: '2px' }}>{Array.from({ length: Math.min(5, Math.ceil(stock.whale_count / 5)) }).map((_, i) => <Users key={i} size={12} color="#38bdf8" fill="#38bdf8" opacity={0.5} />)}</div></div><div style={{ color: '#475569', fontSize: '11px', fontWeight: 700, marginTop: '4px', textTransform: 'uppercase' }}>Funds Holding</div></td>
                                        <td style={{ padding: '24px 32px' }}><div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '15px' }}>{formatCurrency(stock.total_value)}</div><div style={{ color: '#475569', fontSize: '11px', fontWeight: 700, marginTop: '4px', textTransform: 'uppercase' }}>Aggregate Value</div></td>
                                        <td style={{ padding: '24px 32px' }}><div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '15px' }}>{stock.avg_weight.toFixed(2)}%</div><div style={{ width: '80px', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(stock.avg_weight * 10, 100)}%`, background: '#38bdf8' }} /></div></td>
                                        <td style={{ padding: '24px 32px', textAlign: 'right' }}><button onClick={() => { /* Potential: Open detail view of who holds this stock */ }} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '10px 20px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: '10px' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#38bdf8'; e.currentTarget.style.color = '#0f172a'; e.currentTarget.style.borderColor = '#38bdf8'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = '#f8fafc'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}><MousePointer2 size={16} /> WHO HOLDS THIS?</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
