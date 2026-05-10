import React, { useState, useEffect, useRef } from 'react';
import { Search, List, TrendingUp, Info, LayoutGrid, X, Command, Briefcase } from 'lucide-react';
import { fetchWithAuth } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (view: string, cik: string | null) => void;
}

interface SearchResults {
    funds: { cik: string; name: string }[];
    tickers: { ticker: string; issuer: string; holders: any[] }[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onNavigate }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResults>({ funds: [], tickers: [] });
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const { session } = useAuth();

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setResults({ funds: [], tickers: [] });
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!query.trim()) {
            setResults({ funds: [], tickers: [] });
            return;
        }

        const delayDebounce = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetchWithAuth(`/api/search?q=${encodeURIComponent(query)}`, {}, session);
                if (res.ok) {
                    const data = await res.json();
                    setResults(data);
                    setSelectedIndex(0);
                }
            } catch (err) {
                console.error("Search failed", err);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounce);
    }, [query]);

    const allResults = [
        ...results.funds.map(f => ({ type: 'fund', id: f.cik, title: f.name, sub: `CIK ${f.cik}` })),
        ...results.tickers.map(t => ({ type: 'ticker', id: t.ticker, title: t.ticker, sub: t.issuer }))
    ];

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, allResults.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            const selected = allResults[selectedIndex];
            if (selected) {
                if (selected.type === 'fund') {
                    onNavigate('summary', selected.id);
                } else {
                    // Navigate to dashboard and maybe highlight ticker?
                    // For now just go to dashboard
                    onNavigate('dashboard', null);
                }
                onClose();
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'start',
            justifyContent: 'center',
            paddingTop: '15vh'
        }} onClick={onClose}>
            <div 
                style={{
                    width: '100%',
                    maxSize: '600px',
                    maxWidth: '600px',
                    background: '#1e293b',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                    overflow: 'hidden'
                }} 
                onClick={e => e.stopPropagation()}
            >
                <div style={{ padding: '16px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Search size={20} color="#94a3b8" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search for a fund (name/CIK) or stock ticker..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: '#f8fafc',
                            fontSize: '16px'
                        }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', color: '#94a3b8' }}>
                        <span style={{ fontSize: '12px' }}>ESC</span>
                    </div>
                </div>

                <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '8px' }}>
                    {!query && (
                        <div style={{ padding: '12px', color: '#64748b', fontSize: '13px' }}>
                            <div style={{ marginBottom: '8px', fontWeight: 600, color: '#94a3b8' }}>QUICK NAVIGATION</div>
                            <div 
                                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', cursor: 'pointer', borderRadius: '6px' }}
                                onMouseOver={e => e.currentTarget.style.background = '#334155'}
                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                onClick={() => { onNavigate('dashboard', null); onClose(); }}
                            >
                                <LayoutGrid size={16} /> Global Dashboard
                            </div>
                            <div 
                                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', cursor: 'pointer', borderRadius: '6px' }}
                                onMouseOver={e => e.currentTarget.style.background = '#334155'}
                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                onClick={() => { onNavigate('about', null); onClose(); }}
                            >
                                <Info size={16} /> Methodology & About
                            </div>
                        </div>
                    )}

                    {loading && <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>Searching...</div>}

                    {allResults.length > 0 && (
                        <div>
                            {allResults.map((res, i) => (
                                <div
                                    key={`${res.type}-${res.id}-${i}`}
                                    onClick={() => {
                                        if (res.type === 'fund') onNavigate('summary', res.id);
                                        else onNavigate('dashboard', null);
                                        onClose();
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        background: selectedIndex === i ? '#3b82f6' : 'transparent',
                                        color: selectedIndex === i ? '#ffffff' : '#f1f5f9'
                                    }}
                                    onMouseEnter={() => setSelectedIndex(i)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {res.type === 'fund' ? <Briefcase size={16} /> : <TrendingUp size={16} />}
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: 500 }}>{res.title}</div>
                                            <div style={{ fontSize: '12px', color: selectedIndex === i ? '#bfdbfe' : '#94a3b8' }}>{res.sub}</div>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '11px', color: selectedIndex === i ? '#bfdbfe' : '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                                        {res.type}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {query && !loading && allResults.length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                            No funds or tickers found for "{query}"
                        </div>
                    )}
                </div>
                
                <div style={{ padding: '8px 16px', background: '#0f172a', borderTop: '1px solid #334155', display: 'flex', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b' }}>
                        <span style={{ padding: '1px 4px', background: '#334155', borderRadius: '3px' }}>↵</span> Select
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b' }}>
                        <span style={{ padding: '1px 4px', background: '#334155', borderRadius: '3px' }}>↑↓</span> Navigate
                    </div>
                </div>
            </div>
        </div>
    );
};

