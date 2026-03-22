import React, { useState, useEffect } from 'react';
import { Search, Filter, Database, TrendingUp, Info, ArrowRight, Check, Plus, Loader2, X, ChevronDown, ChevronRight, Activity, Globe, LayoutGrid, Briefcase, DollarSign, Users, Sparkles, PieChart, Shield, Target, Zap, Clock, BarChart3, Fingerprint, MousePointer2, List } from 'lucide-react';
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
    // Mock sparkline data for UI
    sparkline?: { value: number }[];
}

const METRICS = [
    { id: 'total_aum', label: 'Assets (AUM)', type: 'number', icon: <DollarSign size={14} />, description: 'Total value of 13F long positions' },
    { id: 'position_count', label: 'Position Count', type: 'number', icon: <Briefcase size={14} />, description: 'Number of unique tickers held' },
    { id: 'top_10_concentration', label: 'Top 10 %', type: 'number', icon: <Target size={14} />, description: '% of AUM in the top 10 holdings' },
    { id: 'primary_sector', label: 'Primary Sector', type: 'string', icon: <PieChart size={14} />, description: 'Highest weighted industry sector' },
    { id: 'mega_cap_pct', label: 'Mega-Cap %', type: 'number', icon: <Globe size={14} />, description: 'Exposure to >$200B companies' },
    { id: 'small_cap_pct', label: 'Small-Cap %', type: 'number', icon: <Zap size={14} />, description: 'Exposure to <$2B companies' },
    { id: 'portfolio_turnover', label: 'Turnover %', type: 'number', icon: <Activity size={14} />, description: 'Quarterly portfolio churn' },
];

