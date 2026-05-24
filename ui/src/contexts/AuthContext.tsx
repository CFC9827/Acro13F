import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const devAuthEnabled = !supabaseUrl || !supabaseAnonKey;

export const supabase = devAuthEnabled
    ? null
    : createClient(supabaseUrl, supabaseAnonKey);

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
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

        console.log("AuthContext: Checking active session...");
        supabase.auth.getSession().then(({ data: { session } }) => {
            console.log("AuthContext: Session received:", session ? "Active" : "None");
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        }).catch(err => {
            console.error("AuthContext: Error getting session:", err);
            setLoading(false);
        });

        console.log("AuthContext: Subscribing to auth changes...");
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            console.log("AuthContext: Auth state change:", _event, session ? "Session present" : "No session");
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const signOut = async () => {
        if (devAuthEnabled) {
            return;
        }

        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, signOut }}>
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
