import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { getBackendUrl, setBackendUrl } from '../api.js';

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [backendUrl, setBackendUrlLocal] = useState(getBackendUrl());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/upload" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setBackendUrl(backendUrl);
    const result = await login(email, password);
    setLoading(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>IPTUAI</h1>
        <p className="subtitle">Assistente de lançamento de IPTU</p>

        <label>
          Servidor
          <input
            type="text"
            value={backendUrl}
            onChange={(e) => setBackendUrlLocal(e.target.value)}
            placeholder="http://endereco-do-servidor:4000"
          />
        </label>

        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>

        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
