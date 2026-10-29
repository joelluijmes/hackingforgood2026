import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../components/AuthContext';
import BloomMark from '../components/BloomMark';
import { errMsg } from '../components/Dialog';
import LangSwitcher from '../components/LangSwitcher';

export default function Login() {
  const { t } = useTranslation();
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.login(email, password);
      signIn(r.token, r.user);
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="panel login-card" onSubmit={submit}>
        <div className="brand">
          <BloomMark size={30} />
          {t('common.appName')}
          <span className="login-lang">
            <LangSwitcher />
          </span>
        </div>
        <h1>{t('auth.signIn')}</h1>
        <label>
          {t('auth.email')}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          {t('auth.password')}
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? t('common.pleaseWait') : t('auth.signIn')}
        </button>
        <p className="muted">{t('auth.demo')}</p>
      </form>
    </div>
  );
}
