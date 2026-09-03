import { useState } from 'react';
import { api, apiErrorMessage } from '../api.js';

function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Consulta() {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [imovel, setImovel] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function buscar(e) {
    e?.preventDefault();
    if (!busca.trim()) return;
    setError('');
    setLoading(true);
    setImovel(null);
    try {
      const { data } = await api.get('/imoveis', { params: { q: busca.trim() } });
      setResultados(data);
      if (data.length === 1) abrirImovel(data[0].codigo);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function abrirImovel(codigo) {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.get(`/imoveis/${encodeURIComponent(codigo)}`);
      setImovel(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function marcarLancado(tributo) {
    if (!imovel) return;
    try {
      await api.patch(`/imoveis/${encodeURIComponent(imovel.codigo)}/lancado`, {
        tributo,
        status: 'Feito',
      });
      abrirImovel(imovel.codigo);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function abrirCarne() {
    if (!imovel?.linkCarne) return;
    if (window.electronAPI?.abrirArquivo) {
      await window.electronAPI.abrirArquivo(imovel.linkCarne);
    } else {
      window.alert(`Arquivo salvo em: ${imovel.linkCarne}`);
    }
  }

  return (
    <div className="page">
      <h2>Consultar imóvel</h2>

      <form className="inline-form" onSubmit={buscar}>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Código, inscrição, proprietário..."
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {resultados.length > 1 && !imovel && (
        <div className="card">
          <h4>{resultados.length} resultado(s)</h4>
          <ul className="resumo-list">
            {resultados.map((r) => (
              <li key={r.codigo}>
                <button className="choice-item" onClick={() => abrirImovel(r.codigo)}>
                  <strong>I {r.codigo}</strong> — {r.proprietario} ({r.inscricaoIptu || 'sem inscrição'})
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {imovel && (
        <div className="resultado">
          <h3>Imóvel I {imovel.codigo} — {imovel.proprietario}</h3>

          <div className="card">
            <h4>IPTU</h4>
            <ul className="resumo-list">
              <li>Inscrição: {imovel.inscricaoIptu || '—'}</li>
              <li>Quem paga: {imovel.quemPagaIptu || '—'}</li>
              <li>Cota única: {formatarMoeda(imovel.iptuCotaUnica)}</li>
              <li>Parcela: {formatarMoeda(imovel.iptuParcela)} {imovel.iptuUltimaParcela ? `(última: ${formatarMoeda(imovel.iptuUltimaParcela)})` : ''}</li>
              <li>Total: {formatarMoeda(imovel.iptuTotalCalculado)}</li>
              <li>
                Lançado no sistema: <strong>{imovel.iptuLancado || 'Não'}</strong>{' '}
                {imovel.iptuLancado !== 'Feito' && (
                  <button className="link-btn" onClick={() => marcarLancado('IPTU')}>
                    marcar como lançado
                  </button>
                )}
              </li>
            </ul>
          </div>

          <div className="card">
            <h4>DATI</h4>
            <ul className="resumo-list">
              <li>Inscrição: {imovel.dati || '—'}</li>
              <li>Quem paga: {imovel.quemPagaDati || '—'}</li>
              <li>Cota única: {formatarMoeda(imovel.datiCotaUnica)}</li>
              <li>Parcela: {formatarMoeda(imovel.datiParcela)} {imovel.datiUltimaParcela ? `(última: ${formatarMoeda(imovel.datiUltimaParcela)})` : ''}</li>
              <li>Total: {formatarMoeda(imovel.datiTotalCalculado)}</li>
              <li>
                Lançado no sistema: <strong>{imovel.datiLancado || 'Não'}</strong>{' '}
                {imovel.datiLancado !== 'Feito' && (
                  <button className="link-btn" onClick={() => marcarLancado('DATI')}>
                    marcar como lançado
                  </button>
                )}
              </li>
            </ul>
          </div>

          <div className="card destaque">
            <h4>Resumo</h4>
            <ul className="resumo-list">
              <li>Forma de pagamento: {imovel.formaPgto || '—'}</li>
              <li>
                <strong>Valor a pagar: {formatarMoeda(imovel.valorAPagarCalculado)}</strong>
              </li>
              {imovel.obs && <li>OBS: {imovel.obs}</li>}
            </ul>
            {imovel.linkCarne && <button onClick={abrirCarne}>Abrir carnê salvo</button>}
          </div>
        </div>
      )}
    </div>
  );
}
