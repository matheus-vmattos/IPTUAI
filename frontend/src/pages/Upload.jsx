import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../api.js';

const STEPS = ['tributo', 'valores', 'imovel', 'quemPaga', 'confirmar'];

function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function itemVazio() {
  return {
    tributo: '',
    formaPgto: '',
    cotaUnica: '',
    parcela: '',
    ultimaParcela: '',
    codigo: '',
    imovelEncontrado: null,
    imovelNovo: false,
    candidatosAmbiguos: null,
    proprietario: '',
    nominalIptu: '',
    inscricaoIptu: '',
    dati: '',
    quemPaga: '',
    obs: '',
    escolhendoCotaUnica: false,
    reajustePct: '',
    modoRateio: false,
    rateioPerguntaRespondida: false,
    rateioRotulo: '',
    rateioBuscando: false,
    rateioMembros: [],
  };
}

let proximaChaveMembro = 1;
function membroVazio(dadosIniciais) {
  return {
    key: proximaChaveMembro++,
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
    existente: false,
    ...dadosIniciais,
  };
}

// Usada quando o cadastro é manual (sem PDF) - mesma forma da extração
// automática, só que tudo vazio, pra reaproveitar o mesmo assistente sem
// mudar nenhuma lógica dele (os campos já ficam em branco/editáveis quando
// a extração não acha nada).
function extracaoVazia() {
  return {
    parceladas: [],
    cotaUnica: [],
    resumoParcelas: { parcela: null, ultimaParcela: null },
    inscricaoDetectada: null,
    imoveisPorInscricao: [],
    codigoSugerido: null,
  };
}

function valorTotalDoItem(item, nParcelas) {
  if (item.formaPgto === 'Cota única') {
    return item.cotaUnica === '' ? null : Number(item.cotaUnica);
  }
  if (item.parcela === '') return null;
  const ultima = item.ultimaParcela === '' ? item.parcela : item.ultimaParcela;
  return Number(item.parcela) * ((nParcelas || 1) - 1) + Number(ultima);
}

