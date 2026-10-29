import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { api, type Language } from '../api';
import { useAuth } from '../components/AuthContext';
import { errMsg } from '../components/Dialog';
import LangSwitcher from '../components/LangSwitcher';

export default function Login() {
  const { t, i18n } = useTranslation();
  const { user, signIn } = useAuth();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
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
      const r = register
        ? await api.register({
            email,
            name,
            password,
            language: i18n.language as Language,
          })
        : await api.login(email, password);
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
          <span className="brand-mark" aria-hidden="true">
            §
          </span>
          {t('common.appName')}
          <span className="login-lang">
            <LangSwitcher />
          </span>
        </div>
        <h1>{register ? t('auth.createAccount') : t('auth.signIn')}</h1>
        {register && (
          <label>
            {t('auth.name')}
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
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
            autoComplete={register ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy
            ? t('common.pleaseWait')
            : register
              ? t('auth.createAccount')
              : t('auth.signIn')}
        </button>
        {!register && <p className="muted">{t('auth.demo')}</p>}
        <button
          type="button"
          className="link"
          onClick={() => {
            setRegister(!register);
            setError('');
          }}
        >
          {register ? t('auth.haveAccount') : t('auth.newHere')}
        </button>
      </form>
    </div>
  );
}
