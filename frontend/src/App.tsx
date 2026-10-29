import { NavLink, Route, Routes } from 'react-router-dom';
import Library from './pages/Library';
import Studio from './pages/Studio';
import Viewer from './pages/Viewer';

export default function App() {
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
            Library
          </NavLink>
          <NavLink to="/studio">Studio</NavLink>
        </nav>
        <span className="topbar-sub">BSPHO · informed consent forms</span>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/documents/:id" element={<Viewer />} />
          <Route path="/studio" element={<Studio />} />
          <Route
            path="*"
            element={<div className="empty">Page not found.</div>}
          />
        </Routes>
      </main>
    </>
  );
}
