import React, { useState, useMemo } from 'react';

import { TrendingUp, ArrowUp, ArrowDown, DollarSign, PlusCircle, MinusCircle, LayoutGrid, Briefcase, ChevronRight, Info, PieChart, Activity, AlertCircle } from 'lucide-react';
import { HistoricalHolding } from './PortfolioChart';
import { createPortal } from 'react-dom';

interface FundSummaryProps {
    history: HistoricalHolding[];
    fundName: string;
}

interface TooltipState {
    x: number;
    y: number;
    title: string;
    content: React.ReactNode;
}

const formatCurrency = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (absValue >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (absValue >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
};

const formatQ = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const q = Math.floor((d.getMonth() + 3) / 3);
    return `${q}Q '${d.getFullYear().toString().slice(2)}`;
};

export const FundSummary: React.FC<FundSummaryProps> = ({ history, fundName }) => {
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);

    const handleMouseEnter = (e: React.MouseEvent, title: string, content: React.ReactNode) => {
        setTooltip({
            x: e.clientX,
            y: e.clientY,
            title,
            content
        });
    };

    const handleMouseLeave = () => {
        setTooltip(null);
    };

    const {
        latestPeriod,
        currentHoldings,
        aum,
        priorAum,
        newPositions,
        exitedPositions,
        movers,
        topHoldings,
        swoopOpportunities
    } = useMemo(() => {
        if (!history || history.length === 0) {
            return {
                latestPeriod: '', priorPeriod: '', currentHoldings: [],
                aum: 0, priorAum: 0, newPositions: [], exitedPositions: [], movers: [], topHoldings: [], swoopOpportunities: []
            };
        }

        // Get unique periods sorted desc
        const uniquePeriods = Array.from(new Set(history.map(h => h.period_of_report)))
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

        const latestPeriod = uniquePeriods[0];
        const priorPeriod = uniquePeriods[1];

        const currentHoldingsRaw = history.filter(h => h.period_of_report === latestPeriod);
        const priorHoldingsRaw = priorPeriod ? history.filter(h => h.period_of_report === priorPeriod) : [];

        // Calculate AUMs
        const aum = currentHoldingsRaw.reduce((sum, h) => sum + h.value, 0);
        const priorAum = priorHoldingsRaw.reduce((sum, h) => sum + h.value, 0);

        // Process Holdings with Weights
        const currentHoldings = currentHoldingsRaw.map(h => ({
            ...h,
            weight: (h.value / aum) * 100
        }));

        const priorHoldingsMap = new Map(priorHoldingsRaw.map(h => [h.cusip, {
            ...h,
            weight: (h.value / priorAum) * 100
        }]));

        // Identify Changes & Swoop Opportunities
        const newPositions: any[] = [];
        const movers: any[] = [];
        const processedCusips = new Set<string>();
        const swoopCandidates: any[] = [];

        currentHoldings.forEach(curr => {
            processedCusips.add(curr.cusip);
            const prev = priorHoldingsMap.get(curr.cusip);

            if (!prev) {
                // New Position
                newPositions.push({
                    ticker: curr.ticker,
                    issuer_name: curr.issuer_name,
                    value: curr.value,
                    weight: curr.weight
                });
                movers.push({
                    ticker: curr.ticker,
                    issuer_name: curr.issuer_name,
                    val_change: curr.value,
                    weight_change: curr.weight,
                    curr_weight: curr.weight,
                    pct_change: 100
                });
            } else {
                // Determine change
                const valChange = curr.value - prev.value;
                const weightChange = curr.weight - prev.weight;

                movers.push({
                    ticker: curr.ticker,
                    issuer_name: curr.issuer_name,
                    val_change: valChange,
                    weight_change: weightChange,
                    curr_weight: curr.weight,
                    pct_change: prev.value > 0 ? ((curr.value - prev.value) / prev.value) * 100 : 0
                });

                // Swoop Check (Price Logic)
                if (curr.weight > 2.0) { // High Conviction Threshold
                    const currentPrice = curr.shares > 0 ? curr.value / curr.shares : 0;
                    const prevPrice = prev.shares > 0 ? prev.value / prev.shares : 0;

                    if (currentPrice > 0 && prevPrice > 0) {
                        const priceChange = (currentPrice - prevPrice) / prevPrice;
                        // Split Detection Heuristic: Price drop > 30% AND Shares Incr > 30% -> Likely Split
                        const isLikelySplit = priceChange < -0.3 && (curr.shares / prev.shares > 1.3);

                        // Debug Log
                        console.log(`[SwoopCheck] ${curr.ticker || curr.cusip}: Weight=${curr.weight.toFixed(1)}%, PxChange=${(priceChange * 100).toFixed(1)}%, IsSplit=${isLikelySplit}, DropCandidates?=${!isLikelySplit && priceChange < -0.10}`);

                        if (!isLikelySplit && priceChange < -0.10) { // Drop > 10%
                            swoopCandidates.push({
                                ticker: curr.ticker,
                                issuer_name: curr.issuer_name,
                                dropPct: priceChange * 100,
                                weight: curr.weight,
                                currentPrice,
                                prevPrice
                            });
                        }
                    }
                }
            }
        });

        // Identify Exits
        const exitedPositions: any[] = [];
        priorHoldingsRaw.forEach(prev => {
            if (!processedCusips.has(prev.cusip)) {
                exitedPositions.push({
                    ticker: prev.ticker,
                    issuer_name: prev.issuer_name,
                    value: prev.value,
                    weight: (prev.value / priorAum) * 100
                });
                movers.push({
                    ticker: prev.ticker,
                    issuer_name: prev.issuer_name,
                    val_change: -prev.value,
                    weight_change: -((prev.value / priorAum) * 100),
                    curr_weight: 0,
                    pct_change: -100
                });
            }
        });

        // Top Holdings
        const topHoldings = [...currentHoldings].sort((a, b) => b.value - a.value).slice(0, 10);

        // Final Sorts
        const swoopOpportunities = swoopCandidates.sort((a, b) => a.dropPct - b.dropPct); // Biggest drop first (most negative)

        return {
            latestPeriod,
            priorPeriod,
            currentHoldings,
            aum,
            priorAum,
            newPositions: newPositions.sort((a, b) => b.value - a.value),
            exitedPositions: exitedPositions.sort((a, b) => b.value - a.value),
            movers: movers.sort((a, b) => Math.abs(b.val_change) - Math.abs(a.val_change)),
            topHoldings,
            swoopOpportunities
        };
    }, [history]);

    const aumChange = aum - priorAum;
    const aumChangePercent = priorAum > 0 ? (aumChange / priorAum) * 100 : 0;
    const positionsChange = currentHoldings.length - (priorAum > 0 ? history.filter(h => h.period_of_report !== latestPeriod && h.period_of_report === (history.find(x => x.period_of_report !== latestPeriod)?.period_of_report))?.length || 0 : 0);

    const newPosValue = newPositions.reduce((sum, p) => sum + p.value, 0);
    const newPosWeight = newPositions.reduce((sum, p) => sum + p.weight, 0);
    const exitedPosValue = exitedPositions.reduce((sum, p) => sum + p.value, 0);
    const exitedPosWeight = exitedPositions.reduce((sum, p) => sum + p.weight, 0);

    // Dynamic Metrics
    const top10Concentration = topHoldings.reduce((sum, h) => sum + h.weight, 0);
    const turnoverValue = movers.reduce((sum, m) => sum + Math.abs(m.val_change), 0) / 2;
    const avgAum = (aum + priorAum) / 2;
    const turnoverRate = avgAum > 0 ? (turnoverValue / avgAum) * 100 : 0;

    if (!history || history.length === 0) {
        return (
            <div className="loading-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <AlertCircle size={48} style={{ color: '#64748b', opacity: 0.5 }} />
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#94a3b8' }}>No historical data found for {fundName}</div>
                <div style={{ fontSize: '14px', color: '#64748b', maxWidth: '400px', lineHeight: 1.5 }}>
                    We couldn't find any processed 13F filings for this CIK.
                    Try clicking "Refresh Data" or "Fetch Older Filings" to pull history from the SEC.
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-container" style={{ padding: '0 20px 20px 20px' }}>
            {/* KPI Tiles Row */}
            <div className="kpi-tiles-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {/* POSITIONS TILE */}
                <div
                    className="kpi-tile has-tooltip"
                    onMouseEnter={(e) => handleMouseEnter(e, 'Position Changes', (
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {newPositions.length > 0 && (
                                <div style={{ marginBottom: '8px' }}>
                                    <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 700, marginBottom: '4px' }}>ADDED ({newPositions.length})</div>
                                    {newPositions.map(p => (
                                        <div key={p.ticker} style={{ fontSize: '11px', color: '#e2e8f0' }}>+ {p.ticker}</div>
                                    ))}
                                </div>
                            )}
                            {exitedPositions.length > 0 && (
                                <div>
                                    <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 700, marginBottom: '4px' }}>REMOVED ({exitedPositions.length})</div>
                                    {exitedPositions.map(p => (
                                        <div key={p.ticker} style={{ fontSize: '11px', color: '#94a3b8' }}>- {p.ticker}</div>
                                    ))}
                                </div>
                            )}
                            {newPositions.length === 0 && exitedPositions.length === 0 && (
                                <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No changes this quarter</div>
                            )}
                        </div>
                    ))}
                    onMouseLeave={handleMouseLeave}
                >
                    <div className="kpi-icon"><Briefcase size={18} /></div>
                    <div className="kpi-content">
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                            <span className="kpi-value">{currentHoldings.length}</span>
                            {positionsChange !== undefined && (
                                <span style={{
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: (currentHoldings.length - (currentHoldings.length - newPositions.length + exitedPositions.length)) > 0 ? '#10b981' : '#ef4444',
                                    display: 'flex', alignItems: 'center'
                                }}>
                                    {(currentHoldings.length - (currentHoldings.length - newPositions.length + exitedPositions.length)) > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                                    {Math.abs(currentHoldings.length - (currentHoldings.length - newPositions.length + exitedPositions.length))}
                                </span>
                            )}
                        </div>
                        <span className="kpi-label">Positions</span>
                    </div>
                </div>

                {/* AUM TILE */}
                <div className="kpi-tile">
                    <div className="kpi-icon"><DollarSign size={18} /></div>
                    <div className="kpi-content">
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span className="kpi-value">{formatCurrency(aum)}</span>
                            <span style={{
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: aumChange >= 0 ? '#10b981' : '#ef4444',
                                display: 'flex', alignItems: 'center', gap: '2px'
                            }}>
                                {aumChange >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                                {Math.abs(aumChangePercent).toFixed(1)}%
                            </span>
                        </div>
                        <span className="kpi-label">Total AUM</span>
                    </div>
                </div>

                {/* NEW POSITIONS TILE */}
                <div
                    className="kpi-tile has-tooltip"
                    onMouseEnter={(e) => handleMouseEnter(e, 'New Positions', (
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {newPositions.map(p => (
                                <div key={p.ticker || p.issuer_name} className="tooltip-position-row" style={{ gridTemplateColumns: '50px 1fr auto' }}>
                                    <span className="pos-ticker">{p.ticker || 'N/A'}</span>
                                    <span className="pos-fund">{p.issuer_name}</span>
                                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '11px', color: '#e2e8f0' }}>{formatCurrency(p.value)}</span>
                                        <span className="pos-weight">{p.weight.toFixed(1)}%</span>
                                    </div>
                                </div>
                            ))}
                            {newPositions.length === 0 && <span style={{ color: '#64748b' }}>None</span>}
                        </div>
                    ))}
                    onMouseLeave={handleMouseLeave}
                >
                    <div className="kpi-icon positive"><PlusCircle size={18} /></div>
                    <div className="kpi-content">
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span className="kpi-value positive">{newPositions.length}</span>
                            {newPositions.length > 0 && (
                                <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 600 }}>
                                    {formatCurrency(newPosValue)} ({newPosWeight.toFixed(1)}%)
                                </span>
                            )}
                        </div>
                        <span className="kpi-label">New Positions</span>
                    </div>
                </div>

                {/* EXITED POSITIONS TILE */}
                <div
                    className="kpi-tile has-tooltip"
                    onMouseEnter={(e) => handleMouseEnter(e, 'Exited Positions', (
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {exitedPositions.map(p => (
                                <div key={p.ticker || p.issuer_name} className="tooltip-position-row" style={{ gridTemplateColumns: '50px 1fr auto' }}>
                                    <span className="pos-ticker">{p.ticker || 'N/A'}</span>
                                    <span className="pos-fund">{p.issuer_name}</span>
                                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '11px', color: '#e2e8f0' }}>{formatCurrency(p.value)}</span>
                                        <span className="pos-weight negative">-{p.weight.toFixed(1)}%</span>
                                    </div>
                                </div>
                            ))}
                            {exitedPositions.length === 0 && <span style={{ color: '#64748b' }}>None</span>}
                        </div>
                    ))}
                    onMouseLeave={handleMouseLeave}
                >
                    <div className="kpi-icon negative"><MinusCircle size={18} /></div>
                    <div className="kpi-content">
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span className="kpi-value negative">{exitedPositions.length}</span>
                            {exitedPositions.length > 0 && (
                                <span style={{ fontSize: '13px', color: '#ef4444', fontWeight: 600 }}>
                                    {formatCurrency(exitedPosValue)} (-{exitedPosWeight.toFixed(1)}%)
                                </span>
                            )}
                        </div>
                        <span className="kpi-label">Exited</span>
                    </div>
                </div>
            </div>

            {/* Tooltip Portal */}
            {tooltip && createPortal(
                <div
                    className="kpi-tooltip"
                    style={{
                        left: tooltip.x > window.innerWidth - 320 ? 'auto' : tooltip.x + 15,
                        right: tooltip.x > window.innerWidth - 320 ? window.innerWidth - tooltip.x + 15 : 'auto',
                        top: tooltip.y > window.innerHeight - 300 ? 'auto' : tooltip.y + 15,
                        bottom: tooltip.y > window.innerHeight - 300 ? window.innerHeight - tooltip.y + 15 : 'auto'
                    }}
                >
                    <div className="tooltip-title">{tooltip.title}</div>
                    {tooltip.content}
                </div>,
                document.body
            )}

            <div className="dashboard-grid">
                {/* Left Column: Top Holdings */}
                <div className="dashboard-main">
                    <section className="dashboard-section">
                        <div className="section-header">
                            <div className="section-icon-box">
                                <LayoutGrid className="section-icon" />
                            </div>
                            <div>
                                <h3 className="section-title">Top Holdings</h3>
                                <p className="section-desc">
                                    Largest positions by market value ({formatQ(latestPeriod)})
                                </p>
                            </div>
                        </div>

                        <div className="fund-summary-card" style={{ cursor: 'default' }}>
                            <div className="top-holdings-list" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                {topHoldings.map((h, i) => (
                                    <div key={i} className="mini-holding" style={{
                                        position: 'relative',
                                        padding: '12px 16px',
                                        backgroundColor: 'rgba(30, 41, 59, 0.4)',
                                        border: '1px solid rgba(255,255,255,0.05)',
                                        borderRadius: '6px',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        {/* Background Bar */}
                                        <div style={{
                                            position: 'absolute',
                                            bottom: 0,
                                            left: 0,
                                            height: '3px',
                                            width: `${(h.value / aum) * 100}%`,
                                            backgroundColor: '#10b981',
                                            opacity: 0.8
                                        }}></div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div className="holding-rank" style={{ color: '#64748b', fontSize: '14px', fontWeight: 600, width: '20px' }}>{i + 1}</div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <div style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>{h.ticker || 'N/A'}</div>
                                                <div style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {h.issuer_name.slice(0, 25)}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ textAlign: 'right', zIndex: 1 }}>
                                            <div style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 500 }}>{formatCurrency(h.value)}</div>
                                            <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>{h.weight.toFixed(1)}%</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                </div>

                {/* Right Column: Movers & Activity */}
                <div className="dashboard-sidebar">


                    {/* Big Movers */}
                    <section className="dashboard-section compact">
                        <div className="section-header">
                            <TrendingUp className="section-icon-small" />
                            <div>
                                <h3 className="section-title-small">Top Movers</h3>
                                <p className="section-desc-small">Largest changes QoQ</p>
                            </div>
                        </div>

                        <div className="movers-list scrollable">
                            {movers.slice(0, 10).map((mover, i) => {
                                const isPositive = mover.val_change >= 0;
                                return (
                                    <div key={i} className="mover-item">
                                        <div className="mover-info">
                                            <span className="mover-ticker">{mover.ticker || 'N/A'}</span>
                                            <span className="mover-fund" style={{ fontSize: '0.65rem', color: '#64748b' }}>{mover.issuer_name.slice(0, 15)}...</span>
                                        </div>
                                        <div className={`mover-delta ${isPositive ? 'positive' : 'negative'}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            {isPositive ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                                            <span style={{ fontWeight: 600 }}>{formatCurrency(mover.val_change)}</span>
                                            <span style={{ fontSize: '0.75em', opacity: 0.8, marginLeft: '2px' }}>
                                                ({(isPositive ? '+' : '')}{mover.weight_change?.toFixed(1)}%)
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* New Positions */}
                    <section className="dashboard-section compact">
                        <div className="section-header">
                            <PlusCircle className="section-icon-small" style={{ color: '#10b981' }} />
                            <div>
                                <h3 className="section-title-small">New Positions</h3>
                                <p className="section-desc-small">Top entries by value</p>
                            </div>
                        </div>
                        <div className="new-positions-list scrollable">
                            {newPositions.length > 0 ? (
                                newPositions.slice(0, 8).map((pos, i) => (
                                    <div key={i} className="new-position-item">
                                        <div className="new-position-info">
                                            <span className="new-position-ticker">{pos.ticker || 'N/A'}</span>
                                            <span className="new-position-fund">{pos.issuer_name.slice(0, 15)}...</span>
                                        </div>
                                        <div className="new-position-stats">
                                            <span className="new-position-value" style={{ color: '#10b981', fontWeight: 600 }}>{formatCurrency(pos.value)}</span>
                                            <span className="new-position-weight" style={{ color: '#10b981', fontWeight: 600 }}>{pos.weight.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ padding: '12px', color: '#64748b', fontSize: '13px', fontStyle: 'italic', textAlign: 'center' }}>
                                    No new positions.
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Exited Positions */}
                    <section className="dashboard-section compact">
                        <div className="section-header">
                            <MinusCircle className="section-icon-small" style={{ color: '#ef4444' }} />
                            <div>
                                <h3 className="section-title-small">Exited Positions</h3>
                                <p className="section-desc-small">Top exits by prior value</p>
                            </div>
                        </div>
                        <div className="exited-positions-list scrollable">
                            {exitedPositions.length > 0 ? (
                                exitedPositions.slice(0, 8).map((pos, i) => (
                                    <div key={i} className="exited-position-item">
                                        <div className="exited-position-info">
                                            <span className="exited-position-ticker">{pos.ticker || 'N/A'}</span>
                                            <span className="exited-position-fund">{pos.issuer_name.slice(0, 15)}...</span>
                                        </div>
                                        <div className="exited-position-stats">
                                            <span className="exited-position-value" style={{ color: '#ef4444', fontWeight: 600 }}>{formatCurrency(pos.value)}</span>
                                            <span className="exited-position-weight" style={{ color: '#ef4444', fontWeight: 600 }}>{pos.weight.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ padding: '12px', color: '#64748b', fontSize: '13px', fontStyle: 'italic', textAlign: 'center' }}>
                                    No exited positions.
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Swoop Opportunities (Always Rendered for Debugging) */}
                    <section className="dashboard-section compact" style={{ overflow: 'hidden' }}>
                        <div className="section-header">
                            <AlertCircle className="section-icon-small" style={{ color: '#eab308' }} />
                            <div>
                                <h3 className="section-title-small">Swoop Opps</h3>
                                <p className="section-desc-small">Conviction (&gt;2%) share price dips</p>
                            </div>
                        </div>
                        <div className="swoop-list scrollable" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                            {swoopOpportunities.length > 0 ? (
                                swoopOpportunities.slice(0, 5).map((op, i) => (
                                    <div key={i} className="mover-item" style={{ borderLeft: '3px solid #eab308', paddingLeft: '12px', display: 'flex', justifyContent: 'space-between', paddingRight: '4px' }}>
                                        <div className="mover-info">
                                            <div className="mover-ticker" style={{ fontWeight: 700, color: '#f1f5f9' }}>{op.ticker || 'N/A'}</div>
                                            <div className="mover-fund" style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                                                {formatCurrency(op.prevPrice)} {'->'} {formatCurrency(op.currentPrice)}
                                            </div>
                                        </div>
                                        <div className="mover-delta" style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'baseline' }}>
                                                <span style={{ fontSize: '9px', color: '#64748b', marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Price</span>
                                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>{op.dropPct.toFixed(1)}%</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: '1px' }}>
                                                <span style={{ fontSize: '9px', color: '#64748b', marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Weight</span>
                                                <span style={{ fontSize: '11px', color: '#64748b' }}>{op.weight.toFixed(1)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ padding: '12px', color: '#64748b', fontSize: '13px', fontStyle: 'italic', textAlign: 'center' }}>
                                    No high conviction dips found this quarter.
                                </div>
                            )}
                        </div>
                    </section>

                    {/* KEY METRICS (Bottom of Sidebar) */}
                    <section className="dashboard-section compact">
                        <div className="section-header">
                            <Activity className="section-icon-small" />
                            <div>
                                <h3 className="section-title-small">Key Metrics</h3>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '0 4px' }}>
                            <div
                                style={{ background: 'rgba(30,41,59,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', cursor: 'default' }}
                                onMouseEnter={(e) => handleMouseEnter(e, 'Concentration (Top 10)', (
                                    <div>
                                        <div style={{ marginBottom: '8px', fontSize: '11px', color: '#cbd5e1' }}>Combine weight: {top10Concentration.toFixed(1)}%</div>
                                        <div>
                                            {topHoldings.map(h => (
                                                <div key={h.ticker} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <span style={{ color: '#f1f5f9' }}>{h.ticker || 'N/A'}</span>
                                                    <span style={{ color: '#10b981' }}>{h.weight.toFixed(1)}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                onMouseLeave={handleMouseLeave}
                            >
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <PieChart size={12} /> Conc.
                                </div>
                                <div style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>
                                    {top10Concentration.toFixed(1)}%
                                </div>
                            </div>
                            <div
                                style={{ background: 'rgba(30,41,59,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', cursor: 'default' }}
                                onMouseEnter={(e) => handleMouseEnter(e, 'Turnover (QoQ)', <div style={{ maxWidth: '200px', fontSize: '11px', color: '#cbd5e1' }}>Estimated activity rate based on absolute value changes of holdings derived from quarterly filings.</div>)}
                                onMouseLeave={handleMouseLeave}
                            >
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Activity size={12} /> Turnover
                                </div>
                                <div style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>
                                    {turnoverRate.toFixed(1)}%
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
