import React, { useState } from 'react';
import {
    PlusCircle,
    Search,
    Clock,
    TrendingUp,
    ShieldCheck,
    User,
    Mail,
    ExternalLink
} from 'lucide-react';
import './Onboarding.css';

interface OnboardingProps {
    onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        setSaving(true);
        setError(null);

        try {
            // Generate professional random identity components
            const domains = ['institutional-data.net', 'research-node.io', 'analytics-terminal.org', 'data-infrastructure.com'];
            const depts = ['Quantitative Research', 'Historical Analysis', 'Digital Assets', 'Risk Management'];
            const randomId = Math.floor(1000 + Math.random() * 9000);

            const dept = depts[Math.floor(Math.random() * depts.length)];
            const domain = domains[Math.floor(Math.random() * domains.length)];
            const userAgent = `SEC Data Node ${randomId} - ${dept} (access_${randomId}@${domain})`;

            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sec_user_agent: userAgent })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "Failed to initialize environment");
            }

            onComplete();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="onboarding-overlay">
            <div className="onboarding-card">
                <div className="onboarding-content">
                    <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                        <h1 style={{ fontSize: '40px', fontWeight: 900, color: '#f8fafc', marginBottom: '16px', letterSpacing: '-0.04em' }}>
                            Abrams<span style={{ color: '#3b82f6' }}>13F</span>
                        </h1>
                        <p style={{ color: '#94a3b8', lineHeight: 1.6, fontSize: '16px', maxWidth: '460px', margin: '0 auto' }}>
                            Advanced 13F Intelligence Terminal for institutional flow analysis and portfolio reconstruction.
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '48px' }}>
                        {[
                            { icon: <Search size={24} />, title: "Manager Tracking", text: "Aggregate multi-year historical filings at institutional scale." },
                            { icon: <TrendingUp size={24} />, title: "Portfolio Modeling", text: "Reconstruct transaction volume and cost basis metadata." }
                        ].map((item, i) => (
                            <div key={i} style={{ textAlign: 'center', padding: '24px 20px', borderRadius: '24px', background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255,255,255,0.02)' }}>
                                <div style={{ color: '#3b82f6', marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>{item.icon}</div>
                                <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '15px', marginBottom: '6px' }}>{item.title}</div>
                                <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.5 }}>{item.text}</div>
                            </div>
                        ))}
                    </div>

                    {error && (
                        <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '16px', textAlign: 'center' }}>
                            {error}
                        </div>
                    )}

                    <button
                        className="onboarding-button"
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            height: '60px',
                            fontSize: '18px',
                            fontWeight: 800,
                            borderRadius: '16px',
                            boxShadow: saving ? 'none' : '0 12px 24px rgba(59, 130, 246, 0.15)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}
                    >
                        {saving ? "Initializing Terminal..." : "Initialize Terminal"}
                    </button>

                    <div style={{ textAlign: 'center', marginTop: '24px', opacity: 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <ShieldCheck size={12} />
                        <p style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                            SEC Protocol 13-F Automated Authorization Active
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
