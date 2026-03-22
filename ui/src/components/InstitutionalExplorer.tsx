import React, { useState, useEffect } from 'react';
import { Search, Filter, Database, TrendingUp, Info, ArrowRight, Check, Plus, Loader2, X, ChevronDown, Activity, Globe } from 'lucide-react';
import { formatCurrency } from './PortfolioChart';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

interface InstitutionalExplorerProps {
    onFollow: (cik: string) => void;
}

interface FilterRow {
    id: string;
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
    sparkline?: any[];
}

const METRICS = [
    { id: 'total_aum', label: 'AUM ($)', type: 'number' },
    { id: 'position_count', label: 'Position Count', type: 'number' },
    { id: 'top_10_concentration', label: 'Top 10 Concentration (%)', type: 'number' },
    { id: 'primary_sector', label: 'Primary Sector', type: 'string' },
    { id: 'mega_cap_pct', label: 'Mega-Cap %', type: 'number' },
    { id: 'small_cap_pct', label: 'Small-Cap %', type: 'number' },
    { id: 'portfolio_turnover', label: 'Turnover (%)', type: 'number' },
    { id: 'avg_holding_period', label: 'Avg Holding Period (Q)', type: 'number' },
];

const OPERATORS = [
    { id: 'gt', label: 'Greater than' },
    { id: 'lt', label: 'Less than' },
    { id: 'eq', label: 'Equals' },
    { id: 'between', label: 'Between' },
];

export function InstitutionalExplorer({ onFollow }: InstitutionalExplorerProps) {
    const [filters, setFilters] = useState<FilterRow[]>([
        { id: Math.random().toString(), metric: 'total_aum', op: 'gt', val: 1000000000 }
    ]);
    const [logic, setLogic] = useState<'AND' | 'OR'>('AND');
    const [results, setResults] = useState<FundStats[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncingCik, setSyncingCik] = useState<string | null>(null);

    const addFilter = () => {
        setFilters([...filters, { id: Math.random().toString(), metric: 'total_aum', op: 'gt', val: 0 }]);
    };

    const removeFilter = (id: string) => {
        setFilters(filters.filter(f => f.id !== id));
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
                    filters: filters.map(({ metric, op, val }) => ({ metric, op, val: parseFloat(val) || val }))
                })
            });
            const data = await res.json();
            setResults(data);
        } catch (err) {
            console.error("Search failed", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        handleSearch();
    }, []);

    const handleFollow = async (cik: string) => {
        setSyncingCik(cik);
        try {
            // In a real app, this would trigger a deep sync background task
            // and then navigate once complete or just navigate and let background task run
            onFollow(cik);
        } finally {
            setSyncingCik(null);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden p-6 gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Institutional Explorer</h2>
                    <p className="text-gray-400 mt-1">Screen the Top 2,000 Whales by conviction and scale.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleSearch}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                        Run Screen
                    </button>
                </div>
            </div>

            {/* Filter Builder */}
            <div className="bg-[#1a1d23] border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-2">
                    <div className="flex items-center gap-3">
                        <Filter size={18} className="text-blue-500" />
                        <span className="font-semibold text-white">Active Filters</span>
                    </div>
                    <div className="flex bg-[#0f1115] p-1 rounded-lg border border-gray-800">
                        <button 
                            onClick={() => setLogic('AND')}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${logic === 'AND' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            MATCH ALL (AND)
                        </button>
                        <button 
                            onClick={() => setLogic('OR')}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${logic === 'OR' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            MATCH ANY (OR)
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    {filters.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-200">
                            <select 
                                value={f.metric}
                                onChange={(e) => updateFilter(f.id, { metric: e.target.value })}
                                className="bg-[#0f1115] border border-gray-800 text-gray-300 px-3 py-2 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none flex-1"
                            >
                                {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                            </select>
                            
                            <select 
                                value={f.op}
                                onChange={(e) => updateFilter(f.id, { op: e.target.value })}
                                className="bg-[#0f1115] border border-gray-800 text-gray-300 px-3 py-2 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none w-40"
                            >
                                {OPERATORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>

                            <input 
                                type="text"
                                value={f.val}
                                onChange={(e) => updateFilter(f.id, { val: e.target.value })}
                                placeholder="Value..."
                                className="bg-[#0f1115] border border-gray-800 text-gray-300 px-3 py-2 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none w-48"
                            />

                            <button 
                                onClick={() => removeFilter(f.id)}
                                className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    ))}
                    
                    <button 
                        onClick={addFilter}
                        className="flex items-center gap-2 text-blue-500 hover:text-blue-400 text-sm font-semibold mt-2 transition-colors w-fit"
                    >
                        <Plus size={16} /> Add Filter Row
                    </button>
                </div>
            </div>

            {/* Results Grid */}
            <div className="flex-1 bg-[#1a1d23] border border-gray-800 rounded-xl overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-[#0f1115] text-gray-400 text-xs font-bold uppercase tracking-wider sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-4">Fund Name</th>
                                <th className="px-6 py-4">AUM</th>
                                <th className="px-6 py-4">Top 10 %</th>
                                <th className="px-6 py-4">Primary Sector</th>
                                <th className="px-6 py-4">Turnover</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {results.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500 italic">
                                        No funds match these criteria. Try relaxing your filters.
                                    </td>
                                </tr>
                            ) : results.map((fund) => (
                                <tr key={fund.cik} className="hover:bg-[#252a33] transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-white font-medium group-hover:text-blue-400 transition-colors">{fund.name}</span>
                                            <span className="text-gray-500 text-xs mt-0.5">{fund.cik}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-white">{formatCurrency(fund.total_aum)}</div>
                                        <div className="text-[10px] text-gray-500">{fund.position_count} positions</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-blue-500" 
                                                    style={{ width: `${fund.top_10_concentration}%` }}
                                                />
                                            </div>
                                            <span className="text-white text-sm">{fund.top_10_concentration.toFixed(1)}%</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-white">{fund.primary_sector}</span>
                                            <span className="text-gray-500 text-xs">({fund.primary_sector_weight.toFixed(0)}%)</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            fund.portfolio_turnover > 20 ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'
                                        }`}>
                                            {fund.portfolio_turnover.toFixed(1)}% Turnover
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => handleFollow(fund.cik)}
                                            disabled={syncingCik === fund.cik}
                                            className="bg-gray-800 hover:bg-blue-600 text-white p-2 rounded-lg transition-all transform hover:scale-105"
                                        >
                                            {syncingCik === fund.cik ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {loading && (
                    <div className="absolute inset-0 bg-[#0f1115]/50 backdrop-blur-sm flex items-center justify-center">
                        <Loader2 className="animate-spin text-blue-500" size={48} />
                    </div>
                )}
            </div>
        </div>
    );
}
