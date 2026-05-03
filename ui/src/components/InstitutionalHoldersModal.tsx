import React from 'react';
import { X, Loader2, Fingerprint, MousePointer2, ExternalLink, PieChart, Activity } from 'lucide-react';
import { formatCurrency } from './PortfolioChart';

interface Holder {
    fund_name: string;
    cik: string;
    shares: number;
    value: number;
    weight: number;
    primary_sector?: string;
    portfolio_turnover?: number;
}

interface InstitutionalHoldersModalProps {
    ticker: string | null;
    holders: Holder[];
    loading: boolean;
    onClose: () => void;
    onAnalyze: (cik: string) => void;
}

export function InstitutionalHoldersModal({ 
    ticker, 
    holders, 
    loading, 
    onClose, 
    onAnalyze 
}: InstitutionalHoldersModalProps) {
    if (!ticker) return null;

    return (
        <div 
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(16px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                padding: '40px',
                animation: 'fadeIn 0.2s ease-out'
            }} 
            onClick={onClose}
        >
            <style>
                {`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                .modal-content { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                .holder-row:hover { background: rgba(255,255,255,0.03) !important; }
                `}
            </style>
            
            <div 
                className="modal-content"
                style={{
                    background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '32px', width: '100%', maxWidth: '1000px', maxHeight: '85vh',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
                }} 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ padding: '32px 40px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, rgba(15, 23, 42, 1), rgba(30, 41, 59, 0.5))' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
                            <div style={{ 
                                width: '48px', height: '48px', borderRadius: '14px', 
                                background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#0f172a', fontWeight: 900, fontSize: '18px',
                                boxShadow: '0 8px 16px -4px rgba(56, 189, 248, 0.4)'
                            }}>
                                {ticker.slice(0, 2)}
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '28px', color: '#f8fafc', fontWeight: 900, letterSpacing: '-0.02em' }}>{ticker}</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                    <span style={{ color: '#38bdf8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Institutional Holders</span>
                                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#334155' }}></span>
                                    <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>Latest Filings</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        style={{ 
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', 
                            color: '#64748b', padding: '12px', borderRadius: '16px', cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#f8fafc'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = '#64748b'; }}
                    >
                        <X size={20} />
                    </button>
                </div>
                
                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', background: '#020617' }}>
                    {loading ? (
                        <div style={{ padding: '120px', textAlign: 'center' }}>
                            <Loader2 size={48} className="animate-spin" style={{ color: '#38bdf8', margin: '0 auto 20px' }} />
                            <p style={{ color: '#64748b', fontWeight: 600, fontSize: '16px' }}>Analyzing Whale Holdings...</p>
                        </div>
                    ) : holders.length === 0 ? (
                        <div style={{ padding: '120px', textAlign: 'center' }}>
                            <Fingerprint size={64} style={{ color: '#1e293b', margin: '0 auto 24px' }} />
                            <p style={{ color: '#475569', fontSize: '18px', fontWeight: 600 }}>No institutional holders found for {ticker}.</p>
                            <p style={{ color: '#334155', fontSize: '14px', marginTop: '8px' }}>This may be due to data sync delays or the ticker being delisted.</p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead style={{ position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(8px)', zIndex: 10 }}>
                                <tr>
                                    <th style={{ padding: '18px 40px', fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Institution</th>
                                    <th style={{ padding: '18px 24px', fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>DNA & Focus</th>
                                    <th style={{ padding: '18px 24px', fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'right' }}>Shares</th>
                                    <th style={{ padding: '18px 24px', fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'right' }}>Market Value</th>
                                    <th style={{ padding: '18px 24px', fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'right' }}>Weight</th>
                                    <th style={{ padding: '18px 40px', fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {holders.map((h, i) => (
                                    <tr key={h.cik} className="holder-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s' }}>
                                        <td style={{ padding: '24px 40px' }}>
                                            <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>{h.fund_name}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '10px', color: '#475569', fontWeight: 700, fontMono: 'true' }}>CIK: {h.cik}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '24px 24px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {h.primary_sector && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
                                                        <PieChart size={12} className="text-blue-400" />
                                                        {h.primary_sector}
                                                    </div>
                                                )}
                                                {h.portfolio_turnover !== undefined && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '10px', fontWeight: 700 }}>
                                                        <Activity size={12} className="text-pink-500" />
                                                        {h.portfolio_turnover.toFixed(1)}% TURNOVER
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '24px 24px', textAlign: 'right', color: '#94a3b8', fontSize: '13px', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                                            {h.shares.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '24px 24px', textAlign: 'right' }}>
                                            <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: '15px' }}>{formatCurrency(h.value)}</div>
                                        </td>
                                        <td style={{ padding: '24px 24px', textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                <div style={{ color: '#38bdf8', fontWeight: 900, fontSize: '15px' }}>{h.weight.toFixed(2)}%</div>
                                                <div style={{ width: '40px', height: '3px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '10px', marginTop: '4px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${Math.min(h.weight * 5, 100)}%`, height: '100%', background: '#38bdf8' }} />
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '24px 40px', textAlign: 'right' }}>
                                            <button 
                                                onClick={() => onAnalyze(h.cik)}
                                                style={{ 
                                                    background: 'rgba(56, 189, 248, 0.1)', 
                                                    border: '1px solid rgba(56, 189, 248, 0.2)', 
                                                    color: '#38bdf8', 
                                                    padding: '8px 16px', 
                                                    borderRadius: '10px', 
                                                    fontSize: '11px', 
                                                    fontWeight: 800, 
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#38bdf8'; e.currentTarget.style.color = '#0f172a'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)'; e.currentTarget.style.color = '#38bdf8'; }}
                                            >
                                                ANALYZE <MousePointer2 size={12} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                
                {/* Footer / Stats */}
                <div style={{ padding: '20px 40px', borderTop: '1px solid rgba(255,255,255,0.05)', background: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '24px' }}>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                            <span style={{ color: '#94a3b8', fontWeight: 700 }}>{holders.length}</span> WHALE FUNDS IDENTIFIED
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                            AGGREGATE CONVICTION: <span style={{ color: '#38bdf8', fontWeight: 800 }}>{(holders.reduce((acc, h) => acc + h.weight, 0) / (holders.length || 1)).toFixed(2)}% AVG</span>
                        </div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#334155', fontWeight: 700, letterSpacing: '0.05em' }}>
                        SOURCE: SEC EDGAR 13F FILINGS
                    </div>
                </div>
            </div>
        </div>
    );
}