const OPERATORS = [
    { id: 'gt', label: 'Greater Than' },
    { id: 'lt', label: 'Less Than' },
    { id: 'eq', label: 'Exactly' },
];

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
    const [filters, setFilters] = useState<FilterRow[]>([
        { id: Math.random().toString(), logic: 'AND', metric: 'total_aum', op: 'gt', val: 1000000000 }
    ]);
    const [results, setResults] = useState<FundStats[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncingCik, setSyncingCik] = useState<string | null>(null);
    const [logic, setLogic] = useState<'AND' | 'OR'>('AND');

    const toggleTrack = async (cik: string, currentStatus: boolean) => {
        setSyncingCik(cik);
        try {
            const res = await fetch(`/api/funds/${cik}/track?track=${!currentStatus}`, {
                method: 'POST'
            });
            if (res.ok) {
                setResults(prev => prev.map(f => f.cik === cik ? { ...f, is_tracked: !currentStatus ? 1 : 0 } : f));
            }
        } catch (err) {
            console.error("Failed to toggle track", err);
        } finally {
            setSyncingCik(null);
        }
    };

    const addFilter = () => {
        setFilters([...filters, { id: Math.random().toString(), logic: 'AND', metric: 'total_aum', op: 'gt', val: 1000000000 }]);
    };

    const removeFilter = (id: string) => {
        if (filters.length > 1) {
            setFilters(filters.filter(f => f.id !== id));
        }
    };

    const updateFilter = (id: string, updates: Partial<FilterRow>) => {
        setFilters(filters.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const handleSearch = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/explorer/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    logic,
                    filters: filters.map(({ logic, metric, op, val }) => ({ logic, metric, op, val: parseFloat(val) || val }))
                })
            });
            const data = await res.json();

            // Add mock sparklines for UI polish if not present
            const enhanced = data.map((f: FundStats) => ({
                ...f,
                sparkline: Array.from({ length: 8 }, () => ({ value: Math.random() * 100 + 50 }))
            }));

            setResults(enhanced);
        } catch (err) {
            console.error("Search failed", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        handleSearch();
    }, []);

    return (
        <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#020617' }}>
            {/* Premium Header */}
            <div className="dashboard-header" style={{ padding: '40px 48px', borderBottom: '1px solid rgba(255,255,255,0.03)', background: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.4), transparent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div className="dashboard-badge" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                            <Sparkles size={12} style={{ marginRight: '6px' }} />
                            INSTITUTIONAL DISCOVERY
                        </div>
                        <h1 className="dashboard-title" style={{ fontSize: '2.5rem', marginTop: '12px', letterSpacing: '-0.03em' }}>Whale Explorer</h1>
                        <p className="dashboard-subtitle" style={{ fontSize: '1.1rem', color: '#94a3b8', marginTop: '8px' }}>
                            Search across the SEC 13F universe using multi-factor fundamental DNA.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <button 
                                onClick={() => setLogic('AND')}
                                className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all uppercase tracking-widest ${logic === 'AND' ? 'bg-[#38bdf8] text-[#0f172a]' : 'text-[#64748b] hover:text-[#f8fafc]'}`}
                            >
                                Match All
                            </button>
                            <button 
                                onClick={() => setLogic('OR')}
                                className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all uppercase tracking-widest ${logic === 'OR' ? 'bg-[#38bdf8] text-[#0f172a]' : 'text-[#64748b] hover:text-[#f8fafc]'}`}
                            >
                                Match Any
                            </button>
                        </div>

                        <button 
                            onClick={handleSearch}
                            disabled={loading}
                            className="bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#0f172a] px-8 h-12 rounded-xl font-bold flex items-center gap-3 transition-all transform active:scale-95 shadow-[0_0_20px_rgba(56,189,248,0.2)]"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                            RUN SCREENER
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 48px 48px' }} className="custom-scrollbar">
                <div style={{ maxWidth: '1600px', margin: '32px auto', display: 'flex', flexDirection: 'column', gap: '40px' }}>

                    {/* Filter Builder - Premium Layout */}
                    <div style={{ 
                        background: 'rgba(30, 41, 59, 0.3)', 
                        backdropFilter: 'blur(20px)',
                        borderRadius: '32px', 
                        border: '1px solid rgba(255,255,255,0.06)', 
                        padding: '32px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                                    <Filter size={16} />
                                </div>
                                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>Screener Parameters</h3>
                            </div>
                            <button 
                                onClick={addFilter}
                                style={{ 
                                    padding: '8px 16px', 
                                    borderRadius: '100px', 
                                    fontSize: '11px', 
                                    fontWeight: 800, 
                                    background: 'rgba(255,255,255,0.05)', 
                                    color: '#f8fafc', 
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                            >
                                <Plus size={14} /> ADD PARAMETER
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {filters.map((f, index) => (
                                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', animation: 'fadeIn 0.3s ease-out' }}>
                                    {/* Indicator */}
                                    <div style={{ width: '40px', textAlign: 'right', fontSize: '10px', fontWeight: 800, color: '#475569', letterSpacing: '0.1em' }}>
                                        {index === 0 ? 'START' : logic}
                                    </div>

                                    {/* Parameter Row */}
                                    <div style={{ 
                                        flex: 1,
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '12px', 
                                        background: 'rgba(15, 23, 42, 0.4)', 
                                        padding: '8px 12px', 
                                        borderRadius: '20px', 
                                        border: '1px solid rgba(255,255,255,0.03)'
                                    }}>
                                        <div style={{ position: 'relative', minWidth: '220px' }}>
                                            <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#38bdf8' }}>
                                                {METRICS.find(m => m.id === f.metric)?.icon}
                                            </div>
                                            <select 
                                                value={f.metric}
                                                onChange={(e) => updateFilter(f.id, { metric: e.target.value })}
                                                style={{ width: '100%', background: 'transparent', border: 'none', color: '#f8fafc', padding: '10px 32px 10px 36px', borderRadius: '12px', fontSize: '14px', fontWeight: 600, outline: 'none', appearance: 'none', cursor: 'pointer' }}
                                            >
                                                {METRICS.map(m => <option key={m.id} value={m.id} style={{ background: '#0f172a' }}>{m.label}</option>)}
                                            </select>
                                            <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
                                        </div>

                                        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.05)' }} />

                                        <div style={{ position: 'relative', width: '160px' }}>
                                            <select 
                                                value={f.op}
                                                onChange={(e) => updateFilter(f.id, { op: e.target.value })}
                                                style={{ width: '100%', background: 'transparent', border: 'none', color: '#f8fafc', padding: '10px 32px 10px 12px', borderRadius: '12px', fontSize: '14px', fontWeight: 600, outline: 'none', appearance: 'none', cursor: 'pointer' }}
                                            >
                                                {OPERATORS.map(o => <option key={o.id} value={o.id} style={{ background: '#0f172a' }}>{o.label}</option>)}
                                            </select>
                                            <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
                                        </div>

                                        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.05)' }} />

                                        <div style={{ position: 'relative', flex: 1 }}>
                                            <input 
                                                type="text"
                                                value={f.val}
                                                onChange={(e) => updateFilter(f.id, { val: e.target.value })}
                                                placeholder="Enter value..."
                                                style={{ width: '100%', background: 'transparent', border: 'none', color: '#f8fafc', padding: '10px 12px', fontSize: '14px', fontWeight: 600, outline: 'none' }}
                                            />
                                        </div>

                                        <button 
                                            onClick={() => removeFilter(f.id)}
                                            disabled={filters.length === 1}
                                            style={{ 
                                                display: filters.length === 1 ? 'none' : 'flex',
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '10px',
                                                color: '#64748b',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                border: 'none',
                                                background: 'transparent'
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                                            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Results Grid/Table */}
                    <div style={{ 
                        background: 'rgba(15, 23, 42, 0.4)', 
                        borderRadius: '32px', 
                        border: '1px solid rgba(255,255,255,0.05)', 
                        overflow: 'hidden',
                        position: 'relative'
                    }}>
                        <div style={{ padding: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                                    <List size={16} />
                                </div>
                                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                                    {results.length} Identities Found
                                </h3>
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
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
                                    {results.length === 0 && !loading ? (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '120px 32px', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', color: '#475569' }}>
                                                    <Fingerprint size={48} opacity={0.2} />
                                                    <p style={{ fontSize: '16px', fontWeight: 500 }}>No entities match these parameters.</p>
                                                    <p style={{ fontSize: '13px' }}>Try loosening your constraints to discover more funds.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : results.map((fund) => (
                                        <tr key={fund.cik} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'all 0.2s' }} className="hover:bg-white/[0.02]">
                                            <td style={{ padding: '24px 32px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: '15px' }}>{fund.name}</span>
                                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                        <DnaBadge label={fund.cik} icon={<Fingerprint size={10} />} color="#64748b" />
                                                        {fund.total_aum > 10000000000 && <DnaBadge label="Mega-Scale" icon={<Shield size={10} />} color="#38bdf8" />}
                                                        {fund.top_10_concentration > 60 && <DnaBadge label="Conviction" icon={<Target size={10} />} color="#fb7185" />}
                                                        {fund.portfolio_turnover > 30 && <DnaBadge label="Active" icon={<Activity size={10} />} color="#f472b6" />}
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '24px 32px', width: '140px' }}>
                                                <div style={{ height: '40px', width: '100px' }}>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <AreaChart data={fund.sparkline}>
                                                            <defs>
                                                                <linearGradient id={`grad-${fund.cik}`} x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                                                                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                                                                </linearGradient>
                                                            </defs>
                                                            <Area 
                                                                type="monotone" 
                                                                dataKey="value" 
                                                                stroke="#38bdf8" 
                                                                strokeWidth={2} 
                                                                fill={`url(#grad-${fund.cik})`} 
                                                                isAnimationActive={false}
                                                            />
                                                        </AreaChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </td>
                                            <td style={{ padding: '24px 32px' }}>
                                                <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: '15px' }}>{formatCurrency(fund.total_aum)}</div>
                                                <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, marginTop: '4px' }}>{fund.position_count} HOLDINGS</div>
                                            </td>
                                            <td style={{ padding: '24px 32px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 800, color: '#94a3b8' }}>
                                                        <span>CONCENTRATION</span>
                                                        <span>{fund.top_10_concentration.toFixed(1)}%</span>
                                                    </div>
                                                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden', width: '120px' }}>
                                                        <div style={{ height: '100%', background: '#38bdf8', width: `${fund.top_10_concentration}%`, boxShadow: '0 0 10px rgba(56,189,248,0.3)' }} />
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '24px 32px' }}>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTrack(fund.cik, !!fund.is_tracked);
                                                    }}
                                                    disabled={syncingCik === fund.cik}
                                                    style={{ 
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        padding: '6px 12px',
                                                        borderRadius: '8px',
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        background: fund.is_tracked ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)',
                                                        color: fund.is_tracked ? '#4ade80' : '#94a3b8',
                                                        border: `1px solid ${fund.is_tracked ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.05)'}`,
                                                        cursor: syncingCik === fund.cik ? 'wait' : 'pointer',
                                                        transition: 'all 0.2s',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.05em'
                                                    }}
                                                >
                                                    {syncingCik === fund.cik ? (
                                                        <Loader2 size={12} className="animate-spin" />
                                                    ) : fund.is_tracked ? (
                                                        <Check size={12} />
                                                    ) : (
                                                        <Plus size={12} />
                                                    )}
                                                    {fund.is_tracked ? 'Tracked' : 'Track Fund'}
                                                </button>
                                            </td>
                                            <td style={{ padding: '24px 32px', textAlign: 'right' }}>
                                                <button 
                                                    onClick={() => {
                                                        setSyncingCik(fund.cik);
                                                        onFollow(fund.cik);
                                                    }}
                                                    disabled={syncingCik === fund.cik}
                                                    style={{ 
                                                        background: 'rgba(255,255,255,0.03)',
                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                        color: '#f8fafc',
                                                        padding: '10px 20px',
                                                        borderRadius: '12px',
                                                        fontSize: '12px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '10px'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = '#38bdf8';
                                                        e.currentTarget.style.color = '#0f172a';
                                                        e.currentTarget.style.borderColor = '#38bdf8';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                                        e.currentTarget.style.color = '#f8fafc';
                                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                                                    }}
                                                >
                                                    {syncingCik === fund.cik ? <Loader2 size={16} className="spin" /> : <MousePointer2 size={16} />}
                                                    {syncingCik === fund.cik ? 'LOADING' : 'ANALYZE'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {loading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(2, 6, 23, 0.7)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
                    <div style={{ position: 'relative' }}>
                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '2px solid rgba(56, 189, 248, 0.1)', borderTopColor: '#38bdf8', animation: 'spin 1s linear infinite' }} />
                        <Database size={32} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', color: '#38bdf8' }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <h4 style={{ color: '#f8fafc', fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Scanning Universal Whale Database</h4>
                        <p style={{ color: '#64748b', fontSize: '14px' }}>Applying multi-factor filters across 2,000+ institutional filers...</p>
                    </div>
                </div>
            )}
        </div>
    );
}

