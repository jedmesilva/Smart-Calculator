import React, { createContext, useContext, useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  userId: string | null;
  loading: boolean;
  userName: string | null;
  setUserName: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  userId: null,
  loading: true,
  userName: null,
  setUserName: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserNameState] = useState<string | null>(null);

  useEffect(() => {
    // onAuthStateChange fires immediately with INITIAL_SESSION event,
    // which includes any token refresh. This is the safest way to restore
    // a persisted session on both web and native.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          if (data?.full_name) setUserNameState(data.full_name);
        });
    } else {
      setUserNameState(null);
    }
  }, [session]);

  const setUserName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !session?.user) return;
    setUserNameState(trimmed);
    await supabase
      .from("profiles")
      .upsert({ id: session.user.id, full_name: trimmed });
  };

  const signOut = async () => {
    Alert.alert("Sair", "Deseja encerrar sua sessão?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        userId: session?.user?.id ?? null,
        loading,
        userName,
        setUserName,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
