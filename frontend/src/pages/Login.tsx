import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, type Language } from '../api';
import { useAuth } from '../components/AuthContext';
import { errMsg } from '../components/Dialog';

export default function Login() {
  const { user, signIn } = useAuth();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = register
        ? await api.register({ email, name, password, language })
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
          ICF Studio
        </div>
        <h1>{register ? 'Create account' : 'Sign in'}</h1>
        {register && (
          <label>
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            autoComplete={register ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {register && (
          <label>
            Your language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              <option value="en">English</option>
              <option value="nl">Nederlands</option>
              <option value="fr">Français</option>
            </select>
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
        </button>
        {!register && (
          <p className="muted">Demo account: demo@bspho.be / demo1234</p>
        )}
        <button
          type="button"
          className="link"
          onClick={() => {
            setRegister(!register);
            setError('');
          }}
        >
          {register
            ? 'Have an account? Sign in'
            : 'New here? Create an account'}
        </button>
      </form>
    </div>
  );
}
