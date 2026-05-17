import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./AuthContext";

const GUEST_ID_KEY      = "@phormula_guest_id";
const GUEST_NAME_KEY    = "@phormula_guest_name";
const GUEST_CREDITS_KEY = "@phormula_guest_credits";

// Cota padrão — mesmo valor do servidor (3.0 créditos fracionários)
export const GUEST_QUOTA_CREDITS = 3.0;

function generateUUID(): string {
  const s4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  return `${s4()}${s4()}-${s4()}-4${s4().slice(1)}-${["8", "9", "a", "b"][Math.floor(Math.random() * 4)]}${s4().slice(1)}-${s4()}${s4()}${s4()}`;
}

type GuestContextType = {
  guestId: string | null;
  /** Créditos restantes (float). Cota inicial = GUEST_QUOTA_CREDITS. */
  guestCredits: number;
  guestName: string | null;
  isGuest: boolean;
  setGuestCredits: (credits: number) => void;
  setGuestName: (name: string) => void;
  showAuthSheet: boolean;
  setShowAuthSheet: (v: boolean) => void;
};

const GuestContext = createContext<GuestContextType>({
  guestId: null,
  guestCredits: GUEST_QUOTA_CREDITS,
  guestName: null,
  isGuest: false,
  setGuestCredits: () => {},
  setGuestName: () => {},
  showAuthSheet: false,
  setShowAuthSheet: () => {},
});

export function GuestProvider({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const [guestId, setGuestId]               = useState<string | null>(null);
  const [guestCredits, setGuestCreditsState] = useState(GUEST_QUOTA_CREDITS);
  const [guestName, setGuestNameState]       = useState<string | null>(null);
  const [showAuthSheet, setShowAuthSheet]    = useState(false);

  const isGuest = !session && !loading;

  useEffect(() => {
    if (session || loading) return;

    (async () => {
      try {
        let id = await AsyncStorage.getItem(GUEST_ID_KEY);
        if (!id) {
          id = generateUUID();
          await AsyncStorage.setItem(GUEST_ID_KEY, id);
        }
        setGuestId(id);

        const storedName = await AsyncStorage.getItem(GUEST_NAME_KEY);
        if (storedName) setGuestNameState(storedName);

        const API_BASE = process.env.EXPO_PUBLIC_API_URL
          ? process.env.EXPO_PUBLIC_API_URL
          : `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

        const res = await fetch(`${API_BASE}/guest/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestId: id }),
        });

        if (res.ok) {
          const data = await res.json();
          // Servidor retorna créditos restantes como float
          const credits = typeof data.credits === "number"
            ? data.credits
            : GUEST_QUOTA_CREDITS;
          setGuestCreditsState(credits);
          await AsyncStorage.setItem(GUEST_CREDITS_KEY, String(credits));
        } else {
          // Fallback para cache local
          const cached = await AsyncStorage.getItem(GUEST_CREDITS_KEY);
          if (cached !== null) setGuestCreditsState(parseFloat(cached));
        }
      } catch {
        // Sem rede — usa cache local
        const cachedId = await AsyncStorage.getItem(GUEST_ID_KEY);
        if (cachedId) setGuestId(cachedId);
        const cached = await AsyncStorage.getItem(GUEST_CREDITS_KEY);
        if (cached !== null) setGuestCreditsState(parseFloat(cached));
        const storedName = await AsyncStorage.getItem(GUEST_NAME_KEY);
        if (storedName) setGuestNameState(storedName);
      }
    })();
  }, [session, loading]);

  const setGuestCredits = useCallback(async (credits: number) => {
    setGuestCreditsState(credits);
    await AsyncStorage.setItem(GUEST_CREDITS_KEY, String(credits));
  }, []);

  const setGuestName = useCallback(async (name: string) => {
    setGuestNameState(name);
    await AsyncStorage.setItem(GUEST_NAME_KEY, name);
  }, []);

  return (
    <GuestContext.Provider
      value={{
        guestId,
        guestCredits,
        guestName,
        isGuest,
        setGuestCredits,
        setGuestName,
        showAuthSheet,
        setShowAuthSheet,
      }}
    >
      {children}
    </GuestContext.Provider>
  );
}

export function useGuest() {
  return useContext(GuestContext);
}
