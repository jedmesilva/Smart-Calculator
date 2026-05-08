import React, { createContext, useContext, useEffect, useState } from "react";
import { Alert } from "react-native";
import { authStorage } from "@/lib/supabase";

const API_BASE = process.env.EXPO_PUBLIC_API_URL
  ? process.env.EXPO_PUBLIC_API_URL
  : `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

type AuthUser = {
  id: string;
  email?: string;
};

type AuthContextType = {
  session: { user: AuthUser } | null;
  user: AuthUser | null;
  userId: string | null;
  loading: boolean;
  userName: string | null;
  setUserName: (name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  userId: null,
  loading: true,
  userName: null,
  setUserName: async () => {},
  signIn: async () => ({}),
  signUp: async () => ({}),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<{ user: AuthUser } | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserNameState] = useState<string | null>(null);

  useEffect(() => {
    authStorage.getToken().then(async (token) => {
      if (token) {
        try {
          const res = await fetch(`${API_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setSession({ user: { id: data.id } });
            if (data.full_name) setUserNameState(data.full_name);
          } else {
            await authStorage.clearToken();
          }
        } catch {
          await authStorage.clearToken();
        }
      }
      setLoading(false);
    });
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error ?? "Erro ao entrar." };
      await authStorage.setToken(data.token);
      setSession({ user: { id: data.user_id } });
      return {};
    } catch {
      return { error: "Erro de conexão. Verifique sua internet." };
    }
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error ?? "Erro ao criar conta." };
      await authStorage.setToken(data.token);
      setSession({ user: { id: data.user_id } });
      if (fullName) setUserNameState(fullName);
      return {};
    } catch {
      return { error: "Erro de conexão. Verifique sua internet." };
    }
  };

  const setUserName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !session?.user) return;
    setUserNameState(trimmed);
    const token = await authStorage.getToken();
    if (token) {
      await fetch(`${API_BASE}/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ full_name: trimmed }),
      });
    }
  };

  const signOut = async () => {
    Alert.alert("Sair", "Deseja encerrar sua sessão?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          const token = await authStorage.getToken();
          if (token) {
            fetch(`${API_BASE}/auth/logout`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
          }
          await authStorage.clearToken();
          setSession(null);
          setUserNameState(null);
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
        signIn,
        signUp,
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
