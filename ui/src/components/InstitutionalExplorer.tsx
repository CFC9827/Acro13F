import React, { useState, useEffect } from 'react';
import { Search, Filter, Database, TrendingUp, Info, ArrowRight, Check, Plus, Loader2 } from 'lucide-react';
import { formatCurrency } from './PortfolioChart';

interface InstitutionalExplorerProps {
    onFollow: (cik: string) => void;
}

export function InstitutionalExplorer({ onFollow }: InstitutionalExplorerProps) {
    return (
        <div className="flex flex-col h-full overflow-hidden p-6 gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Institutional Explorer</h2>
                    <p className="text-gray-400 mt-1">Screen the Top 2,000 "Whales" using multi-factor range filters.</p>
                </div>
            </div>
            
            <div className="bg-[#1a1d23] border border-gray-800 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-4">
                <div className="bg-blue-600/20 p-4 rounded-full">
                    <Database size={48} className="text-blue-500" />
                </div>
                <h3 className="text-xl font-semibold text-white">Scaffolding Ready</h3>
                <p className="text-gray-400 max-w-md">
                    The Institutional Explorer is being built. Phase 4 (Scaffolding) is complete. 
                    In Phase 5, we will implement the dynamic filter builder and results grid.
                </p>
            </div>
        </div>
    );
}
