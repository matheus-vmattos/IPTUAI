import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../api.js';

const POR_PAGINA = 15;

// Lista com filtro por nome/código "I" e paginação - reaproveitada nas
// pendências do exercício e na provisão pro próximo ano, que têm o mesmo
// formato de item (codigo, proprietario, nominalIptu, inscricaoIptu/dati,
// imovelDeRateio).
function ListaComBusca({ itens, onAbrir, vazio }) {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);

  const alvo = busca.trim().toLowerCase();
  const filtrados = !alvo
    ? itens
    : itens.filter(
        (m) =>
          String(m.codigo || '').toLowerCase().includes(alvo) ||
          (m.proprietario || '').toLowerCase().includes(alvo) ||
          (m.nominalIptu || '').toLowerCase().includes(alvo)
      );

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  return (
    <>
      <input
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value);
          setPagina(1);
        }}
        placeholder="Filtrar por nome ou código I..."
      />
      {filtrados.length === 0 && <p className="meta">{vazio || 'Nada encontrado.'}</p>}
      <ul className="resumo-list">
        {visiveis.map((m, i) => (
          <li key={`${m.codigo}-${m.inscricaoIptu || m.dati || i}`}>
            <button type="button" className="link-btn" onClick={() => onAbrir(m.codigo, m.inscricaoIptu || m.dati)}>
              I {m.codigo || '(sem código)'} — {m.nominalIptu || m.proprietario}
            </button>
            {m.imovelDeRateio ? ` (rateio ${m.imovelDeRateio})` : ''}
          </li>
        ))}
      </ul>
      {totalPaginas > 1 && (
        <div className="actions-row">
          <button className="link-btn" disabled={paginaAtual <= 1} onClick={() => setPagina((p) => p - 1)}>
            ← anterior
          </button>
          <span className="meta">
            página {paginaAtual} de {totalPaginas} ({filtrados.length})
          </span>
          <button className="link-btn" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
            próxima →
          </button>
        </div>
      )}
    </>
  );
}

export default function Painel() {
  const navigate = useNavigate();
  const [grupos, setGrupos] = useState(null);
  const [pendencias, setPendencias] = useState(null);
  const [provisao, setProvisao] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtroRateio, setFiltroRateio] = useState('');
  const [expandidos, setExpandidos] = useState(new Set());
  const [abaPendencias, setAbaPendencias] = useState('IPTU');
  const [abaProvisao, setAbaProvisao] = useState('IPTU');
  const [statusProvisao, setStatusProvisao] = useState('semProvisao');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([api.get('/rateios'), api.get('/pendencias'), api.get('/provisao')])
      .then(([r1, r2, r3]) => {
        setGrupos(r1.data);
        setPendencias(r2.data);
        setProvisao(r3.data);
      })
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  function irParaImovel(codigo, inscricao) {
    navigate('/consulta', { state: { codigo: String(codigo), inscricao: inscricao || undefined } });
  }

  function toggleExpandido(rotulo) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(rotulo)) next.delete(rotulo);
      else next.add(rotulo);
      return next;
    });
  }

  const buscaRateioAtiva = filtroRateio.trim() !== '';
  const gruposFiltrados = (grupos || []).filter((g) => {
    if (!buscaRateioAtiva) return true;
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

  const chaveProvisao = `${statusProvisao === 'comProvisao' ? 'com' : 'sem'}Provisao${abaProvisao === 'IPTU' ? 'Iptu' : 'Dati'}`;
  const listaProvisao = provisao?.[chaveProvisao];

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
              {gruposFiltrados.map((g) => {
                const aberto = buscaRateioAtiva || expandidos.has(g.rotuloContabil);
                return (
                  <li key={g.rotuloContabil} className="card">
                    <button
                      type="button"
                      className="link-btn rateio-toggle"
                      onClick={() => toggleExpandido(g.rotuloContabil)}
                    >
                      {aberto ? '▾' : '▸'} <strong>Rateio {g.rotuloContabil}</strong> — {g.totalImoveis} linha(s)
                    </button>
                    {aberto && (
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
                    )}
                  </li>
                );
              })}
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
            <ListaComBusca itens={listaPendencias || []} onAbrir={irParaImovel} vazio="Nada pendente — tudo lançado." />
          </div>

          <div className="card">
            <h3>Provisão pro próximo exercício</h3>
            <p className="meta">Valor provisório calculado pra {(provisao && provisao.proximoExercicio) || 'o próximo ano'}.</p>
            <div className="choice-row">
              <button className={abaProvisao === 'IPTU' ? '' : 'link-btn'} onClick={() => setAbaProvisao('IPTU')}>
                IPTU
              </button>
              <button className={abaProvisao === 'DATI' ? '' : 'link-btn'} onClick={() => setAbaProvisao('DATI')}>
                DATI
              </button>
            </div>
            <div className="choice-row">
              <button
                className={statusProvisao === 'comProvisao' ? '' : 'link-btn'}
                onClick={() => setStatusProvisao('comProvisao')}
              >
                Já provisionado ({provisao?.[`comProvisao${abaProvisao === 'IPTU' ? 'Iptu' : 'Dati'}`]?.length ?? 0})
              </button>
              <button
                className={statusProvisao === 'semProvisao' ? '' : 'link-btn'}
                onClick={() => setStatusProvisao('semProvisao')}
              >
                Ainda sem provisão ({provisao?.[`semProvisao${abaProvisao === 'IPTU' ? 'Iptu' : 'Dati'}`]?.length ?? 0})
              </button>
            </div>
            <ListaComBusca
              itens={listaProvisao || []}
              onAbrir={irParaImovel}
              vazio={statusProvisao === 'comProvisao' ? 'Nenhum imóvel provisionado ainda.' : 'Todos já têm provisão.'}
            />
          </div>
        </>
      )}
    </div>
  );
}
