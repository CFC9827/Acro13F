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
        if (!name || !email) {
            setError("Please provide both name and email.");
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const userAgent = `${name} (${email})`;
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sec_user_agent: userAgent })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "Failed to save configuration");
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
                <div className="onboarding-step-indicator">
                    <div className={`step-dot ${step >= 1 ? 'active' : ''}`} />
                    <div className={`step-dot ${step >= 2 ? 'active' : ''}`} />
                </div>

                {step === 1 ? (
                    <div className="onboarding-content">
                        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#f8fafc', marginBottom: '16px' }}>
                                Welcome to <span style={{ color: '#3b82f6' }}>Institutional Analytics</span>
                            </h1>
                            <p style={{ color: '#94a3b8', lineHeight: 1.6 }}>
                                You're about to unlock professional-grade insights into hedge fund positioning and institutional alpha.
                            </p>
                        </div>

                        <div style={{ display: 'grid', gap: '16px', marginBottom: '32px' }}>
                            {[
                                { icon: <Search size={18} />, title: "Track Any Fund", text: "Sync 10 years of history for any manager with a 13F filing." },
                                { icon: <TrendingUp size={18} />, title: "Isolate Alpha", text: "See real transaction flows hidden within raw SEC metadata." },
                                { icon: <Clock size={18} />, title: "Temporal Accuracy", text: "PnL models that account for reporting lags and splits." }
                            ].map((item, i) => (
                                <div key={i} style={{ display: 'flex', gap: '16px', background: 'rgba(30, 41, 59, 0.4)', padding: '16px', borderRadius: '12px' }}>
                                    <div style={{ color: '#3b82f6' }}>{item.icon}</div>
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '14px', marginBottom: '2px' }}>{item.title}</div>
                                        <div style={{ fontSize: '13px', color: '#94a3b8' }}>{item.text}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button className="onboarding-button" onClick={() => setStep(2)}>
                            Next: Configure SEC Access
                        </button>
                    </div>
                ) : (
                    <div className="onboarding-content">
                        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#f8fafc', marginBottom: '16px' }}>
                                SEC <span style={{ color: '#3b82f6' }}>Edgar Access</span>
                            </h1>
                            <p style={{ color: '#94a3b8', lineHeight: 1.6, fontSize: '14px' }}>
                                SEC rules require all requests to be identified with a User-Agent containing your name and email.
                            </p>
                        </div>

                        <div style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.1)', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: '#60a5fa', marginBottom: '8px' }}>
                                <ShieldCheck size={16} />
                                <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase' }}>Why is this required?</span>
                            </div>
                            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                                Identifying your requests prevents your IP from being blocked. Your info is stored locally and sent only to SEC.gov.
                                <a href="https://www.sec.gov/edgar/searchedgar/accessing-edgar-data.htm" target="_blank" rel="noopener noreferrer" className="onboarding-link" style={{ marginLeft: '4px' }}>
                                    Read SEC Rules <ExternalLink size={10} style={{ display: 'inline', marginLeft: '2px' }} />
                                </a>
                            </p>
                        </div>

                        <div className="onboarding-input-group">
                            <label>Full Name</label>
                            <div style={{ position: 'relative' }}>
                                <User style={{ position: 'absolute', left: '14px', top: '14px', color: '#475569' }} size={16} />
                                <input
                                    className="onboarding-input"
                                    style={{ paddingLeft: '44px' }}
                                    placeholder="e.g. John Doe"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="onboarding-input-group">
                            <label>Valid Email</label>
                            <div style={{ position: 'relative' }}>
                                <Mail style={{ position: 'absolute', left: '14px', top: '14px', color: '#475569' }} size={16} />
                                <input
                                    className="onboarding-input"
                                    style={{ paddingLeft: '44px' }}
                                    placeholder="e.g. john@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        {error && (
                            <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '16px', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '8px' }}>
                                {error}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="onboarding-button" style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', width: '30%' }} onClick={() => setStep(1)} disabled={saving}>
                                Back
                            </button>
                            <button className="onboarding-button" onClick={handleSave} disabled={saving || !name || !email}>
                                {saving ? "Saving..." : "Start Exploring"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
