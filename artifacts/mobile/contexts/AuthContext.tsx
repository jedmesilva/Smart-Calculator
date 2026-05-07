import React, { createContext, useContext, useEffect, useState } from "react";
import { type Session, type User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  userName: string | null;
  setUserName: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  userName: null,
  setUserName: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserNameState] = useState<string | null>(null);

  async function fetchUserName(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();
    if (data?.full_name) {
      setUserNameState(data.full_name as string);
    }
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
      if (session?.user) {
        fetchUserName(session.user.id);
      } else {
        setUserNameState(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user) {
        fetchUserName(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const setUserName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !session?.user) return;
    setUserNameState(trimmed);
    await supabase
      .from("profiles")
      .upsert({ id: session.user.id, full_name: trimmed }, { onConflict: "id" });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUserNameState(null);
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, userName, setUserName, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
