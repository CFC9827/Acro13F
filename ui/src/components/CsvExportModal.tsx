import React, { useState } from 'react';
import { X, Download, FileSpreadsheet, Check, ChevronDown } from 'lucide-react';

interface CsvExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentQuarterData: any[];
    fullHistoryData: any[];
    availableQuarters: string[];
    fundName: string;
    quarterLabel: string;
}

export const CsvExportModal: React.FC<CsvExportModalProps> = ({
    isOpen,
    onClose,
    currentQuarterData,
    fullHistoryData,
    availableQuarters,
    fundName,
    quarterLabel
}) => {
    const [exportScope, setExportScope] = useState<'current' | 'history' | 'custom'>('current');
    const [customStart, setCustomStart] = useState<string>(availableQuarters[availableQuarters.length - 1] || '');
    const [customEnd, setCustomEnd] = useState<string>(availableQuarters[0] || '');
    const [showStartDropdown, setShowStartDropdown] = useState(false);
    const [showEndDropdown, setShowEndDropdown] = useState(false);

    const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({
        ticker: true,
        name: true,
        cusip: true,
        shares: true,
        value: true,
        percent: true,
        deltaShares: true,
        deltaValue: true,
        percentDelta: true,
        priceDelta: true,
        capAllocation: true,
        roi: true,
        irr: true,
        period: true,
        secLink: true
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
        setSelectedFields((prev: Record<string, boolean>) => ({ ...prev, [field]: !prev[field] }));
    };

    const handleExport = () => {
        let dataToExport = [];
        let rangeLabel = '';

        if (exportScope === 'current') {
            dataToExport = currentQuarterData;
            rangeLabel = quarterLabel;
        } else if (exportScope === 'history') {
            dataToExport = fullHistoryData;
            rangeLabel = 'Full_History';
        } else {
            // Filter history by custom range
            let startTime = new Date(customStart).getTime();
            let endTime = new Date(customEnd).getTime();

            // Swap if needed
            if (startTime > endTime) {
                [startTime, endTime] = [endTime, startTime];
            }

            dataToExport = fullHistoryData.filter(item => {
                const itemTime = new Date(item.period_of_report).getTime();
                return itemTime >= startTime && itemTime <= endTime;
            });

            const actualStart = customStart < customEnd ? customStart : customEnd;
            const actualEnd = customStart < customEnd ? customEnd : customStart;
            rangeLabel = `Range_${formatQuarterLabel(actualStart)}_to_${formatQuarterLabel(actualEnd)}`;
        }

        // Define all possible columns and their headers
        const columnDefinitions = [
            { key: 'period_of_report', header: 'Period', field: 'period' },
            { key: 'ticker', header: 'Ticker', field: 'ticker' },
            { key: 'issuer_name', header: 'Company Name', field: 'name' },
            { key: 'cusip', header: 'CUSIP', field: 'cusip' },
            { key: 'shares', header: 'Shares', field: 'shares' },
            { key: 'value', header: 'Value ($)', field: 'value' },
            { key: 'percent', header: 'Portfolio Weight %', field: 'percent' },
            { key: 'deltaShares', header: 'Share Change', field: 'deltaShares' },
            { key: 'deltaValue', header: 'Value Change ($)', field: 'deltaValue' },
            { key: 'percent_delta', header: 'Weight Change %', field: 'percentDelta' },
            { key: 'price_delta', header: 'Price Change %', field: 'priceDelta' },
            { key: 'cap_allocation', header: 'Cap Allocation', field: 'capAllocation' },
            { key: 'roi', header: 'ROI %', field: 'roi' },
            { key: 'irr', header: 'IRR % (Ann.)', field: 'irr' },
            { key: 'sec_link', header: 'SEC Filing Link', field: 'secLink' }
        ];

        const activeColumns = columnDefinitions.filter(col => selectedFields[col.field]);

        // Create CSV Header
        const headerRow = activeColumns.map(col => `"${col.header}"`).join(',');

        // Create CSV Rows
        const rows = dataToExport.map(item => {
            return activeColumns.map(col => {
                let val = item[col.key];

                // Handle special cases
                if (col.key === 'sec_link') {
                    if (item.cik && item.accession_number) {
                        const cleanCik = item.cik.replace(/^0+/, '');
                        const cleanAcc = item.accession_number.replace(/-/g, '');
                        const dashedAcc = item.accession_number.includes('-')
                            ? item.accession_number
                            : `${item.accession_number.slice(0, 10)}-${item.accession_number.slice(10, 12)}-${item.accession_number.slice(12)}`;
                        val = `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${cleanAcc}/${dashedAcc}-index.html`;
                    } else {
                        val = '';
                    }
                }

                // Format values for CSV
                if (val === undefined || val === null || val === '') return '""';

                // Special handling for percentages and formatting
                if (typeof val === 'number') {
                    if (col.field === 'percent' || col.field === 'percentDelta' || col.field === 'priceDelta' || col.field === 'roi' || col.field === 'irr') {
                        return val.toFixed(2);
                    }
                    if (col.field === 'value' || col.field === 'deltaValue' || col.field === 'capAllocation') {
                        return val.toFixed(0);
                    }
                    return val.toString();
                }

                if (col.field === 'cusip') {
                    // Force CUSIP to be treated as text in Excel (prevents scientific notation)
                    return `="${val}"`;
                }

                if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
                return val;
            }).join(',');
        });

        const csvContent = [headerRow, ...rows].join('\n');
        // Add UTF-8 BOM to ensure Excel reads special characters or standard UTF-8 correctly
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        const fileName = `${fundName.replace(/[^a-z0-9]/gi, '_')}_${rangeLabel}.csv`;

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
                        <h2>Export Portfolio</h2>
                        <p className="subtitle">{fundName}</p>
                    </div>
                    <button className="csv-modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="csv-modal-content">
                    <div className="section">
                        <h3>1. Select Export Scope</h3>
                        <div className="scope-options">
                            <div
                                className={`scope-card ${exportScope === 'current' ? 'active' : ''}`}
                                onClick={() => setExportScope('current')}
                            >
                                <div className="scope-radio">
                                    {exportScope === 'current' && <Check size={12} />}
                                </div>
                                <div className="scope-info">
                                    <span className="scope-title">Current</span>
                                    <span className="scope-desc">{quarterLabel}</span>
                                </div>
                            </div>
                            <div
                                className={`scope-card ${exportScope === 'history' ? 'active' : ''}`}
                                onClick={() => setExportScope('history')}
                            >
                                <div className="scope-radio">
                                    {exportScope === 'history' && <Check size={12} />}
                                </div>
                                <div className="scope-info">
                                    <span className="scope-title">History</span>
                                    <span className="scope-desc">All filings</span>
                                </div>
                            </div>
                            <div
                                className={`scope-card ${exportScope === 'custom' ? 'active' : ''}`}
                                onClick={() => setExportScope('custom')}
                            >
                                <div className="scope-radio">
                                    {exportScope === 'custom' && <Check size={12} />}
                                </div>
                                <div className="scope-info">
                                    <span className="scope-title">Custom</span>
                                    <span className="scope-desc">Range</span>
                                </div>
                            </div>
                        </div>

                        {exportScope === 'custom' && (
                            <div className="custom-range-selectors">
                                <div className="range-select-group">
                                    <label>Start Quarter</label>
                                    <div className="custom-dropdown-container">
                                        <div
                                            className={`range-select-trigger ${showStartDropdown ? 'open' : ''}`}
                                            onClick={() => {
                                                setShowStartDropdown(!showStartDropdown);
                                                setShowEndDropdown(false);
                                            }}
                                        >
                                            <span>{formatQuarterLabel(customStart)}</span>
                                            <ChevronDown size={14} />
                                        </div>
                                        {showStartDropdown && (
                                            <div className="quarter-dropdown range-dropdown-menu">
                                                {availableQuarters.map(q => (
                                                    <div
                                                        key={q}
                                                        className={`range-dropdown-item ${customStart === q ? 'active' : ''}`}
                                                        onClick={() => {
                                                            setCustomStart(q);
                                                            setShowStartDropdown(false);
                                                        }}
                                                    >
                                                        {formatQuarterLabel(q)}
                                                        {customStart === q && <Check size={12} />}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="range-select-group">
                                    <label>End Quarter</label>
                                    <div className="custom-dropdown-container">
                                        <div
                                            className={`range-select-trigger ${showEndDropdown ? 'open' : ''}`}
                                            onClick={() => {
                                                setShowEndDropdown(!showEndDropdown);
                                                setShowStartDropdown(false);
                                            }}
                                        >
                                            <span>{formatQuarterLabel(customEnd)}</span>
                                            <ChevronDown size={14} />
                                        </div>
                                        {showEndDropdown && (
                                            <div className="quarter-dropdown range-dropdown-menu">
                                                {availableQuarters.map(q => (
                                                    <div
                                                        key={q}
                                                        className={`range-dropdown-item ${customEnd === q ? 'active' : ''}`}
                                                        onClick={() => {
                                                            setCustomEnd(q);
                                                            setShowEndDropdown(false);
                                                        }}
                                                    >
                                                        {formatQuarterLabel(q)}
                                                        {customEnd === q && <Check size={12} />}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="section">
                        <h3>2. Customize Fields</h3>
                        <div className="fields-grid">
                            {Object.keys(selectedFields).map(field => {
                                const labels: Record<string, string> = {
                                    ticker: 'Ticker',
                                    name: 'Name',
                                    cusip: 'CUSIP',
                                    shares: 'Shares',
                                    value: 'Value',
                                    percent: 'Portfolio %',
                                    deltaShares: 'Delta Shares',
                                    deltaValue: 'Delta Value',
                                    percentDelta: 'Percent Delta',
                                    priceDelta: 'Price Delta',
                                    capAllocation: 'Cap Allocation',
                                    roi: 'ROI',
                                    irr: 'IRR',
                                    period: 'Period',
                                    secLink: 'SEC Link'
                                };
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

