import { useTranslation } from 'react-i18next';
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import type { Language } from './api';
import { useAuth } from './components/AuthContext';
import Admin from './pages/Admin';
import DiffView from './pages/DiffView';
import Login from './pages/Login';
import Project from './pages/Project';
import Projects from './pages/Projects';
import Templates from './pages/Templates';
import VersionViewer from './pages/VersionViewer';
import Viewer from './pages/Viewer';
import ParticipantPortal from './pages/ParticipantPortal';

function Shell() {
  const { t } = useTranslation();
  const { user, loading, signOut, setLanguage } = useAuth();
  if (loading) return <div className="page muted">{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'participant') return <Navigate to="/participant" replace />;
  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            §
          </span>
          {t('common.appName')}
        </NavLink>
        <nav>
          <NavLink to="/" end>
            {t('nav.projects')}
          </NavLink>
          <NavLink to="/templates">{t('nav.templates')}</NavLink>
        </nav>
        <NavLink to="/admin" className="nav-admin">
          {t('nav.admin')}
        </NavLink>
        <div className="topbar-user">
          <select
            aria-label={t('nav.language')}
            className="lang-select"
            value={user.language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            <option value="en">EN</option>
            <option value="nl">NL</option>
            <option value="fr">FR</option>
          </select>
          <span className="user-name">{user.name}</span>
          <button type="button" className="btn ghost" onClick={signOut}>
            {t('auth.signOut')}
          </button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}

export default function App() {
  const { t } = useTranslation();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/participant" element={<ParticipantPortal />} />
      <Route path="/participant/invite/:token" element={<ParticipantPortal />} />
      <Route element={<Shell />}>
        <Route path="/" element={<Projects />} />
        <Route path="/projects/:id" element={<Project />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/templates/:id" element={<Viewer />} />
        <Route path="/versions/:vid" element={<VersionViewer />} />
        <Route path="/diff" element={<DiffView />} />
        <Route
          path="*"
          element={<div className="empty">{t('common.pageNotFound')}</div>}
        />
      </Route>
    </Routes>
  );
}
