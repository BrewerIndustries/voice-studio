import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User } from './api';
import { clearDrafts } from './draft';

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<AuthState>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Signed out (e.g. session expired): drop any drafts left on this browser.
    api.me().then(setUser).catch(() => { clearDrafts(); setUser(null); }).finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => setUser(await api.login(email, password));
  const logout = async () => {
    clearDrafts();
    await api.logout().catch(() => {});
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
