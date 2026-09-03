import { useState } from 'react';
import { api, apiErrorMessage } from '../api.js';

function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Proprietarios() {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function buscar(e) {
    e?.preventDefault();
    if (!busca.trim()) return;
    setError('');
    setLoading(true);
    setResumo(null);
    try {
      const { data } = await api.get('/proprietarios', { params: { q: busca.trim() } });
      setResultados(data);
      if (data.length === 1) abrirProprietario(data[0].proprietario);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function abrirProprietario(nome) {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.get(`/proprietarios/${encodeURIComponent(nome)}`);
      setResumo(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h2>Painel do proprietário</h2>

      <form className="inline-form" onSubmit={buscar}>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do proprietário..." />
        <button type="submit" disabled={loading}>
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {resultados.length > 1 && !resumo && (
        <div className="card">
          <h4>{resultados.length} resultado(s)</h4>
          <ul className="resumo-list">
            {resultados.map((r) => (
              <li key={r.proprietario}>
                <button className="choice-item" onClick={() => abrirProprietario(r.proprietario)}>
                  <strong>{r.proprietario}</strong> — {r.totalImoveis} imóve{r.totalImoveis === 1 ? 'l' : 'is'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resumo && (
        <div className="resultado">
          <h3>{resumo.proprietario}</h3>

          <div className="card destaque">
            <h4>Resumo</h4>
            <ul className="resumo-list">
              <li>
                <strong>{resumo.totalImoveis}</strong> imóve{resumo.totalImoveis === 1 ? 'l' : 'is'}
              </li>
              <li>Valor total (cota única): {formatarMoeda(resumo.valorCotaUnicaTotal)}</li>
              <li>Valor total (parcelado): {formatarMoeda(resumo.valorParceladoTotal)}</li>
            </ul>
          </div>

          <div className="card">
            <h4>Quem paga o IPTU</h4>
            <ul className="resumo-list">
              {Object.entries(resumo.quemPagaIptu).map(([quem, qtd]) => (
                <li key={quem}>
                  {quem}: <strong>{qtd}</strong>
                </li>
              ))}
              {Object.keys(resumo.quemPagaIptu).length === 0 && <li className="meta">Sem lançamentos ainda.</li>}
            </ul>
          </div>

          <div className="card">
            <h4>Quem paga o DATI</h4>
            <ul className="resumo-list">
              {Object.entries(resumo.quemPagaDati).map(([quem, qtd]) => (
                <li key={quem}>
                  {quem}: <strong>{qtd}</strong>
                </li>
              ))}
              {Object.keys(resumo.quemPagaDati).length === 0 && <li className="meta">Sem lançamentos ainda.</li>}
            </ul>
          </div>

          <div className="card">
            <h4>Inscrições ({resumo.inscricoes.length})</h4>
            <div className="table-scroll">
              <table className="parcelas-table">
                <thead>
                  <tr>
                    <th>Inscrição</th>
                    <th>Códigos I</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.inscricoes.map((insc) => (
                    <tr key={insc.inscricaoIptu}>
                      <td>{insc.inscricaoIptu}</td>
                      <td>
                        {insc.codigos.join(', ')}
                        {insc.qtdCodigos > 1 && <span className="meta"> (rateio — {insc.qtdCodigos} imóveis)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h4>Imóveis</h4>
            <div className="table-scroll">
              <table className="parcelas-table">
                <thead>
                  <tr>
                    <th>I</th>
                    <th>Nome no carnê</th>
                    <th>Inscrição IPTU</th>
                    <th>DATI</th>
                    <th>Forma pgto</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.imoveis.map((im) => (
                    <tr key={im.codigo}>
                      <td>{im.codigo}</td>
                      <td>{im.nominalIptu || '—'}</td>
                      <td>{im.inscricaoIptu || '—'}</td>
                      <td>{im.dati || '—'}</td>
                      <td>{im.formaPgto || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
