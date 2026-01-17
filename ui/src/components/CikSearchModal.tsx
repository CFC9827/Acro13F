import { useState, useEffect, useRef } from 'react';
import { Search, X, Building2, Hash, Check, PlusCircle, Trash2, ExternalLink } from 'lucide-react';
import './CikSearchModal.css';

interface SearchResult {
    cik: string;
    name: string;
    ticker: string;
}

interface CikSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectCik: (cik: string) => void;
    onSelectCiks?: (ciks: string[]) => void;
}

export function CikSearchModal({ isOpen, onClose, onSelectCik, onSelectCiks }: CikSearchModalProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFunds, setSelectedFunds] = useState<SearchResult[]>([]);

    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (isOpen) {
            if (inputRef.current) inputRef.current.focus();
            setSelectedFunds([]); // Clear selection on open
            setQuery('');
            setResults([]);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        // Debounce search
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/search-cik?q=${encodeURIComponent(query)}&limit=20`);
                if (!res.ok) throw new Error('Search failed');
                const data = await res.json();
                setResults(data);
            } catch (e: any) {
                setError(e.message || 'Search failed');
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [query]);

    // Format CIK removing leading zeros
    const formatCik = (cik: string) => cik.replace(/^0+/, '');

    const handleSelect = (fund: SearchResult) => {
        if (onSelectCiks) {
            // Multi-select mode
            setSelectedFunds(prev => {
                const exists = prev.find(f => f.cik === fund.cik);
                if (exists) {
                    return prev.filter(f => f.cik !== fund.cik);
                }
                return [...prev, fund];
            });
            // Clear query and refocus input for rapid selection
            setQuery('');
            setResults([]);
            setTimeout(() => inputRef.current?.focus(), 0);
        } else {
            // Single select mode (legacy fallback)
            onSelectCik(formatCik(fund.cik));
            setQuery('');
            setResults([]);
            onClose();
        }
    };

    const handleBatchSubmit = () => {
        if (onSelectCiks && selectedFunds.length > 0) {
            onSelectCiks(selectedFunds.map(f => formatCik(f.cik)));
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="cik-modal-overlay" onClick={onClose}>
            <div className="cik-modal" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
                <div className="cik-modal-header">
                    <h2>Add Hedge Fund</h2>
                    <button className="cik-modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="cik-search-input-wrapper">
                    <Search size={18} className="cik-search-icon" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search for a fund name or CIK..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        className="cik-search-input"
                    />
                    {loading && <div className="cik-search-spinner" />}
                </div>

                {/* Selected Funds Chips */}
                {selectedFunds.length > 0 && (
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #334155',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        maxHeight: '100px',
                        overflowY: 'auto'
                    }}>
                        {selectedFunds.map(fund => (
                            <div key={fund.cik} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#38bdf8',
                                color: '#0f172a',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600
                            }}>
                                <span>{fund.name}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelect(fund);
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                                >
                                    <X size={14} color="#0f172a" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="cik-results" style={{ maxHeight: selectedFunds.length > 0 ? '250px' : '300px' }}>
                    {error && (
                        <div className="cik-error">{error}</div>
                    )}

                    {!error && results.length === 0 && query.trim() && !loading && (
                        <div className="cik-no-results">No results found for "{query}"</div>
                    )}

                    {!error && results.length === 0 && !query.trim() && (
                        <div className="cik-hint">
                            <p>Enter a fund name, ticker symbol, or CIK number to search.</p>
                            <p className="cik-hint-example">Examples: "Berkshire", "BRK", "1067983"</p>
                        </div>
                    )}

                    {results.map(result => {
                        const isSelected = selectedFunds.some(f => f.cik === result.cik);
                        return (
                            <div
                                key={result.cik}
                                className={`cik-result-item ${isSelected ? 'selected' : ''}`}
                                onClick={() => handleSelect(result)}
                                style={{
                                    background: isSelected ? 'rgba(56, 189, 248, 0.1)' : undefined,
                                    borderLeft: isSelected ? '3px solid #38bdf8' : '3px solid transparent'
                                }}
                            >
                                <div className="cik-result-main">
                                    <Building2 size={16} className="cik-result-icon" />
                                    <span className="cik-result-name">{result.name}</span>
                                    {result.ticker && (
                                        <span className="cik-result-ticker">{result.ticker}</span>
                                    )}
                                </div>
                                <div className="cik-result-cik" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Hash size={12} />
                                        {formatCik(result.cik)}
                                    </div>
                                    <a
                                        href={`https://www.sec.gov/edgar/browse/?CIK=${result.cik}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="cik-external-link"
                                        style={{ color: '#64748b', display: 'flex', alignItems: 'center' }}
                                        title="View on SEC EDGAR"
                                    >
                                        <ExternalLink size={14} />
                                    </a>
                                    {isSelected && <Check size={16} color="#38bdf8" />}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="cik-modal-footer" style={{ borderTop: '1px solid #1e293b', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {onSelectCiks && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                            <button
                                disabled={selectedFunds.length === 0}
                                onClick={handleBatchSubmit}
                                style={{
                                    background: selectedFunds.length > 0 ? '#3b82f6' : '#1e293b',
                                    color: selectedFunds.length > 0 ? 'white' : '#64748b',
                                    border: selectedFunds.length > 0 ? 'none' : '1px solid #334155',
                                    padding: '10px 24px',
                                    borderRadius: '8px',
                                    fontWeight: 700,
                                    fontSize: '14px',
                                    cursor: selectedFunds.length > 0 ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: selectedFunds.length > 0 ? '0 4px 12px rgba(59, 130, 246, 0.25)' : 'none'
                                }}
                            >
                                <PlusCircle size={18} />
                                {selectedFunds.length > 0 ? `Add ${selectedFunds.length} Selected Funds` : 'Add Funds'}
                            </button>
                        </div>
                    )}

                    <div style={{
                        textAlign: 'center',
                        fontSize: '12px',
                        color: '#64748b',
                        paddingTop: onSelectCiks ? '8px' : '0',
                        borderTop: onSelectCiks ? '1px solid rgba(255,255,255,0.03)' : 'none'
                    }}>
                        <span>Can't find a fund? </span>
                        <a
                            href="https://www.sec.gov/edgar/searchedgar/companysearch"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                color: '#3b82f6',
                                textDecoration: 'none',
                                fontWeight: 600,
                                transition: 'color 0.2s'
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.color = '#60a5fa')}
                            onMouseOut={(e) => (e.currentTarget.style.color = '#3b82f6')}
                        >
                            Search SEC EDGAR directly.
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
