import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const authEnvConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const devAuthEnabled = !import.meta.env.PROD && !authEnvConfigured;
const authConfigError = import.meta.env.PROD && !authEnvConfigured;

export const supabase = devAuthEnabled
    ? null
    : authEnvConfigured
        ? createClient(supabaseUrl, supabaseAnonKey)
        : null;

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    devAuthEnabled: boolean;
    authConfigError: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authConfigError) {
            setUser(null);
            setSession(null);
            setLoading(false);
            return;
        }

        if (devAuthEnabled) {
            setUser({
                id: '00000000-0000-0000-0000-000000000000',
                email: 'dev@abrams13f.local',
                app_metadata: {},
                user_metadata: {},
                aud: 'authenticated',
                created_at: new Date().toISOString(),
            } as User);
            setSession(null);
            setLoading(false);
            return;
        }

        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        }).catch(err => {
            console.error("AuthContext: Error getting session:", err);
            setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const signOut = async () => {
        if (!supabase) {
            return;
        }

        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, devAuthEnabled, authConfigError, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
