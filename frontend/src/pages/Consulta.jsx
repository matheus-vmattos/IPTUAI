import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, apiErrorMessage } from '../api.js';
import { useModoLeitura } from '../App.jsx';

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
  'iptuProvisaoProximoAno',
  'iptuProvisaoParcela',
  'iptuProvisaoUltimaParcela',
  'datiCotaUnica',
  'datiParcela',
  'datiUltimaParcela',
  'datiProvisaoProximoAno',
  'datiProvisaoParcela',
  'datiProvisaoUltimaParcela',
  'imovelDeRateio',
  'obs',
];

// Express nao aceita um segmento de path vazio - linhas orfas (sem "I") usam
// esse valor fixo no lugar do codigo ao montar a URL; o backend sabe
// converter de volta (ver imoveisRoutes.js).
const SEM_CODIGO = '_sem_codigo_';
function codigoNaUrl(codigo) {
  return codigo ? codigo : SEM_CODIGO;
}

function paraFormulario(imovel) {
  const out = {};
  for (const campo of CAMPOS_EDITAVEIS) {
    const valor = imovel[campo];
    out[campo] = valor === null || valor === undefined ? '' : String(valor);
  }
  return out;
}

export default function Consulta() {
  const modoLeitura = useModoLeitura();
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [imovel, setImovel] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);

  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);

  const [grupoRateio, setGrupoRateio] = useState(null);
  const [inscricaoRateio, setInscricaoRateio] = useState(null);

  const location = useLocation();

  useEffect(() => {
    api
      .get('/config')
      .then(({ data }) => setConfig(data))
      .catch(() => {});
  }, []);

  // Chegando de outra tela (ex: Painel) com um código já escolhido - abre
  // direto, sem precisar buscar de novo.
  useEffect(() => {
    if (location.state?.codigo) {
      abrirImovel(location.state.codigo, location.state.inscricao);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  async function buscar(e) {
    e?.preventDefault();
    if (!busca.trim()) return;
    setError('');
    setLoading(true);
    setImovel(null);
    setEditando(false);
    setGrupoRateio(null);
    setInscricaoRateio(null);
    try {
      const [resImoveis, resRateio] = await Promise.all([
        api.get('/imoveis', { params: { q: busca.trim() } }),
        api.get(`/rateios/${encodeURIComponent(busca.trim())}`).catch(() => null),
      ]);
      setResultados(resImoveis.data);
      // Bateu num numero de imovel de rateio (nao e codigo "I") - mostra o
      // drill-down em vez de (ou alem de) tentar achar por codigo/nome.
      if (resRateio?.data?.totalImoveis > 0) {
        setGrupoRateio(resRateio.data);
        if (resRateio.data.porInscricao.length === 1) setInscricaoRateio(resRateio.data.porInscricao[0]);
      } else if (resImoveis.data.length === 1) {
        abrirImovel(resImoveis.data[0].codigo, resImoveis.data[0].inscricaoIptu || resImoveis.data[0].dati);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // inscricao desambigua qual linha, quando o codigo aparece em mais de uma
  // (ex: um "I" com mais de uma guia de IPTU) - os resultados da busca já
  // trazem a inscrição de cada linha especificamente, então normalmente já
  // sobra sem ambiguidade.
  async function abrirImovel(codigo, inscricao) {
    setError('');
    setLoading(true);
    setEditando(false);
    try {
      const { data } = await api.get(`/imoveis/${encodeURIComponent(codigoNaUrl(codigo))}`, {
        params: inscricao ? { inscricao } : undefined,
      });
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
      await api.patch(`/imoveis/${encodeURIComponent(codigoNaUrl(imovel.codigo))}/lancado`, {
        tributo,
        status: 'Feito',
        inscricao: imovel.inscricaoIptu || imovel.dati,
      });
      abrirImovel(imovel.codigo, imovel.inscricaoIptu || imovel.dati);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  // Tira uma linha do grupo de rateio (limpa só o rótulo "Imóvel de
  // rateio" dessa linha - os valores já lançados continuam lá, editáveis
  // manualmente se precisar). codigoMembro/inscricaoMembro identificam a
  // linha certa mesmo quando o código se repete em mais de uma.
  async function removerDoRateio(codigoMembro, inscricaoMembro) {
    if (!window.confirm(`Remover I ${codigoMembro} deste imóvel de rateio?`)) return;
    setError('');
    try {
      await api.patch(
        `/imoveis/${encodeURIComponent(codigoMembro)}`,
        { imovelDeRateio: '' },
        { params: inscricaoMembro ? { inscricao: inscricaoMembro } : undefined }
      );
      await abrirImovel(imovel.codigo, imovel.inscricaoIptu || imovel.dati);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  // Limpa todos os campos da linha (nao remove fisicamente - ver
  // excelStore.excluirImovel) - util pra linhas duplicadas/erradas, tipo
  // uma linha orfa com codigo vazio que ficou duplicando uma inscricao. O
  // app faz backup do arquivo automaticamente antes.
  async function excluirImovel() {
    if (!imovel) return;
    if (
      !window.confirm(
        `Excluir o imóvel I ${imovel.codigo || '(sem código)'} (${imovel.proprietario || 'sem proprietário'})? ` +
          'Isso limpa todos os campos dessa linha na planilha. Um backup do arquivo é feito automaticamente antes.'
      )
    ) {
      return;
    }
    setError('');
    try {
      await api.delete(`/imoveis/${encodeURIComponent(codigoNaUrl(imovel.codigo))}`, {
        params: imovel.inscricaoIptu || imovel.dati ? { inscricao: imovel.inscricaoIptu || imovel.dati } : undefined,
      });
      setImovel(null);
      setEditando(false);
      await buscar();
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
      const inscricaoOriginal = imovel.inscricaoIptu || imovel.dati;
      await api.patch(`/imoveis/${encodeURIComponent(codigoNaUrl(imovel.codigo))}`, form, {
        params: inscricaoOriginal ? { inscricao: inscricaoOriginal } : undefined,
      });
      setEditando(false);
      await abrirImovel(imovel.codigo, form.inscricaoIptu || form.dati || inscricaoOriginal);
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
          placeholder="Código, inscrição, proprietário ou número do imóvel de rateio..."
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {grupoRateio && !imovel && (
        <div className="card destaque">
          <h4>Imóvel de rateio {grupoRateio.rotuloContabil}</h4>
          <p className="meta">
            {grupoRateio.totalImoveis} linha(s) em {grupoRateio.porInscricao.length} inscrição(ões) — não é código
            "I", é o número usado no sistema contábil.
          </p>
          {!inscricaoRateio ? (
            <ul className="resumo-list">
              {grupoRateio.porInscricao.map((grp) => (
                <li key={grp.inscricao || 'sem-inscricao'}>
                  <button className="choice-item" onClick={() => setInscricaoRateio(grp)}>
                    Inscrição {grp.inscricao || '(sem inscrição)'} — {grp.imoveis.map((m) => `I ${m.codigo}`).join(', ')}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <>
              {grupoRateio.porInscricao.length > 1 && (
                <button className="link-btn" onClick={() => setInscricaoRateio(null)}>
                  ← outras inscrições deste rateio
                </button>
              )}
              <p className="meta">Imóveis da inscrição {inscricaoRateio.inscricao}:</p>
              <ul className="resumo-list">
                {inscricaoRateio.imoveis.map((m, i) => (
                  <li key={`${m.codigo}-${i}`}>
                    <button
                      className="choice-item"
                      onClick={() => abrirImovel(m.codigo, m.inscricaoIptu || m.dati)}
                    >
                      I {m.codigo} — {m.nominalIptu || m.proprietario}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {resultados.length > 1 && !imovel && (
        <div className="card">
          <h4>{resultados.length} resultado(s)</h4>
          <ul className="resumo-list">
            {resultados.map((r, i) => (
              <li key={`${r.codigo}-${r.inscricaoIptu || r.dati || i}`}>
                <button
                  className="choice-item"
                  onClick={() => abrirImovel(r.codigo, r.inscricaoIptu || r.dati)}
                >
                  <strong>I {r.codigo || '(sem código)'}</strong> — {r.proprietario} ({r.inscricaoIptu || 'sem inscrição'})
                  {r.obs && <span className="meta"> — {r.obs}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {imovel && !editando && (
        <div className="resultado">
          <div className="iptu-header">
            <h3>Imóvel I {imovel.codigo || '(sem código)'} — {imovel.proprietario}</h3>
            {!modoLeitura && (
              <div>
                <button className="link-btn" onClick={iniciarEdicao}>
                  Editar
                </button>{' '}
                <button className="link-btn link-btn-perigo" onClick={excluirImovel}>
                  Excluir imóvel
                </button>
              </div>
            )}
          </div>
          {imovel.nominalIptu && (
            <p className="meta">Nome no carnê: {imovel.nominalIptu}</p>
          )}
          {imovel.obs && <p className="obs-destaque">OBS: {imovel.obs}</p>}

          <div className="card">
            <h4>IPTU</h4>
            <ul className="resumo-list">
              <li>Inscrição: {imovel.inscricaoIptu || '—'}</li>
              <li>Quem paga: {imovel.quemPagaIptu || '—'}</li>
              <li>Cota única: {formatarMoeda(imovel.iptuCotaUnica)}</li>
              <li>Parcela: {formatarMoeda(imovel.iptuParcela)} {imovel.iptuUltimaParcela ? `(última: ${formatarMoeda(imovel.iptuUltimaParcela)})` : ''}</li>
              <li>Total: {formatarMoeda(imovel.iptuTotalCalculado)}</li>
              {imovel.iptuProvisaoProximoAno != null && (
                <li>Provisão próx. exercício: {formatarMoeda(imovel.iptuProvisaoProximoAno)}</li>
              )}
              {imovel.iptuProvisaoParcela != null && (
                <li>
                  Provisão parcela: {formatarMoeda(imovel.iptuProvisaoParcela)}{' '}
                  {imovel.iptuProvisaoUltimaParcela
                    ? `(última: ${formatarMoeda(imovel.iptuProvisaoUltimaParcela)})`
                    : ''}
                </li>
              )}
              <li>
                Lançado no sistema: <strong>{imovel.iptuLancado || 'Não'}</strong>{' '}
                {!modoLeitura && imovel.iptuLancado !== 'Feito' && (
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
              {imovel.datiProvisaoProximoAno != null && (
                <li>Provisão próx. exercício: {formatarMoeda(imovel.datiProvisaoProximoAno)}</li>
              )}
              {imovel.datiProvisaoParcela != null && (
                <li>
                  Provisão parcela: {formatarMoeda(imovel.datiProvisaoParcela)}{' '}
                  {imovel.datiProvisaoUltimaParcela
                    ? `(última: ${formatarMoeda(imovel.datiProvisaoUltimaParcela)})`
                    : ''}
                </li>
              )}
              <li>
                Lançado no sistema: <strong>{imovel.datiLancado || 'Não'}</strong>{' '}
                {!modoLeitura && imovel.datiLancado !== 'Feito' && (
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
              {imovel.linkCarne && (
                <li>
                  Carnê salvo:{' '}
                  <button className="link-btn" title={imovel.linkCarne} onClick={abrirCarne}>
                    {imovel.linkCarne.split(/[/\\]/).pop()}
                  </button>
                </li>
              )}
            </ul>
            {imovel.linkCarne && <button onClick={abrirCarne}>Abrir carnê salvo</button>}
          </div>

          {imovel.grupoRateio && (
            <div className="card destaque">
              <h4>Imóvel de rateio {imovel.grupoRateio.rotuloContabil}</h4>
              <p className="meta">
                Número usado no sistema contábil pra cobrar o proprietário pelo total das{' '}
                {imovel.grupoRateio.totalImoveis} linhas abaixo (não é código "I" de nenhuma delas). Valor
                consolidado pra lançar de uma vez:
              </p>
              <ul className="resumo-list">
                {imovel.grupoRateio.totais.iptuCotaUnica != null && (
                  <li>IPTU cota única (total): <strong>{formatarMoeda(imovel.grupoRateio.totais.iptuCotaUnica)}</strong></li>
                )}
                {imovel.grupoRateio.totais.iptuParcelado != null && (
                  <li>IPTU parcelado (total): <strong>{formatarMoeda(imovel.grupoRateio.totais.iptuParcelado)}</strong></li>
                )}
                {imovel.grupoRateio.totais.datiCotaUnica != null && (
                  <li>DATI cota única (total): <strong>{formatarMoeda(imovel.grupoRateio.totais.datiCotaUnica)}</strong></li>
                )}
                {imovel.grupoRateio.totais.datiParcelado != null && (
                  <li>DATI parcelado (total): <strong>{formatarMoeda(imovel.grupoRateio.totais.datiParcelado)}</strong></li>
                )}
              </ul>
              <p className="meta">Linhas do grupo (valor de cada unidade):</p>
              <ul className="resumo-list">
                {imovel.grupoRateio.imoveis.map((m, i) => (
                  <li key={`${m.codigo}-${m.inscricaoIptu || m.dati || i}`}>
                    I {m.codigo} — {m.nominalIptu || m.proprietario}
                    {': '}
                    {m.formaPgto === 'Cota única'
                      ? formatarMoeda((Number(m.iptuCotaUnica) || 0) + (Number(m.datiCotaUnica) || 0))
                      : formatarMoeda((Number(m.iptuTotalCalculado) || 0) + (Number(m.datiTotalCalculado) || 0))}
                    {m.codigo === imovel.codigo && m.inscricaoIptu === imovel.inscricaoIptu && ' (este)'}
                    {!modoLeitura && (
                      <>
                        {' — '}
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => removerDoRateio(m.codigo, m.inscricaoIptu || m.dati)}
                        >
                          remover deste rateio
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <p className="meta">
                Pra ajustar a divisão ou trocar o carnê, use "Lançar" de novo informando o número{' '}
                {imovel.grupoRateio.rotuloContabil} como imóvel de rateio — as linhas já aparecem prontas pra
                editar.
              </p>
            </div>
          )}
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
            <label>
              Provisão próx. exercício (R$)
              <input type="number" step="0.01" value={form.iptuProvisaoProximoAno} onChange={(e) => atualizarCampo('iptuProvisaoProximoAno', e.target.value)} />
            </label>
            <label>
              Provisão parcela (R$)
              <input type="number" step="0.01" value={form.iptuProvisaoParcela} onChange={(e) => atualizarCampo('iptuProvisaoParcela', e.target.value)} />
            </label>
            <label>
              Provisão última parcela (R$)
              <input type="number" step="0.01" value={form.iptuProvisaoUltimaParcela} onChange={(e) => atualizarCampo('iptuProvisaoUltimaParcela', e.target.value)} />
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
            <label>
              Provisão próx. exercício (R$)
              <input type="number" step="0.01" value={form.datiProvisaoProximoAno} onChange={(e) => atualizarCampo('datiProvisaoProximoAno', e.target.value)} />
            </label>
            <label>
              Provisão parcela (R$)
              <input type="number" step="0.01" value={form.datiProvisaoParcela} onChange={(e) => atualizarCampo('datiProvisaoParcela', e.target.value)} />
            </label>
            <label>
              Provisão última parcela (R$)
              <input type="number" step="0.01" value={form.datiProvisaoUltimaParcela} onChange={(e) => atualizarCampo('datiProvisaoUltimaParcela', e.target.value)} />
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
