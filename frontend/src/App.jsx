import { HashRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import Upload from './pages/Upload.jsx';
import Consulta from './pages/Consulta.jsx';
import Config from './pages/Config.jsx';

function Shell({ children }) {
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">IPTUAI</span>
        <nav>
          <NavLink to="/upload">Lançar</NavLink>
          <NavLink to="/consulta">Consultar</NavLink>
          <NavLink to="/config">Configurações</NavLink>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell>
        <Routes>
          <Route path="/upload" element={<Upload />} />
          <Route path="/consulta" element={<Consulta />} />
          <Route path="/config" element={<Config />} />
          <Route path="*" element={<Navigate to="/upload" replace />} />
        </Routes>
      </Shell>
    </HashRouter>
  );
}
