"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import {
  clearLocalData,
  hydrateFromSupabase,
  setSyncUser,
} from "@/lib/store";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string) => Promise<{ error: string | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sb) {
      setLoading(false);
      return;
    }
    let mounted = true;

    sb.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) {
        setSyncUser(u.id);
        void hydrateFromSupabase(u.id);
      }
      setLoading(false);
    });

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setLoading(false);
      if (event === "SIGNED_IN" && u) {
        setSyncUser(u.id);
        void hydrateFromSupabase(u.id);
      }
      if (event === "SIGNED_OUT") {
        clearLocalData();
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  const signIn = useCallback(
    async (email: string) => {
      if (!sb) return { error: "Configuration Supabase manquante." };
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      return { error: error ? error.message : null };
    },
    [sb],
  );

  const verifyOtp = useCallback(
    async (email: string, token: string) => {
      if (!sb) return { error: "Configuration Supabase manquante." };
      const { error } = await sb.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: "email",
      });
      return { error: error ? error.message : null };
    },
    [sb],
  );

  const signInWithGoogle = useCallback(async () => {
    if (!sb) return { error: "Configuration Supabase manquante." };
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    return { error: error ? error.message : null };
  }, [sb]);

  const signOut = useCallback(async () => {
    if (sb) await sb.auth.signOut();
    clearLocalData();
    setUser(null);
  }, [sb]);

  return (
    <AuthContext.Provider
      value={{ user, loading, configured: Boolean(sb), signIn, verifyOtp, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
