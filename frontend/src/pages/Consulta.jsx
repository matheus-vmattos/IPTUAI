import { useState } from 'react';
import { api, apiErrorMessage } from '../api.js';

function formatarMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

function formatarData(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function proximaParcelaVencendo(iptus) {
  const pendentes = iptus
    .flatMap((iptu) => iptu.parcelas.map((p) => ({ ...p, iptu })))
    .filter((p) => p.status === 'pendente')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  return pendentes[0] || null;
}

export default function Consulta() {
  const [codigo, setCodigo] = useState('');
  const [imovel, setImovel] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [imprimindoId, setImprimindoId] = useState(null);

  async function buscar(e) {
    e?.preventDefault();
    if (!codigo.trim()) return;
    setError('');
    setLoading(true);
    setImovel(null);
    try {
      const { data } = await api.get(`/imoveis/${encodeURIComponent(codigo.trim())}`);
      setImovel(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function marcarStatus(parcelaId, status) {
    try {
      await api.patch(`/parcelas/${parcelaId}`, { status });
      await buscar();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function imprimir(iptuId) {
    setError('');
    setImprimindoId(iptuId);
    try {
      const { data } = await api.get(`/iptus/${iptuId}/arquivo`, { responseType: 'arraybuffer' });
      const base64 = arrayBufferToBase64(data);

      if (window.electronAPI?.printPdfBuffer) {
        await window.electronAPI.printPdfBuffer(base64);
      } else {
        const blob = new Blob([data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setImprimindoId(null);
    }
  }

  const proxima = imovel ? proximaParcelaVencendo(imovel.iptus) : null;

  return (
    <div className="page">
      <h2>Consultar IPTU por código</h2>

      <form className="inline-form" onSubmit={buscar}>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Código de identificação (ex: I 213)"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {imovel && (
        <div className="resultado">
          <h3>Imóvel {imovel.codigo}</h3>

          {proxima ? (
            <div className="card destaque">
              <h4>Parcela vencendo</h4>
              <p>
                Parcela <strong>{proxima.numero}</strong> — {formatarMoeda(proxima.valor)} — vence em{' '}
                <strong>{formatarData(proxima.vencimento)}</strong>
              </p>
              <p className="meta">
                {proxima.iptu.exercicio && `Exercício ${proxima.iptu.exercicio} · `}
                {proxima.iptu.tipo_pagamento === 'unica' ? 'Parcela única' : 'Parcelado'} ·{' '}
                {proxima.iptu.forma_pagamento === 'imobiliaria' ? 'Pago pela imobiliária' : 'Repassado'}
              </p>
              <div className="actions-row">
                <button onClick={() => marcarStatus(proxima.id, 'pago')}>Marcar como pago</button>
                <button onClick={() => imprimir(proxima.iptu.id)} disabled={imprimindoId === proxima.iptu.id}>
                  {imprimindoId === proxima.iptu.id ? 'Abrindo...' : 'Imprimir arquivo'}
                </button>
              </div>
            </div>
          ) : (
            <div className="card">Nenhuma parcela pendente para este imóvel.</div>
          )}

          <h4>Histórico de lançamentos</h4>
          {imovel.iptus.map((iptu) => (
            <div className="card" key={iptu.id}>
              <div className="iptu-header">
                <span>
                  {iptu.exercicio ? `Exercício ${iptu.exercicio}` : iptu.arquivo_nome} ·{' '}
                  {iptu.tipo_pagamento === 'unica' ? 'Parcela única' : 'Parcelado'} ·{' '}
                  {iptu.forma_pagamento === 'imobiliaria' ? 'Imobiliária' : 'Repassado'}
                </span>
                <button onClick={() => imprimir(iptu.id)} disabled={imprimindoId === iptu.id}>
                  {imprimindoId === iptu.id ? 'Abrindo...' : 'Imprimir'}
                </button>
              </div>
              <table className="parcelas-table">
                <thead>
                  <tr>
                    <th>Parcela</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {iptu.parcelas.map((p) => (
                    <tr key={p.id}>
                      <td>{p.numero}</td>
                      <td>{formatarMoeda(p.valor)}</td>
                      <td>{formatarData(p.vencimento)}</td>
                      <td>
                        <span className={`badge ${p.status}`}>{p.status}</span>
                      </td>
                      <td>
                        {p.status === 'pendente' ? (
                          <button className="link-btn" onClick={() => marcarStatus(p.id, 'pago')}>
                            marcar pago
                          </button>
                        ) : (
                          <button className="link-btn" onClick={() => marcarStatus(p.id, 'pendente')}>
                            desfazer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
