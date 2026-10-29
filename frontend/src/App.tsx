import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import type { Language } from './api';
import { useAuth } from './components/AuthContext';
import DiffView from './pages/DiffView';
import Login from './pages/Login';
import Project from './pages/Project';
import Projects from './pages/Projects';
import Templates from './pages/Templates';
import VersionViewer from './pages/VersionViewer';
import Viewer from './pages/Viewer';

function Shell() {
  const { user, loading, signOut, setLanguage } = useAuth();
  if (loading) return <div className="page muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            §
          </span>
          ICF Studio
        </NavLink>
        <nav>
          <NavLink to="/" end>
            Projects
          </NavLink>
          <NavLink to="/templates">Templates</NavLink>
        </nav>
        <div className="topbar-user">
          <select
            aria-label="Your language"
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
            Sign out
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
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Shell />}>
        <Route path="/" element={<Projects />} />
        <Route path="/projects/:id" element={<Project />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/templates/:id" element={<Viewer />} />
        <Route path="/versions/:vid" element={<VersionViewer />} />
        <Route path="/diff" element={<DiffView />} />
        <Route
          path="*"
          element={<div className="empty">Page not found.</div>}
        />
      </Route>
    </Routes>
  );
}
