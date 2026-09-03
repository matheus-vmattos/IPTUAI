import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../api.js';

function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const CAMPOS_EDITAVEIS = [
  'proprietario',
  'nominalIptu',
  'inscricaoIptu',
  'dati',
  'quemPagaIptu',
  'quemPagaDati',
  'formaPgto',
  'iptuCotaUnica',
  'iptuParcela',
  'iptuUltimaParcela',
  'datiCotaUnica',
  'datiParcela',
  'datiUltimaParcela',
  'imovelDeRateio',
  'obs',
];

function paraFormulario(imovel) {
  const out = {};
  for (const campo of CAMPOS_EDITAVEIS) {
    const valor = imovel[campo];
    out[campo] = valor === null || valor === undefined ? '' : String(valor);
  }
  return out;
}

export default function Consulta() {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [imovel, setImovel] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);

  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api
      .get('/config')
      .then(({ data }) => setConfig(data))
      .catch(() => {});
  }, []);

  async function buscar(e) {
    e?.preventDefault();
    if (!busca.trim()) return;
    setError('');
    setLoading(true);
    setImovel(null);
    setEditando(false);
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
    setEditando(false);
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

  function iniciarEdicao() {
    setForm(paraFormulario(imovel));
    setEditando(true);
  }

  function atualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function salvarEdicao(e) {
    e.preventDefault();
    setError('');
    setSalvando(true);
    try {
      await api.patch(`/imoveis/${encodeURIComponent(imovel.codigo)}`, form);
      setEditando(false);
      await abrirImovel(imovel.codigo);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSalvando(false);
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

      {imovel && !editando && (
        <div className="resultado">
          <div className="iptu-header">
            <h3>Imóvel I {imovel.codigo} — {imovel.proprietario}</h3>
            <button className="link-btn" onClick={iniciarEdicao}>
              Editar
            </button>
          </div>
          {imovel.nominalIptu && (
            <p className="meta">Nome no carnê: {imovel.nominalIptu}</p>
          )}

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
              {imovel.imovelDeRateio && <li>Imóvel de rateio: {imovel.imovelDeRateio}</li>}
              {imovel.obs && <li>OBS: {imovel.obs}</li>}
            </ul>
            {imovel.linkCarne && <button onClick={abrirCarne}>Abrir carnê salvo</button>}
          </div>
        </div>
      )}

      {imovel && editando && (
        <form className="resultado" onSubmit={salvarEdicao}>
          <div className="iptu-header">
            <h3>Editando imóvel I {imovel.codigo}</h3>
            <button type="button" className="link-btn" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>

          <div className="card">
            <h4>Identificação</h4>
            <label>
              Proprietário
              <input value={form.proprietario} onChange={(e) => atualizarCampo('proprietario', e.target.value)} />
            </label>
            <label>
              Nome no carnê (se diferente do proprietário)
              <input value={form.nominalIptu} onChange={(e) => atualizarCampo('nominalIptu', e.target.value)} />
            </label>
            <label>
              Inscrição IPTU
              <input value={form.inscricaoIptu} onChange={(e) => atualizarCampo('inscricaoIptu', e.target.value)} />
            </label>
            <label>
              Inscrição DATI
              <input value={form.dati} onChange={(e) => atualizarCampo('dati', e.target.value)} />
            </label>
            <label>
              Imóvel de rateio
              <input value={form.imovelDeRateio} onChange={(e) => atualizarCampo('imovelDeRateio', e.target.value)} />
            </label>
          </div>

          <div className="card">
            <h4>IPTU</h4>
            <label>
              Quem paga
              <select value={form.quemPagaIptu} onChange={(e) => atualizarCampo('quemPagaIptu', e.target.value)}>
                <option value="">—</option>
                {(config?.listas?.quemPagaOpcoes || []).map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cota única (R$)
              <input type="number" step="0.01" value={form.iptuCotaUnica} onChange={(e) => atualizarCampo('iptuCotaUnica', e.target.value)} />
            </label>
            <label>
              Parcela (R$)
              <input type="number" step="0.01" value={form.iptuParcela} onChange={(e) => atualizarCampo('iptuParcela', e.target.value)} />
            </label>
            <label>
              Última parcela (R$)
              <input type="number" step="0.01" value={form.iptuUltimaParcela} onChange={(e) => atualizarCampo('iptuUltimaParcela', e.target.value)} />
            </label>
          </div>

          <div className="card">
            <h4>DATI</h4>
            <label>
              Quem paga
              <select value={form.quemPagaDati} onChange={(e) => atualizarCampo('quemPagaDati', e.target.value)}>
                <option value="">—</option>
                {(config?.listas?.quemPagaOpcoes || []).map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cota única (R$)
              <input type="number" step="0.01" value={form.datiCotaUnica} onChange={(e) => atualizarCampo('datiCotaUnica', e.target.value)} />
            </label>
            <label>
              Parcela (R$)
              <input type="number" step="0.01" value={form.datiParcela} onChange={(e) => atualizarCampo('datiParcela', e.target.value)} />
            </label>
            <label>
              Última parcela (R$)
              <input type="number" step="0.01" value={form.datiUltimaParcela} onChange={(e) => atualizarCampo('datiUltimaParcela', e.target.value)} />
            </label>
          </div>

          <div className="card destaque">
            <label>
              Forma de pagamento
              <select value={form.formaPgto} onChange={(e) => atualizarCampo('formaPgto', e.target.value)}>
                <option value="">—</option>
                {(config?.listas?.formaPgtoOpcoes || []).map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Observações
              <input value={form.obs} onChange={(e) => atualizarCampo('obs', e.target.value)} />
            </label>
            <div className="actions-row">
              <button type="button" className="link-btn" onClick={() => setEditando(false)} disabled={salvando}>
                Cancelar
              </button>
              <button type="submit" disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
