import { useState } from 'react';
import { api, apiErrorMessage } from '../api.js';

function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

// Versao curta pra impressao: os numeros grandes e os pontos que interessam
// pra decisao (quem paga, rateio), sem a tabela linha-a-linha de cada
// imovel que ja fica na tela.
function montarHtmlRelatorio(resumo) {
  const linhasQuemPaga = (obj) =>
    Object.entries(obj)
      .map(([quem, qtd]) => `<li>${escaparHtml(quem)}: <strong>${qtd}</strong></li>`)
      .join('') || '<li class="vazio">Sem lançamentos ainda.</li>';

  const linhasInscricoes = resumo.inscricoes
    .map(
      (insc) =>
        `<tr><td>${escaparHtml(insc.inscricaoIptu)}</td><td>${insc.codigos.join(', ')}</td><td>${
          insc.qtdCodigos > 1 ? `Rateio — ${insc.qtdCodigos} imóveis` : ''
        }</td></tr>`
    )
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Resumo — ${escaparHtml(resumo.proprietario)}</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; color: #1c1e21; padding: 32px; }
  h1 { font-size: 20px; margin-bottom: 2px; }
  .subtitulo { color: #666; font-size: 12px; margin-top: 0; margin-bottom: 24px; }
  .numeros { display: flex; gap: 24px; margin-bottom: 24px; }
  .numero { border: 1px solid #d0d5dd; border-radius: 8px; padding: 12px 16px; flex: 1; }
  .numero .valor { font-size: 20px; font-weight: 700; }
  .numero .rotulo { font-size: 11px; color: #666; }
  h2 { font-size: 14px; margin: 20px 0 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  ul { margin: 0; padding-left: 18px; font-size: 12px; }
  .vazio { color: #888; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #eee; }
</style>
</head><body>
  <h1>Resumo do proprietário — ${escaparHtml(resumo.proprietario)}</h1>
  <p class="subtitulo">Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>

  <div class="numeros">
    <div class="numero"><div class="valor">${resumo.totalImoveis}</div><div class="rotulo">imóveis</div></div>
    <div class="numero"><div class="valor">${formatarMoeda(resumo.valorCotaUnicaTotal)}</div><div class="rotulo">valor total (cota única)</div></div>
    <div class="numero"><div class="valor">${formatarMoeda(resumo.valorParceladoTotal)}</div><div class="rotulo">valor total (parcelado)</div></div>
  </div>

  <h2>Quem paga o IPTU</h2>
  <ul>${linhasQuemPaga(resumo.quemPagaIptu)}</ul>

  <h2>Quem paga o DATI</h2>
  <ul>${linhasQuemPaga(resumo.quemPagaDati)}</ul>

  <h2>Inscrições (${resumo.inscricoes.length})</h2>
  <table>
    <thead><tr><th>Inscrição</th><th>Códigos I</th><th></th></tr></thead>
    <tbody>${linhasInscricoes}</tbody>
  </table>
</body></html>`;
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

  async function gerarPdf() {
    if (!resumo) return;
    if (!window.electronAPI?.exportarPDF) {
      window.alert('Disponível só no app desktop.');
      return;
    }
    setError('');
    const html = montarHtmlRelatorio(resumo);
    const nomeArquivo = `Resumo - ${resumo.proprietario}.pdf`;
    try {
      const resultado = await window.electronAPI.exportarPDF(html, nomeArquivo);
      if (resultado?.salvo) window.alert(`PDF salvo em: ${resultado.caminho}`);
    } catch (err) {
      setError(apiErrorMessage(err));
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
          <div className="iptu-header">
            <h3>{resumo.proprietario}</h3>
            <button className="link-btn" onClick={gerarPdf}>
              Gerar PDF
            </button>
          </div>

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
