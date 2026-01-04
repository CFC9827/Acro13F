import { useState, useEffect, useRef } from 'react';
import { Search, X, Building2, Hash } from 'lucide-react';
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
}

export function CikSearchModal({ isOpen, onClose, onSelectCik }: CikSearchModalProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
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

    const handleSelect = (cik: string) => {
        // Remove leading zeros for the CIK input
        const trimmedCik = cik.replace(/^0+/, '');
        onSelectCik(trimmedCik);
        setQuery('');
        setResults([]);
        onClose();
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

                <div className="cik-results">
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

                    {results.map(result => (
                        <div
                            key={result.cik}
                            className="cik-result-item"
                            onClick={() => handleSelect(result.cik)}
                        >
                            <div className="cik-result-main">
                                <Building2 size={16} className="cik-result-icon" />
                                <span className="cik-result-name">{result.name}</span>
                                {result.ticker && (
                                    <span className="cik-result-ticker">{result.ticker}</span>
                                )}
                            </div>
                            <div className="cik-result-cik">
                                <Hash size={12} />
                                {result.cik.replace(/^0+/, '')}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="cik-modal-footer">
                    <span>Can't find it? </span>
                    <a
                        href="https://www.sec.gov/search-filings"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Search SEC EDGAR directly →
                    </a>
                </div>
            </div>
        </div>
    );
}
