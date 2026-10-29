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
import { applyLanguage } from '../i18n';

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
      .then((u) => {
        setUser(u);
        applyLanguage(u.language);
      })
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
    applyLanguage(u.language);
  }, []);
  const signOut = useCallback(() => {
    auth.token = null;
    setUser(null);
  }, []);
  // Switch the UI immediately; persist in the background and fall back if saving fails.
  const setLanguage = useCallback(async (language: Language) => {
    await applyLanguage(language);
    setUser((u) => (u ? { ...u, language } : u));
    try {
      await api.updateMe({ language });
    } catch {
      /* the choice still applies for this session and is remembered locally */
    }
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
