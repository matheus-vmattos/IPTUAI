import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import Login from './pages/Login.jsx';
import Upload from './pages/Upload.jsx';
import Consulta from './pages/Consulta.jsx';
import Config from './pages/Config.jsx';

function Shell({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">IPTUAI</span>
        <nav>
          <NavLink to="/upload">Lançar IPTU</NavLink>
          <NavLink to="/consulta">Consultar</NavLink>
          <NavLink to="/config">Configurações</NavLink>
        </nav>
        <div className="userbox">
          <span>{user?.name}</span>
          <button onClick={logout}>Sair</button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function PrivateRoute({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="loading">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

function Root() {
  const { restore } = useAuth();
  useEffect(() => {
    restore();
  }, [restore]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/upload"
        element={
          <PrivateRoute>
            <Upload />
          </PrivateRoute>
        }
      />
      <Route
        path="/consulta"
        element={
          <PrivateRoute>
            <Consulta />
          </PrivateRoute>
        }
      />
      <Route
        path="/config"
        element={
          <PrivateRoute>
            <Config />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/upload" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Root />
      </HashRouter>
    </AuthProvider>
  );
}
