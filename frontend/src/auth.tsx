import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearSession, type SessionUser } from "./api";

type AuthValue = {
  user: SessionUser | null;
  ready: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  async function refresh() {
    if (!localStorage.getItem("access")) {
      setUser(null);
      return;
    }
    const session = await api<SessionUser>("/auth/session");
    setUser(session);
  }

  useEffect(() => {
    refresh()
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  function logout() {
    const refreshToken = localStorage.getItem("refresh");
    if (refreshToken) api("/auth/logout", "POST", { refresh_token: refreshToken }).catch(() => undefined);
    clearSession();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, ready, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("auth");
  return value;
}
