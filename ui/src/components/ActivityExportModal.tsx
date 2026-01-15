import React, { useState } from 'react';
import { X, Download, FileSpreadsheet, Check, ChevronDown } from 'lucide-react';

interface ActivityItem {
    period: string;
    ticker: string;
    issuer_name: string;
    activityType: 'Buy' | 'Sell' | 'Add' | 'Reduce';
    activityPercent: number;
    shareChange: number;
    valueTraded: number;
    portfolioImpact: number;
    conviction?: 'building' | 'exiting' | null;
    consecutiveQuarters?: number;
}

interface ActivityExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    activityData: ActivityItem[];
    availableQuarters: string[];
    fundName: string;
}

export const ActivityExportModal: React.FC<ActivityExportModalProps> = ({
    isOpen,
    onClose,
    activityData,
    availableQuarters,
    fundName
}) => {
    const [exportScope, setExportScope] = useState<'current' | 'history' | 'custom'>('current');
    const [customStart, setCustomStart] = useState<string>(availableQuarters[availableQuarters.length - 1] || '');
    const [customEnd, setCustomEnd] = useState<string>(availableQuarters[0] || '');
    const [showStartDropdown, setShowStartDropdown] = useState(false);
    const [showEndDropdown, setShowEndDropdown] = useState(false);

    const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({
        quarter: true,
        ticker: true,
        name: true,
        activity: true,
        changePercent: true,
        shareChange: true,
        valueTraded: true,
        portfolioPercent: true,
        conviction: true
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
        let dataToExport: ActivityItem[] = [];
        let rangeLabel = '';

        const latestQuarter = availableQuarters[0] || '';

        if (exportScope === 'current') {
            dataToExport = activityData.filter(item => item.period === latestQuarter);
            rangeLabel = formatQuarterLabel(latestQuarter).replace(/[' ]/g, '');
        } else if (exportScope === 'history') {
            dataToExport = activityData;
            rangeLabel = 'Full_History';
        } else {
            // Filter by custom range
            let startTime = new Date(customStart).getTime();
            let endTime = new Date(customEnd).getTime();

            if (startTime > endTime) {
                [startTime, endTime] = [endTime, startTime];
            }

            dataToExport = activityData.filter(item => {
                const itemTime = new Date(item.period).getTime();
                return itemTime >= startTime && itemTime <= endTime;
            });

            const actualStart = customStart < customEnd ? customStart : customEnd;
            const actualEnd = customStart < customEnd ? customEnd : customStart;
            rangeLabel = `Range_${formatQuarterLabel(actualStart)}_to_${formatQuarterLabel(actualEnd)}`.replace(/[' ]/g, '');
        }

        // Define columns
        const columnDefinitions = [
            { key: 'period', header: 'Quarter', field: 'quarter', format: (item: ActivityItem) => formatQuarterLabel(item.period) },
            { key: 'ticker', header: 'Ticker', field: 'ticker', format: (item: ActivityItem) => item.ticker },
            { key: 'issuer_name', header: 'Company Name', field: 'name', format: (item: ActivityItem) => item.issuer_name },
            { key: 'activityType', header: 'Activity Type', field: 'activity', format: (item: ActivityItem) => item.activityType },
            { key: 'activityPercent', header: 'Change %', field: 'changePercent', format: (item: ActivityItem) => item.activityPercent.toFixed(2) },
            { key: 'shareChange', header: 'Share Change', field: 'shareChange', format: (item: ActivityItem) => item.shareChange.toString() },
            { key: 'valueTraded', header: 'Value Traded ($)', field: 'valueTraded', format: (item: ActivityItem) => item.valueTraded.toFixed(0) },
            { key: 'portfolioImpact', header: 'Portfolio %', field: 'portfolioPercent', format: (item: ActivityItem) => item.portfolioImpact.toFixed(2) },
            {
                key: 'conviction', header: 'Conviction Signal', field: 'conviction', format: (item: ActivityItem) =>
                    item.conviction ? `${item.conviction} (${item.consecutiveQuarters}Q)` : ''
            }
        ];

        const activeColumns = columnDefinitions.filter(col => selectedFields[col.field]);

        // Create CSV Header
        const headerRow = activeColumns.map(col => `"${col.header}"`).join(',');

        // Create CSV Rows
        const rows = dataToExport.map(item => {
            return activeColumns.map(col => {
                const val = col.format(item);
                if (val === undefined || val === null || val === '') return '""';
                if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
                return val;
            }).join(',');
        });

        const csvContent = [headerRow, ...rows].join('\n');
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        const fileName = `${fundName.replace(/[^a-z0-9]/gi, '_')}_Activity_${rangeLabel}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        onClose();
    };

    const latestQuarter = availableQuarters[0] || '';

    return (
        <div className="csv-modal-overlay" onClick={onClose}>
            <div className="csv-modal" onClick={e => e.stopPropagation()}>
                <div className="csv-modal-header">
                    <div>
                        <div className="csv-header-tag">
                            <FileSpreadsheet size={12} />
                            CSV Export
                        </div>
                        <h2>Export Activity</h2>
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
                                    <span className="scope-desc">{formatQuarterLabel(latestQuarter)}</span>
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
                                    <span className="scope-desc">All activity</span>
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
                                    quarter: 'Quarter',
                                    ticker: 'Ticker',
                                    name: 'Company Name',
                                    activity: 'Activity Type',
                                    changePercent: 'Change %',
                                    shareChange: 'Share Change',
                                    valueTraded: 'Value Traded',
                                    portfolioPercent: 'Portfolio %',
                                    conviction: 'Conviction Signal'
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
