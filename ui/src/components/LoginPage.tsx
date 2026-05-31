import React, { useState } from 'react';
import { supabase, useAuth } from '../contexts/AuthContext';
import { TrendingUp, Mail, Lock, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

export const LoginPage: React.FC = () => {
    const { authConfigError } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSignUp, setIsSignUp] = useState(false);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!supabase) {
            setError('Authentication is not configured for this deployment.');
            setLoading(false);
            return;
        }

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                alert('Check your email for the confirmation link!');
            } else {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            }
        } catch (err: any) {
            setError(err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: 'radial-gradient(circle at top left, #1e293b 0%, #0f172a 100%)',
            padding: '20px'
        }}>
            <div className="glass-card" style={{
                width: '100%',
                maxWidth: '440px',
                padding: '40px',
                borderRadius: '24px',
                background: 'rgba(30, 41, 59, 0.7)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(148, 163, 184, 0.1)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '64px',
                        height: '64px',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        borderRadius: '16px',
                        marginBottom: '20px',
                        boxShadow: '0 8px 16px rgba(37, 99, 235, 0.3)'
                    }}>
                        <TrendingUp size={32} color="white" />
                    </div>
                    <h1 style={{ color: '#f8fafc', fontSize: '2rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                        Abrams13F
                    </h1>
                    <p style={{ color: '#94a3b8', marginTop: '8px', fontSize: '1.1rem' }}>
                        Institutional Portfolio Intelligence
                    </p>
                </div>

                {authConfigError ? (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '14px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: '10px',
                        color: '#fca5a5',
                        fontSize: '0.95rem',
                        lineHeight: 1.5
                    }}>
                        <AlertCircle size={18} />
                        Production auth is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.
                    </div>
                ) : (
                    <>
                    <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ position: 'relative' }}>
                        <Mail size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input
                            type="email"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '14px 16px 14px 48px',
                                background: 'rgba(15, 23, 42, 0.5)',
                                border: '1px solid rgba(148, 163, 184, 0.2)',
                                borderRadius: '12px',
                                color: 'white',
                                fontSize: '1rem',
                                transition: 'all 0.2s'
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)'}
                        />
                    </div>

                    <div style={{ position: 'relative' }}>
                        <Lock size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '14px 16px 14px 48px',
                                background: 'rgba(15, 23, 42, 0.5)',
                                border: '1px solid rgba(148, 163, 184, 0.2)',
                                borderRadius: '12px',
                                color: 'white',
                                fontSize: '1rem',
                                transition: 'all 0.2s'
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)'}
                        />
                    </div>

                    {error && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '12px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '10px',
                            color: '#f87171',
                            fontSize: '0.9rem'
                        }}>
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '14px',
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontSize: '1.1rem',
                            fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            transition: 'all 0.2s',
                            marginTop: '10px'
                        }}
                        onMouseOver={(e) => !loading && (e.currentTarget.style.transform = 'translateY(-2px)')}
                        onMouseOut={(e) => !loading && (e.currentTarget.style.transform = 'translateY(0)')}
                    >
                        {loading ? <Loader2 className="spin" size={20} /> : (
                            <>
                                {isSignUp ? 'Create Account' : 'Sign In'}
                                <ArrowRight size={20} />
                            </>
                        )}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '32px' }}>
                    <button
                        onClick={() => setIsSignUp(!isSignUp)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#60a5fa',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            fontWeight: 500
                        }}
                    >
                        {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                    </button>
                </div>
                    </>
                )}
            </div>
        </div>
    );
};
