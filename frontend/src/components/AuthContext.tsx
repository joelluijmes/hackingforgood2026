import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, auth, type Language, LOGOUT_EVENT, type User } from '../api';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  setLanguage: (l: Language) => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!auth.token);

  useEffect(() => {
    if (!auth.token) return;
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener(LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(LOGOUT_EVENT, onLogout);
  }, []);

  const signIn = useCallback((token: string, u: User) => {
    auth.token = token;
    setUser(u);
  }, []);
  const signOut = useCallback(() => {
    auth.token = null;
    setUser(null);
  }, []);
  const setLanguage = useCallback(async (language: Language) => {
    setUser(await api.updateMe({ language }));
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, setLanguage }),
    [user, loading, signIn, signOut, setLanguage],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
