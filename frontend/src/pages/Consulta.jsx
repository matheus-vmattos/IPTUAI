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

let proximaChaveDivisao = 1;
function membroDivisaoVazio(dados) {
  return {
    key: proximaChaveDivisao++,
    codigo: '',
    inscricaoIptu: '',
    dati: '',
    proprietario: '',
    nominalIptu: '',
    quemPaga: '',
    cotaUnica: '',
    parcela: '',
    ultimaParcela: '',
    reajustePct: '',
    obs: '',
    ...dados,
  };
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

  // Divide/agrupa num rateio todas as linhas "I" que compartilham a mesma
  // inscrição do imóvel aberto - sem precisar re-lançar o carnê pelo
  // assistente de Lançar (que exige subir o PDF de novo).
  const [dividindo, setDividindo] = useState(false);
  const [tributoDivisao, setTributoDivisao] = useState('IPTU');
  const [inscricaoDivisao, setInscricaoDivisao] = useState('');
  const [rotuloDivisao, setRotuloDivisao] = useState('');
  const [formaPgtoDivisao, setFormaPgtoDivisao] = useState('Parcelado');
  const [valorTotalDivisao, setValorTotalDivisao] = useState('');
  const [membrosDivisao, setMembrosDivisao] = useState([]);
  const [carregandoDivisao, setCarregandoDivisao] = useState(false);
  const [salvandoDivisao, setSalvandoDivisao] = useState(false);

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

  // Busca todas as linhas com essa inscrição exata (IPTU ou DATI) - linhas
  // sem código "I" não entram (não dá pra lançar valor nelas; use Editar ou
  // Excluir pra essas primeiro).
  async function carregarMembrosDivisao(inscricao) {
    if (!inscricao) {
      setMembrosDivisao([]);
      return;
    }
    setCarregandoDivisao(true);
    try {
      const { data } = await api.get(`/imoveis/por-inscricao/${encodeURIComponent(inscricao)}`);
      const comCodigo = data.filter((m) => m.codigo);
      setMembrosDivisao(
        comCodigo.map((m) =>
          membroDivisaoVazio({
            codigo: String(m.codigo),
            inscricaoIptu: m.inscricaoIptu || '',
            dati: m.dati || '',
            proprietario: m.proprietario || '',
            nominalIptu: m.nominalIptu || '',
            obs: m.obs || '',
          })
        )
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setCarregandoDivisao(false);
    }
  }

  // Ponto único de entrada da divisão, usado tanto a partir de um "I"
  // específico quanto a partir do imóvel de rateio (número contábil) direto
  // - preferível, já que é ele quem "manda" nesses dados, não uma unidade
  // qualquer do grupo.
  function iniciarDivisao(tributo, inscricao, rotulo, formaPgto) {
    setTributoDivisao(tributo);
    setInscricaoDivisao(inscricao);
    setRotuloDivisao(rotulo || '');
    setFormaPgtoDivisao(formaPgto || 'Parcelado');
    setValorTotalDivisao('');
    setError('');
    setDividindo(true);
    carregarMembrosDivisao(inscricao);
  }

  // A partir do "I" aberto em Consultar.
  function abrirDivisao() {
    if (!imovel) return;
    const tributo = imovel.inscricaoIptu ? 'IPTU' : 'DATI';
    const inscricao = tributo === 'IPTU' ? imovel.inscricaoIptu : imovel.dati;
    iniciarDivisao(tributo, inscricao, imovel.imovelDeRateio || imovel.grupoRateio?.rotuloContabil || '', imovel.formaPgto);
  }

  // A partir do imóvel de rateio (busca pelo número contábil) - jeito
  // preferido de mexer nisso, sem precisar abrir um "I" específico primeiro.
  function abrirDivisaoRateio(grp) {
    const primeiro = grp.imoveis[0];
    const tributo = primeiro && primeiro.inscricaoIptu === grp.inscricao ? 'IPTU' : 'DATI';
    iniciarDivisao(tributo, grp.inscricao, grupoRateio?.rotuloContabil || '');
  }

  function fecharDivisao() {
    setDividindo(false);
    setMembrosDivisao([]);
  }

  function trocarTributoDivisao(tributo) {
    setTributoDivisao(tributo);
    const inscricao = imovel ? (tributo === 'IPTU' ? imovel.inscricaoIptu : imovel.dati) : inscricaoDivisao;
    carregarMembrosDivisao(inscricao);
  }

  function atualizarMembroDivisao(key, campos) {
    setMembrosDivisao((prev) => prev.map((m) => (m.key === key ? { ...m, ...campos } : m)));
  }

  function aplicarQuemPagaDivisaoTodos(valor) {
    setMembrosDivisao((prev) => prev.map((m) => ({ ...m, quemPaga: valor })));
  }

  // Tira uma linha da divisão desta vez (não mexe na planilha - só nesse
  // rascunho) - ex: unidade vazia esse mês, não deve entrar na conta.
  // "Dividir igualmente" usa a quantidade de linhas que sobrar, então
  // remover/adicionar aqui é como aumentar ou diminuir o divisor.
  function removerMembroDivisao(key) {
    setMembrosDivisao((prev) => prev.filter((m) => m.key !== key));
  }

  // Adiciona uma linha "I" à divisão - busca os dados pra prefilar se já
  // existir na planilha (mesmo que não compartilhe essa inscrição hoje).
  async function adicionarMembroDivisao(codigoStr) {
    const codigo = codigoStr.trim();
    if (!codigo) return;
    if (membrosDivisao.some((m) => m.codigo === codigo)) return;
    try {
      const { data } = await api.get(`/imoveis/${encodeURIComponent(codigo)}`);
      setMembrosDivisao((prev) => [
        ...prev,
        membroDivisaoVazio({
          codigo,
          inscricaoIptu: data.inscricaoIptu || '',
          dati: data.dati || '',
          proprietario: data.proprietario || '',
          nominalIptu: data.nominalIptu || '',
          obs: data.obs || '',
        }),
      ]);
    } catch (err) {
      if (err?.response?.status === 404) {
        setMembrosDivisao((prev) => [...prev, membroDivisaoVazio({ codigo })]);
      } else {
        setError(apiErrorMessage(err));
      }
    }
  }

  function dividirValorIgualmente() {
    const total = Number(valorTotalDivisao);
    if (isNaN(total) || membrosDivisao.length === 0) return;
    const sugestao = Math.round((total / membrosDivisao.length) * 100) / 100;
    setMembrosDivisao((prev) =>
      prev.map((m) =>
        formaPgtoDivisao === 'Cota única' ? { ...m, cotaUnica: String(sugestao) } : { ...m, parcela: String(sugestao) }
      )
    );
  }

  function somaMembrosDivisao() {
    return membrosDivisao.reduce((acc, m) => {
      const v = formaPgtoDivisao === 'Cota única' ? Number(m.cotaUnica) : Number(m.parcela);
      return acc + (isNaN(v) ? 0 : v);
    }, 0);
  }

  // Lista em português o que falta pra poder salvar - sem isso o botão só
  // fica desabilitado sem explicar por quê.
  function pendenciasDivisao() {
    const pendencias = [];
    if (!rotuloDivisao.trim()) pendencias.push('informe o número do imóvel de rateio');
    if (membrosDivisao.length === 0) pendencias.push('nenhuma linha com código "I" encontrada pra essa inscrição');
    const semValor = membrosDivisao.filter((m) =>
      formaPgtoDivisao === 'Cota única' ? m.cotaUnica === '' || isNaN(Number(m.cotaUnica)) : m.parcela === '' || isNaN(Number(m.parcela))
    );
    if (semValor.length > 0) pendencias.push(`falta valor em: ${semValor.map((m) => `I ${m.codigo}`).join(', ')}`);
    const semQuemPaga = membrosDivisao.filter((m) => !m.quemPaga);
    if (semQuemPaga.length > 0) pendencias.push(`falta "quem paga" em: ${semQuemPaga.map((m) => `I ${m.codigo}`).join(', ')}`);
    return pendencias;
  }

  async function confirmarDivisao() {
    setError('');
    setSalvandoDivisao(true);
    try {
      const form = new FormData();
      form.append('rotulo', rotuloDivisao.trim());
      form.append('tributo', tributoDivisao);
      const itens = membrosDivisao.map((m) => {
        const it = {
          codigo: m.codigo.trim(),
          formaPgto: formaPgtoDivisao,
          proprietario: m.proprietario || undefined,
          nominalIptu: m.nominalIptu || undefined,
          quemPaga: m.quemPaga || undefined,
          obs: m.obs || undefined,
        };
        if (tributoDivisao === 'IPTU') it.inscricaoIptu = m.inscricaoIptu || undefined;
        if (tributoDivisao === 'DATI') it.dati = m.dati || undefined;
        if (m.reajustePct !== '') it.reajustePct = m.reajustePct;
        if (formaPgtoDivisao === 'Cota única') {
          it.cotaUnica = m.cotaUnica;
        } else {
          it.parcela = m.parcela;
          if (m.ultimaParcela !== '') it.ultimaParcela = m.ultimaParcela;
        }
        return it;
      });
      form.append('itens', JSON.stringify(itens));

      const { data } = await api.post('/lancamentos/rateio', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const falhas = data.resultados.filter((r) => r.status === 'erro');
      if (falhas.length > 0) {
        setError(`Algumas linhas falharam: ${falhas.map((f) => `I ${f.codigo} (${f.mensagem})`).join('; ')}`);
      }
      fecharDivisao();
      if (imovel) {
        await abrirImovel(imovel.codigo, imovel.inscricaoIptu || imovel.dati);
      } else {
        await buscar();
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSalvandoDivisao(false);
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

      {dividindo && (
        <div className="card destaque">
          <div className="iptu-header">
            <h4>Dividir/agrupar rateio — inscrição {inscricaoDivisao}</h4>
            <button type="button" className="link-btn" onClick={fecharDivisao}>
              Cancelar
            </button>
          </div>
          <p className="meta">
            Junta todas as linhas "I" que têm essa mesma inscrição num imóvel de rateio e grava o valor de cada
            uma de uma vez — sem precisar re-lançar o carnê pelo assistente de Lançar.
          </p>

          {imovel && imovel.inscricaoIptu && imovel.dati && (
            <div className="choice-row">
              <button className={tributoDivisao === 'IPTU' ? '' : 'link-btn'} onClick={() => trocarTributoDivisao('IPTU')}>
                IPTU
              </button>
              <button className={tributoDivisao === 'DATI' ? '' : 'link-btn'} onClick={() => trocarTributoDivisao('DATI')}>
                DATI
              </button>
            </div>
          )}

          <label>
            Número do imóvel de rateio (o usado no sistema contábil, não é código "I")
            <input value={rotuloDivisao} onChange={(e) => setRotuloDivisao(e.target.value)} placeholder="ex: 837" />
          </label>

          <label>
            Forma de pagamento (aplica a todas as linhas)
            <select value={formaPgtoDivisao} onChange={(e) => setFormaPgtoDivisao(e.target.value)}>
              <option value="Cota única">Cota única</option>
              <option value="Parcelado">Parcelado</option>
            </select>
          </label>

          {carregandoDivisao && <p className="meta">Buscando linhas dessa inscrição...</p>}

          {!carregandoDivisao && (
            <>
              {membrosDivisao.length > 0 && (
                <>
                  <label>
                    Quem paga (aplica a todas as linhas)
                    <select value="" onChange={(e) => e.target.value && aplicarQuemPagaDivisaoTodos(e.target.value)}>
                      <option value="">— escolher pra todas —</option>
                      {(config?.listas?.quemPagaOpcoes || []).map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Valor total do carnê (referência pra dividir igualmente)
                    <input
                      type="number"
                      step="0.01"
                      value={valorTotalDivisao}
                      onChange={(e) => setValorTotalDivisao(e.target.value)}
                    />
                  </label>
                  <button type="button" className="link-btn" onClick={dividirValorIgualmente} disabled={!valorTotalDivisao}>
                    Dividir igualmente entre as {membrosDivisao.length} linhas
                  </button>
                  <p className="meta">Soma das linhas abaixo: {formatarMoeda(somaMembrosDivisao())}</p>

                  <ul className="resumo-list">
                    {membrosDivisao.map((m) => (
                      <li key={m.key} className="card">
                        <strong>I {m.codigo}</strong> — {m.nominalIptu || m.proprietario || 'sem nome'}
                        <button type="button" className="link-btn" onClick={() => removerMembroDivisao(m.key)}>
                          remover desta divisão
                        </button>
                        <label>
                          Proprietário
                          <input
                            value={m.proprietario}
                            onChange={(e) => atualizarMembroDivisao(m.key, { proprietario: e.target.value })}
                          />
                        </label>
                        <label>
                          Quem paga
                          <select
                            value={m.quemPaga}
                            onChange={(e) => atualizarMembroDivisao(m.key, { quemPaga: e.target.value })}
                          >
                            <option value="">—</option>
                            {(config?.listas?.quemPagaOpcoes || []).map((op) => (
                              <option key={op} value={op}>
                                {op}
                              </option>
                            ))}
                          </select>
                        </label>
                        {formaPgtoDivisao === 'Cota única' ? (
                          <label>
                            Valor desta linha (R$)
                            <input
                              type="number"
                              step="0.01"
                              value={m.cotaUnica}
                              onChange={(e) => atualizarMembroDivisao(m.key, { cotaUnica: e.target.value })}
                            />
                          </label>
                        ) : (
                          <>
                            <label>
                              Parcela desta linha (R$)
                              <input
                                type="number"
                                step="0.01"
                                value={m.parcela}
                                onChange={(e) => atualizarMembroDivisao(m.key, { parcela: e.target.value })}
                              />
                            </label>
                            <label>
                              Última parcela (R$, deixe em branco se igual)
                              <input
                                type="number"
                                step="0.01"
                                value={m.ultimaParcela}
                                onChange={(e) => atualizarMembroDivisao(m.key, { ultimaParcela: e.target.value })}
                              />
                            </label>
                          </>
                        )}
                        <label>
                          % de reajuste (provisão pro próximo exercício)
                          <input
                            type="number"
                            step="0.1"
                            value={m.reajustePct}
                            onChange={(e) => atualizarMembroDivisao(m.key, { reajustePct: e.target.value })}
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <label>
                Adicionar linha "I" à divisão (aumenta o divisor)
                <input
                  placeholder="código, aperte Enter"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      adicionarMembroDivisao(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </label>

              {membrosDivisao.length === 0 && (
                <p className="meta">
                  Nenhuma linha com código "I" nessa divisão ainda — adicione pelo campo acima.
                </p>
              )}

              {pendenciasDivisao().length > 0 && (
                <p className="meta">Falta pra salvar: {pendenciasDivisao().join(' · ')}</p>
              )}

              <div className="actions-row">
                <button type="button" className="link-btn" onClick={fecharDivisao} disabled={salvandoDivisao}>
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pendenciasDivisao().length > 0 || salvandoDivisao}
                  onClick={confirmarDivisao}
                >
                  {salvandoDivisao ? 'Salvando...' : `Salvar rateio (${membrosDivisao.length} linhas)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {grupoRateio && !imovel && !dividindo && (
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
              {!modoLeitura && (
                <button type="button" className="link-btn" onClick={() => abrirDivisaoRateio(inscricaoRateio)}>
                  Dividir/editar valores desta inscrição
                </button>
              )}
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

      {resultados.length > 1 && !imovel && !dividindo && (
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

      {imovel && !editando && !dividindo && (
        <div className="resultado">
          <div className="iptu-header">
            <h3>Imóvel I {imovel.codigo || '(sem código)'} — {imovel.proprietario}</h3>
            {!modoLeitura && (
              <div>
                <button className="link-btn" onClick={iniciarEdicao}>
                  Editar
                </button>{' '}
                {(imovel.inscricaoIptu || imovel.dati) && (
                  <>
                    <button className="link-btn" onClick={abrirDivisao}>
                      Dividir rateio desta inscrição
                    </button>{' '}
                  </>
                )}
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
                Pra ajustar a divisão sem re-enviar o PDF, use "Dividir rateio desta inscrição" no topo da tela. Pra
                trocar o carnê, use "Lançar" de novo informando o número {imovel.grupoRateio.rotuloContabil} como
                imóvel de rateio.
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