export default function Upload() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // fila: um item por PDF selecionado. Cada item guarda a extração feita e
  // as respostas do usuário; processados um de cada vez no wizard abaixo.
  const [fila, setFila] = useState([]);
  const [indice, setIndice] = useState(0);
  const [step, setStep] = useState(0);
  const [item, setItem] = useState(itemVazio());
  const [buscandoImovel, setBuscandoImovel] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [terminado, setTerminado] = useState(false);

  useEffect(() => {
    api
      .get('/config')
      .then(({ data }) => setConfig(data))
      .catch(() => {});
  }, []);

  function atualizarItem(campos) {
    setItem((prev) => ({ ...prev, ...campos }));
  }

  // inscricao desambigua qual linha, quando o codigo bater em mais de uma
  // (ex: um "I" com mais de uma inscricao/guia de IPTU). Sem ela, se o
  // codigo for ambiguo o backend devolve 409 com os candidatos - guardamos
  // pra mostrar um seletor no passo 3, em vez de simplesmente falhar.
  async function prefillPorCodigo(codigo, itemAtual, inscricao) {
    if (!codigo) return itemAtual;
    try {
      const { data } = await api.get(`/imoveis/${encodeURIComponent(codigo)}`, {
        params: inscricao ? { inscricao } : undefined,
      });
      return {
        ...itemAtual,
        codigo,
        imovelEncontrado: data,
        imovelNovo: false,
        candidatosAmbiguos: null,
        proprietario: data.proprietario || '',
        nominalIptu: data.nominalIptu || '',
        inscricaoIptu: data.inscricaoIptu || '',
        dati: data.dati || '',
      };
    } catch (err) {
      if (err?.response?.status === 404) {
        return { ...itemAtual, codigo, imovelEncontrado: null, imovelNovo: true, candidatosAmbiguos: null };
      }
      if (err?.response?.status === 409) {
        return {
          ...itemAtual,
          codigo,
          imovelEncontrado: null,
          imovelNovo: false,
          candidatosAmbiguos: err.response.data?.candidatos || [],
        };
      }
      return itemAtual;
    }
  }

  async function handleArquivosChange(e) {
    const arquivos = [...e.target.files];
    if (arquivos.length === 0) return;
    setError('');
    setLoading(true);

    const novaFila = [];
    for (const arquivo of arquivos) {
      try {
        const form = new FormData();
        form.append('arquivo', arquivo);
        const { data } = await api.post('/lancamentos/extrair', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        novaFila.push({ arquivo, extracao: data, erro: null });
      } catch (err) {
        novaFila.push({ arquivo, extracao: null, erro: apiErrorMessage(err) });
      }
    }

    setFila(novaFila);
    setIndice(0);
    setResultados([]);
    setTerminado(false);
    setLoading(false);
    e.target.value = '';

    await abrirItem(novaFila, 0);
  }

  // Cadastro sem carnê - pro imóvel que acabou de chegar na imobiliária (sem
  // guia ainda) ou quando um PDF simplesmente não abre (escaneado,
  // corrompido). Reaproveita o mesmo assistente do zero, com campos em
  // branco pra preencher na mão em vez de vir de uma extração.
  async function cadastrarSemCarne() {
    const novaFila = [{ arquivo: null, extracao: extracaoVazia(), erro: null }];
    setFila(novaFila);
    setIndice(0);
    setResultados([]);
    setTerminado(false);
    await abrirItem(novaFila, 0);
  }

  async function abrirItem(novaFila, idx) {
    if (idx >= novaFila.length) {
      setTerminado(true);
      return;
    }
    const entrada = novaFila[idx];
    let base = itemVazio();

    if (entrada.erro) {
      // Sem extração usável - segue pro proximo automaticamente, registrando o erro.
      setResultados((prev) => [
        ...prev,
        { arquivo: entrada.arquivo?.name || '(cadastro manual)', status: 'erro', mensagem: entrada.erro },
      ]);
      await abrirItem(novaFila, idx + 1);
      return;
    }

    base.reajustePct = String(config?.reajustePadrao ?? 5);

    // A inscricao lida de dentro do PDF e mais confiavel que o codigo tirado
    // do nome do arquivo - só usa o nome do arquivo se a inscrição não bateu
    // com nada (ou bateu com mais de uma linha, tipo imóvel de rateio, caso
    // em que quem escolhe é o usuário no passo seguinte).
    const porInscricao = entrada.extracao.imoveisPorInscricao || [];
    if (porInscricao.length === 1) {
      const achado = porInscricao[0];
      base = await prefillPorCodigo(String(achado.codigo), base, achado.inscricaoIptu || achado.dati);
    } else if (porInscricao.length === 0 && entrada.extracao.codigoSugerido) {
      base = await prefillPorCodigo(entrada.extracao.codigoSugerido, base);
    }
    setItem(base);
    setIndice(idx);
    setStep(0);
  }

  function escolherTributo(t) {
    if (item.imovelEncontrado) {
      const quemPaga = t === 'IPTU' ? item.imovelEncontrado.quemPagaIptu : item.imovelEncontrado.quemPagaDati;
      atualizarItem({ tributo: t, quemPaga: quemPaga || item.quemPaga });
    } else {
      atualizarItem({ tributo: t });
    }
    setStep(1);
  }

  function escolherFormaPgto(forma) {
    const { resumoParcelas, cotaUnica: cotaUnicaSugerida } = fila[indice].extracao;
    const campos = { formaPgto: forma };

    if (forma === 'Cota única') {
      if (cotaUnicaSugerida.length > 1) {
        atualizarItem({ ...campos, escolhendoCotaUnica: true });
        return;
      }
      campos.cotaUnica = cotaUnicaSugerida.length === 1 ? String(cotaUnicaSugerida[0].valor) : '';
    } else {
      campos.parcela = resumoParcelas.parcela !== null ? String(resumoParcelas.parcela) : '';
      campos.ultimaParcela = resumoParcelas.ultimaParcela !== null ? String(resumoParcelas.ultimaParcela) : '';
    }
    atualizarItem(campos);
    setStep(2);
  }

  function escolherOpcaoCotaUnica(opcao) {
    atualizarItem({ cotaUnica: opcao ? String(opcao.valor) : '', escolhendoCotaUnica: false });
    setStep(2);
  }

  async function buscarImovelManual(codigo) {
    atualizarItem({ codigo });
    if (!codigo.trim()) return;
    setBuscandoImovel(true);
    const atualizado = await prefillPorCodigo(codigo.trim(), item);
    setItem(atualizado);
    setBuscandoImovel(false);
  }

  // Usado pelos seletores (grupo de rateio detectado pela inscrição do
  // carnê, ou candidatos de um código ambíguo) - já manda a inscrição certa
  // junto, pra não cair de novo em ambiguidade.
  async function escolherImovel(codigo, inscricao) {
    setBuscandoImovel(true);
    const atualizado = await prefillPorCodigo(String(codigo), item, inscricao);
    setItem(atualizado);
    setBuscandoImovel(false);
  }

  function valoresValidos() {
    if (item.formaPgto === 'Cota única') return item.cotaUnica !== '' && !isNaN(Number(item.cotaUnica));
    return item.parcela !== '' && !isNaN(Number(item.parcela));
  }

  // Valor total do carnê (o que o wizard já coletou no passo "valores") -
  // referência pra dividir entre as linhas do rateio. A divisão em si não é
  // automática: só serve de ponto de partida, cada linha é editável.
  function valorTotalReferenciaRateio() {
    return valorTotalDoItem(item, config?.listas?.nParcelas || 1);
  }

  // "Quem paga" é obrigatório em cada linha, mas quase sempre é o mesmo
  // pra todo o grupo do rateio - evita ter que escolher uma por uma.
  function aplicarQuemPagaTodos(valor) {
    setItem((prev) => ({
      ...prev,
      rateioMembros: prev.rateioMembros.map((m) => ({ ...m, quemPaga: valor })),
    }));
  }

  function atualizarMembro(key, campos) {
    setItem((prev) => ({
      ...prev,
      rateioMembros: prev.rateioMembros.map((m) => (m.key === key ? { ...m, ...campos } : m)),
    }));
  }

  function removerMembro(key) {
    setItem((prev) => ({ ...prev, rateioMembros: prev.rateioMembros.filter((m) => m.key !== key) }));
  }

  // Busca (ou inicia) o grupo de rateio pelo rótulo - se já existir, traz as
  // linhas que já fazem parte dele como sugestão (todas editáveis: dá pra
  // tirar quem não deve entrar dessa vez, ou adicionar outra). O valor de
  // cada linha começa como total/N (divisão igual), só um ponto de partida.
  async function buscarGrupoRateio(rotulo) {
    atualizarItem({ rateioRotulo: rotulo });
    if (!rotulo.trim()) return;
    setItem((prev) => ({ ...prev, rateioBuscando: true }));
    try {
      const { data } = await api.get(`/rateios/${encodeURIComponent(rotulo.trim())}`);
      const total = valorTotalReferenciaRateio();
      const n = data.imoveis.length || 1;
      const sugestao = total !== null ? String(Math.round((total / n) * 100) / 100) : '';
      const membros = data.imoveis.map((m) =>
        membroVazio({
          codigo: String(m.codigo),
          inscricaoIptu: m.inscricaoIptu || '',
          dati: m.dati || '',
          proprietario: m.proprietario || '',
          nominalIptu: m.nominalIptu || '',
          obs: m.obs || '',
          cotaUnica: item.formaPgto === 'Cota única' ? sugestao : '',
          parcela: item.formaPgto === 'Parcelado' ? sugestao : '',
          reajustePct: item.reajustePct,
          existente: true,
        })
      );
      setItem((prev) => ({ ...prev, rateioMembros: membros, rateioBuscando: false }));
    } catch (err) {
      setItem((prev) => ({ ...prev, rateioBuscando: false }));
      setError(apiErrorMessage(err));
    }
  }

  // Adiciona uma linha "I" ao grupo (existente na planilha ou nova) - busca
  // os dados pra prefilar proprietário/inscrição quando já existir.
  async function adicionarMembroRateio(codigoStr) {
    const codigo = codigoStr.trim();
    if (!codigo) return;
    if (item.rateioMembros.some((m) => m.codigo === codigo)) return;

    try {
      const { data } = await api.get(`/imoveis/${encodeURIComponent(codigo)}`);
      setItem((prev) => ({
        ...prev,
        rateioMembros: [
          ...prev.rateioMembros,
          membroVazio({
            codigo,
            inscricaoIptu: data.inscricaoIptu || '',
            dati: data.dati || '',
            proprietario: data.proprietario || '',
            nominalIptu: data.nominalIptu || '',
            reajustePct: item.reajustePct,
            existente: true,
          }),
        ],
      }));
    } catch (err) {
      if (err?.response?.status === 404) {
        setItem((prev) => ({
          ...prev,
          rateioMembros: [...prev.rateioMembros, membroVazio({ codigo, reajustePct: item.reajustePct, existente: false })],
        }));
      } else {
        setError(apiErrorMessage(err));
      }
    }
  }

  function somaMembrosRateio() {
    return item.rateioMembros.reduce((acc, m) => {
      const v = item.formaPgto === 'Cota única' ? Number(m.cotaUnica) : Number(m.parcela);
      return acc + (isNaN(v) ? 0 : v);
    }, 0);
  }

  function rateioValido() {
    return rateioPendencias().length === 0;
  }

  // Lista em português o que falta pra poder salvar - sem isso o botão só
  // fica desabilitado sem explicar por quê.
  function rateioPendencias() {
    const pendencias = [];
    if (!item.rateioRotulo.trim()) pendencias.push('informe o número do imóvel de rateio');
    if (item.rateioMembros.length === 0) pendencias.push('adicione ao menos uma linha "I"');
    const semValor = item.rateioMembros.filter((m) =>
      item.formaPgto === 'Cota única' ? m.cotaUnica === '' || isNaN(Number(m.cotaUnica)) : m.parcela === '' || isNaN(Number(m.parcela))
    );
    if (semValor.length > 0) pendencias.push(`falta valor em: ${semValor.map((m) => `I ${m.codigo || '(novo)'}`).join(', ')}`);
    const semQuemPaga = item.rateioMembros.filter((m) => !m.quemPaga);
    if (semQuemPaga.length > 0) pendencias.push(`falta "quem paga" em: ${semQuemPaga.map((m) => `I ${m.codigo || '(novo)'}`).join(', ')}`);
    return pendencias;
  }

  // Resposta "Sim" pra pergunta "é imóvel de rateio?": monta a lista de
  // membros a partir dos "I" cadastrados NA INSCRIÇÃO lida deste carnê (não
  // do grupo de rateio inteiro - um rótulo pode abranger outras inscrições
  // sem relação com este carnê específico). Se algum desses "I" já tiver o
  // rótulo marcado (coluna X), pré-preenche como sugestão de número.
  function iniciarRateioPorInscricao(candidatos) {
    const rotuloComum = (candidatos || [])
      .map((c) => c.imovelDeRateio)
      .find((v) => v !== null && v !== undefined && String(v).trim() !== '');
    const total = valorTotalReferenciaRateio();
    const n = (candidatos || []).length || 1;
    const sugestao = total !== null ? String(Math.round((total / n) * 100) / 100) : '';
    const membros = (candidatos || []).map((c) =>
      membroVazio({
        codigo: String(c.codigo),
        inscricaoIptu: c.inscricaoIptu || '',
        dati: c.dati || '',
        proprietario: c.proprietario || '',
        nominalIptu: c.nominalIptu || '',
        obs: c.obs || '',
        cotaUnica: item.formaPgto === 'Cota única' ? sugestao : '',
        parcela: item.formaPgto === 'Parcelado' ? sugestao : '',
        reajustePct: item.reajustePct,
        existente: true,
      })
    );
    setItem((prev) => ({
      ...prev,
      rateioPerguntaRespondida: true,
      modoRateio: true,
      rateioRotulo: rotuloComum ? String(rotuloComum) : '',
      rateioMembros: membros,
    }));
  }

  async function confirmarRateio() {
    setError('');
    setLoading(true);
    try {
      const form = new FormData();
      const arquivo = fila[indice].arquivo;
      if (arquivo) form.append('arquivo', arquivo, arquivo.name);
      form.append('rotulo', item.rateioRotulo.trim());
      form.append('tributo', item.tributo);

      const itens = item.rateioMembros.map((m) => {
        const it = {
          codigo: m.codigo.trim(),
          formaPgto: item.formaPgto,
          proprietario: m.proprietario || undefined,
          nominalIptu: m.nominalIptu || undefined,
          quemPaga: m.quemPaga || undefined,
          obs: m.obs || undefined,
        };
        if (item.tributo === 'IPTU') it.inscricaoIptu = m.inscricaoIptu || undefined;
        if (item.tributo === 'DATI') it.dati = m.dati || undefined;
        if (m.reajustePct !== '' && m.reajustePct !== undefined && m.reajustePct !== null) {
          it.reajustePct = m.reajustePct;
        }
        if (item.formaPgto === 'Cota única') {
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

      const sucesso = data.resultados.filter((r) => r.status === 'sucesso').length;
      const falha = data.resultados.filter((r) => r.status === 'erro');
      setResultados((prev) => [
        ...prev,
        {
          arquivo: arquivo?.name || '(cadastro manual)',
          status: falha.length === 0 ? 'sucesso' : 'erro',
          codigo: `rateio ${data.rotulo}`,
          mensagem:
            falha.length > 0
              ? `${sucesso} de ${data.resultados.length} linhas salvas — falhou: ${falha
                  .map((f) => `I ${f.codigo} (${f.mensagem})`)
                  .join('; ')}`
              : undefined,
        },
      ]);
      await abrirItem(fila, indice + 1);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirmar() {
    setError('');
    setLoading(true);
    try {
      const form = new FormData();
      const arquivo = fila[indice].arquivo;
      if (arquivo) form.append('arquivo', arquivo, arquivo.name);
      form.append('codigo', item.codigo.trim());
      form.append('tributo', item.tributo);
      form.append('formaPgto', item.formaPgto);
      form.append('proprietario', item.proprietario);
      form.append('nominalIptu', item.nominalIptu);
      if (item.tributo === 'IPTU') form.append('inscricaoIptu', item.inscricaoIptu);
      if (item.tributo === 'DATI') form.append('dati', item.dati);
      form.append('quemPaga', item.quemPaga);
      form.append('obs', item.obs);
      if (item.reajustePct !== '') form.append('reajustePct', item.reajustePct);

      if (item.formaPgto === 'Cota única') {
        form.append('cotaUnica', item.cotaUnica);
      } else {
        form.append('parcela', item.parcela);
        if (item.ultimaParcela !== '') form.append('ultimaParcela', item.ultimaParcela);
      }

      const { data } = await api.post('/lancamentos', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResultados((prev) => [
        ...prev,
        {
          arquivo: arquivo?.name || '(cadastro manual)',
          codigo: data.codigo,
          status: 'sucesso',
          criado: data.created,
          diferenca: data.diferenca,
          diferencaParcela: data.diferencaParcela,
        },
      ]);
      await abrirItem(fila, indice + 1);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function recomecar() {
    setFila([]);
    setIndice(0);
    setStep(0);
    setItem(itemVazio());
    setResultados([]);
    setTerminado(false);
    setError('');
  }

  if (config && config.xlsxExists === false) {
    return (
      <div className="page">
        <div className="card">
          <h3>Nenhuma planilha configurada</h3>
          <p className="meta">Escolha o arquivo .xlsx em Configurações antes de lançar um IPTU.</p>
        </div>
      </div>
    );
  }

  if (fila.length === 0) {
    return (
      <div className="page">
        <h2>Lançar IPTU / DATI</h2>
        <div className="card">
          <h3>Envie o(s) carnê(s) (PDF)</h3>
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleArquivosChange}
            disabled={loading}
          />
          {loading && <p>Lendo arquivo(s)...</p>}
          {error && <div className="error">{error}</div>}
          <p className="meta">
            Imóvel novo, sem carnê ainda (ou um PDF que não abre)?{' '}
            <button type="button" className="link-btn" onClick={cadastrarSemCarne}>
              Cadastrar sem carnê
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (terminado) {
    return (
      <div className="page">
        <div className="card success-card">
          <h2>Lançamentos concluídos</h2>
          <p>
            {resultados.filter((r) => r.status === 'sucesso').length} de {resultados.length} carnê(s)
            salvos na planilha.
          </p>
          <ul className="resumo-list">
            {resultados.map((r, i) => (
              <li key={i}>
                {r.status === 'sucesso' ? (
                  <>
                    ✓ {r.arquivo} — código <strong>{r.codigo}</strong>
                    {r.criado ? ' (linha nova)' : ''}
                    {r.diferenca !== null && r.diferenca !== undefined && (
                      <> — diferença total: {formatarMoeda(r.diferenca)}</>
                    )}
                    {r.diferencaParcela !== null && r.diferencaParcela !== undefined && (
                      <> (por parcela: {formatarMoeda(r.diferencaParcela)})</>
                    )}
                  </>
                ) : (
                  <>✗ {r.arquivo} — {r.mensagem}</>
                )}
              </li>
            ))}
          </ul>
          <button onClick={recomecar}>Lançar mais carnês</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Lançar IPTU / DATI</h2>
      <p className="meta">
        Carnê {indice + 1} de {fila.length} — {fila[indice].arquivo?.name || 'Cadastro manual (sem carnê)'}
      </p>
      <div className="steps-indicator">
        {STEPS.map((s, i) => (
          <div key={s} className={`step-dot ${i <= step ? 'active' : ''}`} />
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {step === 0 && (
        <div className="card">
          <h3>Esse carnê é de qual tributo?</h3>
          <div className="choice-row">
            <button onClick={() => escolherTributo('IPTU')}>IPTU</button>
            <button onClick={() => escolherTributo('DATI')}>DATI</button>
          </div>
        </div>
      )}

      {step === 1 && !item.escolhendoCotaUnica && (
        <div className="card">
          <h3>Cota única ou parcelado?</h3>
          <div className="choice-row">
            <button onClick={() => escolherFormaPgto('Cota única')}>Cota única</button>
            <button onClick={() => escolherFormaPgto('Parcelado')}>Parcelado</button>
          </div>
          <div className="actions-row">
            <button className="link-btn" onClick={() => setStep(0)}>
              ← Voltar
            </button>
          </div>
        </div>
      )}

      {step === 1 && item.escolhendoCotaUnica && (
        <div className="card">
          <h3>O arquivo tem mais de uma opção de cota única. Qual foi usada?</h3>
          <p className="meta">
            É comum o carnê trazer várias guias de pagamento à vista, com valores diferentes
            conforme a data (desconto por antecipação). Escolha a que corresponde ao pagamento
            feito.
          </p>
          <ul className="resumo-list">
            {fila[indice].extracao.cotaUnica.map((opcao, i) => (
              <li key={i}>
                <button className="choice-item" onClick={() => escolherOpcaoCotaUnica(opcao)}>
                  {formatarMoeda(opcao.valor)} — vencimento {formatarData(opcao.vencimento)}
                </button>
              </li>
            ))}
            <li>
              <button className="link-btn" onClick={() => escolherOpcaoCotaUnica(null)}>
                Nenhuma dessas — vou informar manualmente
              </button>
            </li>
          </ul>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h3>Conferir valor{item.formaPgto === 'Parcelado' ? 'es' : ''}</h3>
          {item.formaPgto === 'Cota única' ? (
            <label>
              Valor da cota única (R$)
              <input
                type="number"
                step="0.01"
                value={item.cotaUnica}
                onChange={(e) => atualizarItem({ cotaUnica: e.target.value })}
              />
            </label>
          ) : (
            <>
              <label>
                Valor da parcela (R$)
                <input
                  type="number"
                  step="0.01"
                  value={item.parcela}
                  onChange={(e) => atualizarItem({ parcela: e.target.value })}
                />
              </label>
              <label>
                Valor da última parcela (R$, deixe igual se não houver diferença)
                <input
                  type="number"
                  step="0.01"
                  value={item.ultimaParcela}
                  onChange={(e) => atualizarItem({ ultimaParcela: e.target.value })}
                />
              </label>
              {config?.listas?.nParcelas && (
                <p className="meta">
                  Total calculado ({config.listas.nParcelas}x):{' '}
                  {formatarMoeda(valorTotalDoItem(item, config.listas.nParcelas))}
                </p>
              )}
            </>
          )}

          {valoresValidos() && (
            <div className="card destaque">
              <label>
                % de reajuste estimado pro próximo exercício
                <input
                  type="number"
                  step="0.1"
                  value={item.reajustePct}
                  onChange={(e) => atualizarItem({ reajustePct: e.target.value })}
                />
              </label>
              <p className="meta">
                Valor com reajuste (provisório):{' '}
                <strong>
                  {formatarMoeda(
                    (() => {
                      const total = valorTotalDoItem(item, config?.listas?.nParcelas || 1);
                      const pct = Number(item.reajustePct);
                      return total === null || isNaN(pct) ? null : total * (1 + pct / 100);
                    })()
                  )}
                </strong>
              </p>
              {item.formaPgto === 'Parcelado' &&
                item.parcela !== '' &&
                !isNaN(Number(item.reajustePct)) &&
                (() => {
                  const pct = Number(item.reajustePct);
                  const parcelaAjustada = Number(item.parcela) * (1 + pct / 100);
                  const ultimaBase = item.ultimaParcela === '' ? item.parcela : item.ultimaParcela;
                  const ultimaAjustada = Number(ultimaBase) * (1 + pct / 100);
                  return (
                    <p className="meta">
                      Parcela ajustada: <strong>{formatarMoeda(parcelaAjustada)}</strong>
                      {ultimaAjustada !== parcelaAjustada && (
                        <>
                          {' '}
                          (última: <strong>{formatarMoeda(ultimaAjustada)}</strong>)
                        </>
                      )}
                    </p>
                  );
                })()}
            </div>
          )}

          <div className="actions-row">
            <button className="link-btn" onClick={() => setStep(1)}>
              ← Voltar
            </button>
            <button disabled={!valoresValidos()} onClick={() => setStep(3)}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h3>Código de identificação do imóvel</h3>

          {!item.rateioPerguntaRespondida && (() => {
            const { inscricaoDetectada, imoveisPorInscricao } = fila[indice]?.extracao || {};
            return (
              <div className="card destaque">
                <p className="meta">
                  {inscricaoDetectada ? (
                    <>
                      Inscrição lida do carnê: <strong>{inscricaoDetectada}</strong>
                      {(imoveisPorInscricao || []).length > 0 && (
                        <>
                          {' '}
                          — cadastrada em {imoveisPorInscricao.length} linha(s) "I" (
                          {imoveisPorInscricao.map((c) => c.codigo).join(', ')}).
                        </>
                      )}
                    </>
                  ) : fila[indice].arquivo ? (
                    'Não consegui identificar a inscrição dentro do PDF.'
                  ) : (
                    'Cadastro manual — sem inscrição pra identificar automaticamente.'
                  )}
                </p>
                <p className="meta">Este é um imóvel de rateio (o valor se divide entre várias linhas "I")?</p>
                <div className="choice-row">
                  <button onClick={() => iniciarRateioPorInscricao(imoveisPorInscricao)}>Sim, é rateio</button>
                  <button
                    className="link-btn"
                    onClick={() => atualizarItem({ rateioPerguntaRespondida: true, modoRateio: false })}
                  >
                    Não
                  </button>
                </div>
                <div className="actions-row">
                  <button className="link-btn" onClick={() => setStep(2)}>
                    ← Voltar
                  </button>
                </div>
              </div>
            );
          })()}

          {item.rateioPerguntaRespondida && item.modoRateio && (
            <div className="card destaque">
              <label>
                Número do imóvel de rateio (não é o código "I" — é o número usado no sistema contábil)
                <input
                  value={item.rateioRotulo}
                  onChange={(e) => atualizarItem({ rateioRotulo: e.target.value })}
                  onBlur={(e) => {
                    if (item.rateioMembros.length === 0) buscarGrupoRateio(e.target.value);
                  }}
                  placeholder="ex: 837"
                />
              </label>
              {item.rateioMembros.length === 0 && (
                <p className="meta">
                  Nenhum "I" identificado nessa inscrição ainda — digite o número acima (se já existir um grupo,
                  ele é buscado automaticamente) e adicione as linhas manualmente abaixo.
                </p>
              )}
              {item.rateioBuscando && <p className="meta">Buscando linhas desse grupo...</p>}

              {item.rateioMembros.length > 0 && (
                <>
                  <label>
                    Quem paga (aplica a todas as linhas abaixo)
                    <select value="" onChange={(e) => e.target.value && aplicarQuemPagaTodos(e.target.value)}>
                      <option value="">— escolher pra todas —</option>
                      {(config?.listas?.quemPagaOpcoes || []).map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="meta">
                    Valor de referência do carnê: {formatarMoeda(valorTotalReferenciaRateio())} — soma das linhas
                    abaixo: {formatarMoeda(somaMembrosRateio())}
                    {(() => {
                      const total = valorTotalReferenciaRateio();
                      const soma = somaMembrosRateio();
                      if (total === null) return null;
                      const diff = Math.round((soma - total) * 100) / 100;
                      return diff !== 0 ? <> — diferença: {formatarMoeda(diff)}</> : <> ✓</>;
                    })()}
                  </p>
                  <ul className="resumo-list">
                    {item.rateioMembros.map((m) => (
                      <li key={m.key} className="card">
                        <strong>I {m.codigo || '(novo)'}</strong> — {m.nominalIptu || m.proprietario || 'sem nome'}
                        {!m.existente && ' (linha nova)'}
                        <button type="button" className="link-btn" onClick={() => removerMembro(m.key)}>
                          remover
                        </button>
                        <label>
                          Proprietário
                          <input
                            value={m.proprietario}
                            onChange={(e) => atualizarMembro(m.key, { proprietario: e.target.value })}
                          />
                        </label>
                        {item.tributo === 'IPTU' ? (
                          <label>
                            Inscrição IPTU
                            <input
                              value={m.inscricaoIptu}
                              onChange={(e) => atualizarMembro(m.key, { inscricaoIptu: e.target.value })}
                            />
                          </label>
                        ) : (
                          <label>
                            Inscrição DATI
                            <input value={m.dati} onChange={(e) => atualizarMembro(m.key, { dati: e.target.value })} />
                          </label>
                        )}
                        <label>
                          Quem paga
                          <select value={m.quemPaga} onChange={(e) => atualizarMembro(m.key, { quemPaga: e.target.value })}>
                            <option value="">—</option>
                            {(config?.listas?.quemPagaOpcoes || []).map((op) => (
                              <option key={op} value={op}>
                                {op}
                              </option>
                            ))}
                          </select>
                        </label>
                        {item.formaPgto === 'Cota única' ? (
                          <label>
                            Valor desta linha (R$)
                            <input
                              type="number"
                              step="0.01"
                              value={m.cotaUnica}
                              onChange={(e) => atualizarMembro(m.key, { cotaUnica: e.target.value })}
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
                                onChange={(e) => atualizarMembro(m.key, { parcela: e.target.value })}
                              />
                            </label>
                            <label>
                              Última parcela (R$, deixe em branco se igual)
                              <input
                                type="number"
                                step="0.01"
                                value={m.ultimaParcela}
                                onChange={(e) => atualizarMembro(m.key, { ultimaParcela: e.target.value })}
                              />
                            </label>
                          </>
                        )}
                        <label>
                          % de reajuste (provisão pro próximo exercício desta linha)
                          <input
                            type="number"
                            step="0.1"
                            value={m.reajustePct}
                            onChange={(e) => atualizarMembro(m.key, { reajustePct: e.target.value })}
                          />
                        </label>
                        {(() => {
                          const valorBase = item.formaPgto === 'Cota única' ? Number(m.cotaUnica) : Number(m.parcela);
                          const pct = Number(m.reajustePct);
                          if (isNaN(valorBase) || isNaN(pct) || m.reajustePct === '') return null;
                          return (
                            <p className="meta">Valor programado (com reajuste): {formatarMoeda(valorBase * (1 + pct / 100))}</p>
                          );
                        })()}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <label>
                Adicionar linha "I" ao grupo
                <input
                  placeholder="código, aperte Enter"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      adicionarMembroRateio(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </label>

              {!rateioValido() && rateioPendencias().length > 0 && (
                <p className="meta">Falta pra salvar: {rateioPendencias().join(' · ')}</p>
              )}

              <div className="actions-row">
                <button
                  className="link-btn"
                  onClick={() => atualizarItem({ rateioPerguntaRespondida: false, modoRateio: false })}
                >
                  ← Voltar
                </button>
                <button disabled={!rateioValido() || loading} onClick={confirmarRateio}>
                  {loading ? 'Salvando...' : 'Salvar rateio na planilha'}
                </button>
              </div>
            </div>
          )}

          {item.rateioPerguntaRespondida && !item.modoRateio && (
            <>
              {(item.candidatosAmbiguos || []).length > 0 && (
                <div className="card destaque">
                  <p className="meta">
                    O código <strong>I {item.codigo}</strong> existe em mais de uma linha da planilha — escolha qual:
                  </p>
                  <ul className="resumo-list">
                    {item.candidatosAmbiguos.map((c, i) => (
                      <li key={`${c.codigo}-${c.inscricaoIptu || c.dati || i}`}>
                        <button
                          className="link-btn"
                          onClick={() => escolherImovel(c.codigo, c.inscricaoIptu || c.dati)}
                        >
                          I {c.codigo} — {c.nominalIptu || c.proprietario} — inscrição{' '}
                          {c.inscricaoIptu || c.dati || 'sem inscrição'}
                          {c.obs ? ` (${c.obs})` : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <label>
                Código (coluna "I" da planilha)
                <input
                  value={item.codigo}
                  onChange={(e) =>
                    atualizarItem({ codigo: e.target.value, imovelEncontrado: null, imovelNovo: false, candidatosAmbiguos: null })
                  }
                  onBlur={(e) => buscarImovelManual(e.target.value)}
                  placeholder="ex: 213"
                />
              </label>
              {buscandoImovel && <p className="meta">Buscando na planilha...</p>}

              {item.imovelEncontrado && (
                <div className="success">
                  Imóvel encontrado: {item.imovelEncontrado.proprietario}
                  {(fila[indice]?.extracao?.imoveisPorInscricao || []).length === 1 &&
                    String(fila[indice].extracao.imoveisPorInscricao[0].codigo) === String(item.codigo) && (
                      <> (identificado pela inscrição do carnê)</>
                    )}
                </div>
              )}
              {item.imovelNovo && (
                <div className="meta">Código não encontrado na planilha — será criada uma linha nova.</div>
              )}

              {(item.imovelEncontrado || item.imovelNovo) && (
                <>
                  <label>
                    Proprietário
                    <input value={item.proprietario} onChange={(e) => atualizarItem({ proprietario: e.target.value })} />
                  </label>
                  <label>
                    Nome no carnê do IPTU/DATI (se diferente do proprietário)
                    <input
                      value={item.nominalIptu}
                      onChange={(e) => atualizarItem({ nominalIptu: e.target.value })}
                      placeholder="deixe em branco se for o mesmo nome"
                    />
                  </label>
                  {item.tributo === 'IPTU' && (
                    <label>
                      Inscrição IPTU
                      <input value={item.inscricaoIptu} onChange={(e) => atualizarItem({ inscricaoIptu: e.target.value })} />
                    </label>
                  )}
                  {item.tributo === 'DATI' && (
                    <label>
                      Inscrição DATI
                      <input value={item.dati} onChange={(e) => atualizarItem({ dati: e.target.value })} />
                    </label>
                  )}
                </>
              )}

              <div className="actions-row">
                <button className="link-btn" onClick={() => atualizarItem({ rateioPerguntaRespondida: false })}>
                  ← Voltar
                </button>
                <button
                  disabled={!item.codigo.trim() || !(item.imovelEncontrado || item.imovelNovo) || !item.proprietario.trim()}
                  onClick={() => setStep(4)}
                >
                  Continuar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <h3>Quem paga e confirmação</h3>
          <label>
            Quem paga o {item.tributo}
            <select value={item.quemPaga} onChange={(e) => atualizarItem({ quemPaga: e.target.value })}>
              <option value="">Selecione...</option>
              {(config?.listas?.quemPagaOpcoes || []).map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </label>
          <label>
            Observações (opcional)
            <input value={item.obs} onChange={(e) => atualizarItem({ obs: e.target.value })} />
          </label>

          <ul className="resumo-list">
            <li>
              <strong>Código:</strong> {item.codigo}
            </li>
            <li>
              <strong>Tributo:</strong> {item.tributo}
            </li>
            <li>
              <strong>Forma:</strong> {item.formaPgto}
            </li>
            <li>
              <strong>Valor:</strong>{' '}
              {item.formaPgto === 'Cota única' ? formatarMoeda(item.cotaUnica) : formatarMoeda(item.parcela)}
              {item.formaPgto === 'Parcelado' && item.ultimaParcela !== '' && item.ultimaParcela !== item.parcela && (
                <> (última: {formatarMoeda(item.ultimaParcela)})</>
              )}
            </li>
          </ul>

          {(() => {
            const provisaoAnterior =
              item.tributo === 'IPTU'
                ? item.imovelEncontrado?.iptuProvisaoProximoAno
                : item.imovelEncontrado?.datiProvisaoProximoAno;
            if (provisaoAnterior === null || provisaoAnterior === undefined) return null;
            const total = valorTotalDoItem(item, config?.listas?.nParcelas || 1);
            const diferenca = total === null ? null : total - provisaoAnterior;

            const provisaoParcelaAnterior =
              item.tributo === 'IPTU'
                ? item.imovelEncontrado?.iptuProvisaoParcela
                : item.imovelEncontrado?.datiProvisaoParcela;
            const provisaoUltimaParcelaAnterior =
              item.tributo === 'IPTU'
                ? item.imovelEncontrado?.iptuProvisaoUltimaParcela
                : item.imovelEncontrado?.datiProvisaoUltimaParcela;

            const mostrarPorParcela =
              item.formaPgto === 'Parcelado' &&
              provisaoParcelaAnterior !== null &&
              provisaoParcelaAnterior !== undefined;
            const diferencaParcela = mostrarPorParcela ? Number(item.parcela) - provisaoParcelaAnterior : null;
            const ultimaReal = item.ultimaParcela === '' ? item.parcela : item.ultimaParcela;
            const diferencaUltimaParcela =
              mostrarPorParcela && provisaoUltimaParcelaAnterior !== null && provisaoUltimaParcelaAnterior !== undefined
                ? Number(ultimaReal) - provisaoUltimaParcelaAnterior
                : null;

            return (
              <div className="card destaque">
                <p className="meta">Já havia uma provisão de um lançamento anterior pra este imóvel:</p>
                <ul className="resumo-list">
                  <li>Provisionado: {formatarMoeda(provisaoAnterior)}</li>
                  <li>Valor real agora: {formatarMoeda(total)}</li>
                  <li>
                    <strong>Diferença total: {formatarMoeda(diferenca)}</strong>
                  </li>
                  {mostrarPorParcela && (
                    <>
                      <li>Parcela provisionada: {formatarMoeda(provisaoParcelaAnterior)}</li>
                      <li>
                        <strong>Diferença por parcela (devolver/cobrar): {formatarMoeda(diferencaParcela)}</strong>
                      </li>
                      {diferencaUltimaParcela !== null && diferencaUltimaParcela !== diferencaParcela && (
                        <li>
                          <strong>Diferença na última parcela: {formatarMoeda(diferencaUltimaParcela)}</strong>
                        </li>
                      )}
                    </>
                  )}
                </ul>
              </div>
            );
          })()}

          <div className="actions-row">
            <button className="link-btn" onClick={() => setStep(3)} disabled={loading}>
              ← Voltar
            </button>
            <button onClick={confirmar} disabled={loading || !item.quemPaga}>
              {loading ? 'Salvando...' : 'Salvar na planilha'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
