import React, { useState } from 'react';
import { X, Download, FileSpreadsheet, Check } from 'lucide-react';

interface PerformanceDataPoint {
    period: string;
    return: number;
    irr: number;
    benchmarkReturn?: number;
    benchmarkRaw?: number;
    [key: string]: any;
}

interface PerformanceStats {
    totalReturn: number;
    irr: number;
    benchmarkTotal: number | null;
    benchmarkIrr: number | null;
    totalPnL: number;
    totalCommitted: number;
    portfolioRoi: number;
}

interface PerformanceExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: PerformanceDataPoint[];
    stats: PerformanceStats;
    fundName: string;
}

export const PerformanceExportModal: React.FC<PerformanceExportModalProps> = ({
    isOpen,
    onClose,
    data,
    stats,
    fundName
}) => {
    const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({
        date: true,
        quarter: true,
        portfolioReturn: true,
        irr: true,
        benchmarkReturn: true,
        alpha: true,
        pnl: true,
        committed: true,
        roi: true
    });

    if (!isOpen) return null;

    const formatQuarterLabel = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const q = Math.floor(d.getMonth() / 3) + 1;
        const year = d.getFullYear().toString().slice(2);
        return `${q}Q '${year}`;
    };

    const toggleField = (field: string) => {
        setSelectedFields(prev => ({ ...prev, [field]: !prev[field] }));
    };

    const handleExport = () => {
        // Define columns
        const columnDefinitions = [
            { key: 'period', header: 'Date', field: 'date', format: (item: PerformanceDataPoint) => item.period },
            { key: 'quarter', header: 'Quarter', field: 'quarter', format: (item: PerformanceDataPoint) => formatQuarterLabel(item.period) },
            { key: 'return', header: 'Portfolio Return (%)', field: 'portfolioReturn', format: (item: PerformanceDataPoint) => item.return.toFixed(2) },
            { key: 'irr', header: 'Annualized IRR (%)', field: 'irr', format: (item: PerformanceDataPoint) => item.irr.toFixed(2) },
            { key: 'benchmarkReturn', header: 'Benchmark Return (%)', field: 'benchmarkReturn', format: (item: PerformanceDataPoint) => item.benchmarkReturn?.toFixed(2) || '0.00' },
            { 
                key: 'alpha', 
                header: 'Alpha (%)', 
                field: 'alpha', 
                format: (item: PerformanceDataPoint) => ((item.return || 0) - (item.benchmarkReturn || 0)).toFixed(2) 
            },
            { key: 'pnl', header: 'Estimated P&L ($)', field: 'pnl', format: (item: PerformanceDataPoint, idx: number) => {
                // Since pnl is cumulative in stats but we might want period if possible, 
                // but our data structure for time series return is % based.
                // For now we just put the summary stats in a separate section or as a single row?
                // Actually, let's keep it simple and just export the time series.
                return ""; 
            }},
        ];

        const activeColumns = columnDefinitions.filter(col => selectedFields[col.field]);

        // Create CSV Header
        const headerRow = activeColumns.map(col => `"${col.header}"`).join(',');

        // Create CSV Rows
        const rows = data.map(item => {
            return activeColumns.map(col => {
                const val = col.format(item, 0);
                if (val === undefined || val === null || val === '') return '""';
                if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
                return val;
            }).join(',');
        });

        // Add Summary Stats at the bottom
        const summaryRows = [
            '',
            '"Summary Metrics"',
            `"Total Portfolio Return (%)","${stats.totalReturn.toFixed(2)}%"`,
            `"Annualized IRR (%)","${stats.irr.toFixed(2)}%"`,
            `"Benchmark Total Return (%)","${stats.benchmarkTotal?.toFixed(2) || 'N/A'}%"`,
            `"Benchmark Annualized IRR (%)","${stats.benchmarkIrr?.toFixed(2) || 'N/A'}%"`,
            `"Total Estimated P&L ($)","${stats.totalPnL.toFixed(0)}"`,
            `"Total Committed Capital ($)","${stats.totalCommitted.toFixed(0)}"`,
            `"Overall ROI (x)","${stats.portfolioRoi.toFixed(2)}x"`
        ];

        const csvContent = [headerRow, ...rows, ...summaryRows].join('\n');
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        const fileName = `${fundName.replace(/[^a-z0-9]/gi, '_')}_Performance_Export.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        onClose();
    };

    return (
        <div className="csv-modal-overlay" onClick={onClose}>
            <div className="csv-modal" onClick={e => e.stopPropagation()}>
                <div className="csv-modal-header">
                    <div>
                        <div className="csv-header-tag">
                            <FileSpreadsheet size={12} />
                            CSV Export
                        </div>
                        <h2>Export Performance</h2>
                        <p className="subtitle">{fundName}</p>
                    </div>
                    <button className="csv-modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="csv-modal-content">
                    <div className="section">
                        <h3>Customize Fields</h3>
                        <div className="fields-grid">
                            {Object.keys(selectedFields).map(field => {
                                const labels: Record<string, string> = {
                                    date: 'Date',
                                    quarter: 'Quarter Label',
                                    portfolioReturn: 'Portfolio Return',
                                    irr: 'Annualized IRR',
                                    benchmarkReturn: 'Benchmark Return',
                                    alpha: 'Alpha',
                                    pnl: 'Summary Stats'
                                };
                                if (field === 'committed' || field === 'roi') return null; // These are summary only
                                
                                return (
                                    <div
                                        key={field}
                                        className={`field-checkbox-item ${selectedFields[field] ? 'checked' : ''}`}
                                        onClick={() => toggleField(field)}
                                    >
                                        <div className="checkbox-box">
                                            {selectedFields[field] && <Check size={10} />}
                                        </div>
                                        <span className="field-label">
                                            {labels[field] || field}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="section">
                        <div className="export-note">
                            <Check size={14} style={{ color: '#10b981' }} />
                            <span>Full history and summary metrics will be included in the export.</span>
                        </div>
                    </div>
                </div>

                <div className="csv-modal-footer">
                    <button className="cancel-btn" onClick={onClose}>Cancel</button>
                    <button className="download-btn-primary" onClick={handleExport}>
                        <Download size={18} />
                        Download CSV
                    </button>
                </div>
            </div>
        </div>
    );
};
