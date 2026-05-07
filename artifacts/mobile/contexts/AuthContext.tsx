import React, { createContext, useContext, useEffect, useState } from "react";
import { fetchUserProfile, getUserId, updateUserProfile } from "@/lib/apiClient";

type AuthContextType = {
  userId: string | null;
  loading: boolean;
  userName: string | null;
  setUserName: (name: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextType>({
  userId: null,
  loading: true,
  userName: null,
  setUserName: async () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserNameState] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const id = await getUserId();
        setUserId(id);
        const profile = await fetchUserProfile();
        if (profile.full_name) {
          setUserNameState(profile.full_name);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const setUserName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setUserNameState(trimmed);
    try {
      await updateUserProfile(trimmed);
    } catch {}
  };

  const signOut = () => {
  };

  return (
    <AuthContext.Provider value={{ userId, loading, userName, setUserName, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
