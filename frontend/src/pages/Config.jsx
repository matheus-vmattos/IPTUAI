import { useState } from 'react';
import { api, getBackendUrl, setBackendUrl, apiErrorMessage } from '../api.js';

export default function Config() {
  const [backendUrl, setBackendUrlLocal] = useState(getBackendUrl());
  const [savedMsg, setSavedMsg] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userMsg, setUserMsg] = useState('');
  const [userErr, setUserErr] = useState('');

  function saveBackendUrl(e) {
    e.preventDefault();
    setBackendUrl(backendUrl);
    setSavedMsg('Servidor salvo.');
    setTimeout(() => setSavedMsg(''), 3000);
  }

  async function createUser(e) {
    e.preventDefault();
    setUserErr('');
    setUserMsg('');
    try {
      await api.post('/auth/users', { name, email, password });
      setUserMsg(`Usuário ${email} criado com sucesso.`);
      setName('');
      setEmail('');
      setPassword('');
    } catch (err) {
      setUserErr(apiErrorMessage(err));
    }
  }

  return (
    <div className="page">
      <h2>Configurações</h2>

      <section className="card">
        <h3>Servidor</h3>
        <form onSubmit={saveBackendUrl} className="inline-form">
          <input value={backendUrl} onChange={(e) => setBackendUrlLocal(e.target.value)} />
          <button type="submit">Salvar</button>
        </form>
        {savedMsg && <div className="success">{savedMsg}</div>}
      </section>

      <section className="card">
        <h3>Novo usuário da equipe</h3>
        <form onSubmit={createUser} className="stack-form">
          <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Senha (mín. 6 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Criar usuário</button>
        </form>
        {userMsg && <div className="success">{userMsg}</div>}
        {userErr && <div className="error">{userErr}</div>}
      </section>
    </div>
  );
}
