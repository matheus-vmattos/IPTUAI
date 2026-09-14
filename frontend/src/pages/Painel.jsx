import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../api.js';

export default function Painel() {
  const navigate = useNavigate();
  const [grupos, setGrupos] = useState(null);
  const [pendencias, setPendencias] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtroRateio, setFiltroRateio] = useState('');
  const [abaPendencias, setAbaPendencias] = useState('IPTU');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([api.get('/rateios'), api.get('/pendencias')])
      .then(([r1, r2]) => {
        setGrupos(r1.data);
        setPendencias(r2.data);
      })
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  function irParaImovel(codigo, inscricao) {
    navigate('/consulta', { state: { codigo: String(codigo), inscricao: inscricao || undefined } });
  }

  const gruposFiltrados = (grupos || []).filter((g) => {
    if (!filtroRateio.trim()) return true;
    const alvo = filtroRateio.trim().toLowerCase();
    if (g.rotuloContabil.toLowerCase().includes(alvo)) return true;
    return g.imoveis.some(
      (m) =>
        String(m.codigo).toLowerCase().includes(alvo) ||
        (m.proprietario || '').toLowerCase().includes(alvo) ||
        (m.nominalIptu || '').toLowerCase().includes(alvo)
    );
  });

  const listaPendencias = abaPendencias === 'IPTU' ? pendencias?.pendentesIptu : pendencias?.pendentesDati;

  return (
    <div className="page">
      <h2>Painel</h2>
      <p className="meta">Visão geral pra entender onde lançar um carnê e o que ainda falta no exercício.</p>

      {error && <div className="error">{error}</div>}
      {loading && <p className="meta">Carregando...</p>}

      {!loading && (
        <>
          <div className="card">
            <h3>Imóveis de rateio ({grupos?.length ?? 0})</h3>
            <p className="meta">
              Números usados no sistema contábil (não são código "I") que agrupam várias linhas rateadas.
            </p>
            <input
              value={filtroRateio}
              onChange={(e) => setFiltroRateio(e.target.value)}
              placeholder="Filtrar por número, código ou nome..."
            />
            {gruposFiltrados.length === 0 && <p className="meta">Nenhum imóvel de rateio encontrado.</p>}
            <ul className="resumo-list">
              {gruposFiltrados.map((g) => (
                <li key={g.rotuloContabil} className="card">
                  <strong>Rateio {g.rotuloContabil}</strong> — {g.totalImoveis} linha(s)
                  <ul className="resumo-list">
                    {g.imoveis.map((m, i) => (
                      <li key={`${m.codigo}-${m.inscricaoIptu || m.dati || i}`}>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => irParaImovel(m.codigo, m.inscricaoIptu || m.dati)}
                        >
                          I {m.codigo} — {m.nominalIptu || m.proprietario}
                        </button>
                        {m.obs ? ` (${m.obs})` : ''}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3>Pendências do exercício</h3>
            <p className="meta">Imóveis ainda sem carnê lançado neste exercício.</p>
            <div className="choice-row">
              <button
                className={abaPendencias === 'IPTU' ? '' : 'link-btn'}
                onClick={() => setAbaPendencias('IPTU')}
              >
                IPTU ({pendencias?.pendentesIptu.length ?? 0})
              </button>
              <button
                className={abaPendencias === 'DATI' ? '' : 'link-btn'}
                onClick={() => setAbaPendencias('DATI')}
              >
                DATI ({pendencias?.pendentesDati.length ?? 0})
              </button>
            </div>
            {(listaPendencias || []).length === 0 && <p className="meta">Nada pendente — tudo lançado.</p>}
            <ul className="resumo-list">
              {(listaPendencias || []).slice(0, 200).map((m, i) => (
                <li key={`${m.codigo}-${m.inscricaoIptu || m.dati || i}`}>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => irParaImovel(m.codigo, m.inscricaoIptu || m.dati)}
                  >
                    I {m.codigo} — {m.nominalIptu || m.proprietario}
                  </button>
                  {m.imovelDeRateio ? ` (rateio ${m.imovelDeRateio})` : ''}
                </li>
              ))}
            </ul>
            {(listaPendencias || []).length > 200 && (
              <p className="meta">Mostrando as primeiras 200 de {listaPendencias.length}.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
