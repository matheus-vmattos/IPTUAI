import { createContext, useContext, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { api } from './api.js';
import Upload from './pages/Upload.jsx';
import Consulta from './pages/Consulta.jsx';
import Proprietarios from './pages/Proprietarios.jsx';
import Painel from './pages/Painel.jsx';
import Config from './pages/Config.jsx';

// Contexto simples pra qualquer página saber se o modo somente leitura
// (Configurações) está ativo, sem cada uma ter que buscar /config sozinha
// só pra isso.
const AppConfigContext = createContext({ modoLeitura: false });
export function useModoLeitura() {
  return useContext(AppConfigContext).modoLeitura;
}

const isDemo = import.meta.env.MODE === 'demo';

function Shell({ children, modoLeitura }) {
  return (
    <div className="shell">
      {isDemo && (
        <div className="demo-banner">
          Modo demonstração — dados fictícios, só para portfólio. A versão real do IPTUAI está em uso por
          uma empresa de administração de imóveis, com dados sigilosos de clientes reais.
        </div>
      )}
      <header className="topbar">
        <span className="brand">IPTUAI</span>
        {modoLeitura && <span className="badge-leitura">MODO LEITURA</span>}
        <nav>
          {!modoLeitura && <NavLink to="/upload">Lançar</NavLink>}
          <NavLink to="/consulta">Consultar</NavLink>
          <NavLink to="/proprietarios">Proprietários</NavLink>
          <NavLink to="/painel">Painel</NavLink>
          <NavLink to="/config">Configurações</NavLink>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  const [appConfig, setAppConfig] = useState({ modoLeitura: false });

  useEffect(() => {
    api
      .get('/config')
      .then(({ data }) => setAppConfig(data))
      .catch(() => {});
  }, []);

  return (
    <AppConfigContext.Provider value={appConfig}>
      <HashRouter>
        <Shell modoLeitura={appConfig.modoLeitura}>
          <Routes>
            <Route path="/upload" element={appConfig.modoLeitura ? <Navigate to="/consulta" replace /> : <Upload />} />
            <Route path="/consulta" element={<Consulta />} />
            <Route path="/proprietarios" element={<Proprietarios />} />
            <Route path="/painel" element={<Painel />} />
            <Route path="/config" element={<Config />} />
            <Route path="*" element={<Navigate to={appConfig.modoLeitura ? '/consulta' : '/upload'} replace />} />
          </Routes>
        </Shell>
      </HashRouter>
    </AppConfigContext.Provider>
  );
}
