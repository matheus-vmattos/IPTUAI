// API falsa usada só na build de demonstração (portfólio) — mesma
// "forma" (get/post/patch/put + apiErrorMessage) da api.js real, mas
// respondendo com dados 100% fictícios guardados em memória do navegador.
// Nada daqui é enviado pra nenhum servidor; some ao fechar a aba.

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function jitter() {
  return 180 + Math.random() * 280;
}

class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || 'Erro');
    this.response = { status, data };
  }
}

export function apiErrorMessage(err) {
  return err?.response?.data?.error || err.message || 'Erro inesperado';
}

const LISTAS = {
  exercicio: 2026,
  nParcelas: 10,
  quemPagaOpcoes: [
    'Valoriza paga',
    'Repassado — locatário paga',
    'Proprietário paga direto',
    'Locatário paga direto',
    'Não cobrar / isento',
  ],
  formaPgtoOpcoes: ['Cota única', 'Parcelado'],
  conferenciaOpcoes: ['Feito', 'Não se aplica'],
};

let CONFIG = {
  xlsxPath: 'DEMO/Projeto_IPTU (demonstração).xlsx',
  pdfFolder: 'DEMO/carnês',
  reajustePadrao: 5,
  modoLeitura: false,
};

function linhaBase(overrides) {
  return {
    codigo: '',
    proprietario: '',
    nominalIptu: '',
    inscricaoIptu: '',
    dati: '',
    quemPagaIptu: '',
    quemPagaDati: '',
    formaPgto: '',
    iptuCotaUnica: '',
    iptuParcela: '',
    iptuUltimaParcela: '',
    iptuProvisaoProximoAno: null,
    iptuProvisaoParcela: null,
    iptuProvisaoUltimaParcela: null,
    iptuLancado: 'Não',
    datiCotaUnica: '',
    datiParcela: '',
    datiUltimaParcela: '',
    datiProvisaoProximoAno: null,
    datiProvisaoParcela: null,
    datiProvisaoUltimaParcela: null,
    datiLancado: 'Não',
    imovelDeRateio: '',
    obs: '',
    linkCarne: '',
    ...overrides,
  };
}

let DB = [
  linhaBase({
    codigo: '101',
    proprietario: 'João Costa',
    inscricaoIptu: '10001-1',
    formaPgto: 'Cota única',
    iptuCotaUnica: '1280.40',
    iptuLancado: 'Feito',
    quemPagaIptu: 'Valoriza paga',
    linkCarne: 'I101-iptu-2026.pdf',
  }),
  linhaBase({
    codigo: '102',
    proprietario: 'João Costa',
    inscricaoIptu: '10002-2',
    iptuProvisaoProximoAno: 1900,
    iptuProvisaoParcela: 190,
    iptuProvisaoUltimaParcela: 190,
  }),
  linhaBase({ codigo: '103', proprietario: 'Maria Fernandes', dati: '10003-3' }),
  linhaBase({
    codigo: '201',
    proprietario: 'Condomínio Aurora',
    inscricaoIptu: '20001-1',
    imovelDeRateio: '500',
    formaPgto: 'Cota única',
    iptuCotaUnica: '980.00',
    iptuLancado: 'Feito',
    quemPagaIptu: 'Proprietário paga direto',
  }),
  linhaBase({
    codigo: '202',
    proprietario: 'Condomínio Aurora',
    inscricaoIptu: '20001-1',
    imovelDeRateio: '500',
    formaPgto: 'Cota única',
    iptuCotaUnica: '1020.00',
    iptuLancado: 'Feito',
    quemPagaIptu: 'Proprietário paga direto',
  }),
  linhaBase({
    codigo: '203',
    proprietario: 'Condomínio Aurora',
    inscricaoIptu: '20002-2',
    imovelDeRateio: '500',
    formaPgto: 'Cota única',
    iptuCotaUnica: '745.50',
    iptuLancado: 'Feito',
    quemPagaIptu: 'Proprietário paga direto',
  }),
  linhaBase({
    codigo: '301',
    proprietario: 'Pedro Alves',
    inscricaoIptu: '30002-1',
    formaPgto: 'Cota única',
    iptuCotaUnica: '615.20',
    iptuLancado: 'Feito',
    quemPagaIptu: 'Locatário paga direto',
    obs: 'IPTU do terreno',
  }),
  linhaBase({
    codigo: '301',
    proprietario: 'Pedro Alves',
    inscricaoIptu: '30009-9',
    obs: 'IPTU da construção — 2º IPTU do mesmo I',
  }),
  linhaBase({
    codigo: '401',
    proprietario: 'Ana Beatriz',
    nominalIptu: 'Ana Beatriz Comércio Ltda ME',
    inscricaoIptu: '40001-1',
    formaPgto: 'Cota única',
    iptuCotaUnica: '2100.00',
    iptuLancado: 'Feito',
    quemPagaIptu: 'Valoriza paga',
  }),
  linhaBase({
    codigo: '402',
    proprietario: 'Carlos Eduardo',
    inscricaoIptu: '40002-2',
    iptuProvisaoProximoAno: 3200,
    iptuProvisaoParcela: 320,
    iptuProvisaoUltimaParcela: 315,
  }),
  linhaBase({ codigo: '403', proprietario: 'Carlos Eduardo', dati: '40003-3' }),
  linhaBase({
    codigo: '501',
    proprietario: 'Rita Nascimento',
    inscricaoIptu: '50001-1',
    formaPgto: 'Cota única',
    iptuCotaUnica: '860.75',
    iptuLancado: 'Feito',
    quemPagaIptu: 'Não cobrar / isento',
  }),
  linhaBase({ codigo: '502', proprietario: 'Rita Nascimento', inscricaoIptu: '50002-2' }),
];

function totalCalculado(cotaUnica, parcela, ultimaParcela, formaPgto) {
  if (formaPgto === 'Cota única') return cotaUnica === '' || cotaUnica == null ? null : Number(cotaUnica);
  if (formaPgto === 'Parcelado') {
    if (parcela === '' || parcela == null) return null;
    const ultima = ultimaParcela === '' || ultimaParcela == null ? Number(parcela) : Number(ultimaParcela);
    return Math.round((Number(parcela) * (LISTAS.nParcelas - 1) + ultima) * 100) / 100;
  }
  return null;
}

function comTotais(row) {
  const iptuTotalCalculado = totalCalculado(row.iptuCotaUnica, row.iptuParcela, row.iptuUltimaParcela, row.formaPgto);
  const datiTotalCalculado = totalCalculado(row.datiCotaUnica, row.datiParcela, row.datiUltimaParcela, row.formaPgto);
  const soma = (iptuTotalCalculado || 0) + (datiTotalCalculado || 0);
  return {
    ...row,
    iptuTotalCalculado,
    datiTotalCalculado,
    valorAPagarCalculado: soma > 0 ? Math.round(soma * 100) / 100 : null,
  };
}

function candidatoShape(r) {
  return {
    codigo: r.codigo,
    inscricaoIptu: r.inscricaoIptu,
    dati: r.dati,
    proprietario: r.proprietario,
    nominalIptu: r.nominalIptu,
    obs: r.obs,
    imovelDeRateio: r.imovelDeRateio,
  };
}

function encontrarLinha(codigo, inscricao) {
  const linhas = DB.filter((r) => String(r.codigo) === String(codigo));
  if (linhas.length === 0) throw new ApiError(404, { error: 'Imóvel não encontrado' });
  if (linhas.length === 1) return linhas[0];
  if (inscricao) {
    const bateram = linhas.filter((r) => r.inscricaoIptu === inscricao || r.dati === inscricao);
    if (bateram.length === 1) return bateram[0];
  }
  throw new ApiError(409, {
    error: `Código I ${codigo} encontrado em mais de uma linha — informe a inscrição.`,
    candidatos: linhas.map(candidatoShape),
  });
}

function montarGrupoRateio(rotulo) {
  const membros = DB.filter((r) => r.imovelDeRateio === rotulo).map(comTotais);
  const porInscricaoMap = new Map();
  for (const m of membros) {
    const chave = m.inscricaoIptu || m.dati || null;
    if (!porInscricaoMap.has(chave)) porInscricaoMap.set(chave, []);
    porInscricaoMap.get(chave).push(m);
  }
  const porInscricao = [...porInscricaoMap.entries()].map(([inscricao, imoveis]) => ({ inscricao, imoveis }));
  const somaSe = (pred, campo) => {
    const f = membros.filter(pred);
    if (f.length === 0) return null;
    return Math.round(f.reduce((acc, m) => acc + (Number(m[campo]) || 0), 0) * 100) / 100;
  };
  return {
    rotuloContabil: rotulo,
    totalImoveis: membros.length,
    imoveis: membros,
    porInscricao,
    totais: {
      iptuCotaUnica: somaSe((m) => m.formaPgto === 'Cota única', 'iptuCotaUnica'),
      iptuParcelado: somaSe((m) => m.formaPgto === 'Parcelado', 'iptuTotalCalculado'),
      datiCotaUnica: somaSe((m) => m.formaPgto === 'Cota única', 'datiCotaUnica'),
      datiParcelado: somaSe((m) => m.formaPgto === 'Parcelado', 'datiTotalCalculado'),
    },
  };
}

function objFromFormData(fd) {
  const out = {};
  for (const [k, v] of fd.entries()) out[k] = v;
  return out;
}

function lancarInterno(f) {
  const tributo = f.tributo;
  const inscricaoAlvo = tributo === 'IPTU' ? f.inscricaoIptu : f.dati;
  const codigo = String(f.codigo).trim();
  const linhasDoCodigo = DB.filter((r) => String(r.codigo) === codigo);
  let row = linhasDoCodigo.find((r) =>
    tributo === 'IPTU' ? !r.inscricaoIptu || r.inscricaoIptu === inscricaoAlvo : !r.dati || r.dati === inscricaoAlvo
  );
  let created = false;
  if (!row) {
    row = linhaBase({ codigo });
    DB.push(row);
    created = true;
  }

  row.proprietario = f.proprietario || row.proprietario;
  row.nominalIptu = f.nominalIptu || row.nominalIptu;
  row.obs = f.obs || row.obs;
  row.formaPgto = f.formaPgto;
  if (f.arquivo?.name) row.linkCarne = f.arquivo.name;

  const provisaoAnteriorTotal = tributo === 'IPTU' ? row.iptuProvisaoProximoAno : row.datiProvisaoProximoAno;
  const provisaoAnteriorParcela = tributo === 'IPTU' ? row.iptuProvisaoParcela : row.datiProvisaoParcela;

  if (tributo === 'IPTU') {
    row.inscricaoIptu = f.inscricaoIptu || row.inscricaoIptu;
    row.quemPagaIptu = f.quemPaga || row.quemPagaIptu;
    row.iptuLancado = 'Feito';
    if (f.formaPgto === 'Cota única') {
      row.iptuCotaUnica = f.cotaUnica;
      row.iptuParcela = '';
      row.iptuUltimaParcela = '';
    } else {
      row.iptuParcela = f.parcela;
      row.iptuUltimaParcela = f.ultimaParcela || f.parcela;
      row.iptuCotaUnica = '';
    }
  } else {
    row.dati = f.dati || row.dati;
    row.quemPagaDati = f.quemPaga || row.quemPagaDati;
    row.datiLancado = 'Feito';
    if (f.formaPgto === 'Cota única') {
      row.datiCotaUnica = f.cotaUnica;
      row.datiParcela = '';
      row.datiUltimaParcela = '';
    } else {
      row.datiParcela = f.parcela;
      row.datiUltimaParcela = f.ultimaParcela || f.parcela;
      row.datiCotaUnica = '';
    }
  }

  const totalAgora = totalCalculado(
    tributo === 'IPTU' ? row.iptuCotaUnica : row.datiCotaUnica,
    tributo === 'IPTU' ? row.iptuParcela : row.datiParcela,
    tributo === 'IPTU' ? row.iptuUltimaParcela : row.datiUltimaParcela,
    f.formaPgto
  );

  let diferenca = null;
  let diferencaParcela = null;
  if (provisaoAnteriorTotal != null && totalAgora != null) {
    diferenca = Math.round((totalAgora - provisaoAnteriorTotal) * 100) / 100;
  }
  if (f.formaPgto === 'Parcelado' && provisaoAnteriorParcela != null && f.parcela !== '') {
    diferencaParcela = Math.round((Number(f.parcela) - provisaoAnteriorParcela) * 100) / 100;
  }

  const reajustePct = f.reajustePct !== undefined && f.reajustePct !== '' ? Number(f.reajustePct) : null;
  if (reajustePct !== null && totalAgora != null) {
    const novaProvisao = Math.round(totalAgora * (1 + reajustePct / 100) * 100) / 100;
    if (tributo === 'IPTU') row.iptuProvisaoProximoAno = novaProvisao;
    else row.datiProvisaoProximoAno = novaProvisao;
    if (f.formaPgto === 'Parcelado') {
      const parcelaAjustada = Math.round(Number(f.parcela) * (1 + reajustePct / 100) * 100) / 100;
      const ultimaBase = f.ultimaParcela || f.parcela;
      const ultimaAjustada = Math.round(Number(ultimaBase) * (1 + reajustePct / 100) * 100) / 100;
      if (tributo === 'IPTU') {
        row.iptuProvisaoParcela = parcelaAjustada;
        row.iptuProvisaoUltimaParcela = ultimaAjustada;
      } else {
        row.datiProvisaoParcela = parcelaAjustada;
        row.datiProvisaoUltimaParcela = ultimaAjustada;
      }
    }
  }

  return { codigo: row.codigo, created, diferenca, diferencaParcela };
}

let presetIndex = 0;
const PRESETS_EXTRACAO = [
  {
    cotaUnica: [],
    resumoParcelas: { parcela: 189.32, ultimaParcela: 189.4 },
    inscricaoDetectada: '10002-2',
    imoveisPorInscricao: [
      { codigo: '102', inscricaoIptu: '10002-2', dati: '', proprietario: 'João Costa', nominalIptu: '', obs: '' },
    ],
    codigoSugerido: null,
  },
  {
    cotaUnica: [{ valor: 980.0, vencimento: '2026-03-10' }],
    resumoParcelas: { parcela: null, ultimaParcela: null },
    inscricaoDetectada: '20001-1',
    imoveisPorInscricao: [
      {
        codigo: '201',
        inscricaoIptu: '20001-1',
        dati: '',
        proprietario: 'Condomínio Aurora',
        nominalIptu: '',
        obs: '',
        imovelDeRateio: '500',
      },
      {
        codigo: '202',
        inscricaoIptu: '20001-1',
        dati: '',
        proprietario: 'Condomínio Aurora',
        nominalIptu: '',
        obs: '',
        imovelDeRateio: '500',
      },
    ],
    codigoSugerido: null,
  },
  {
    cotaUnica: [
      { valor: 1450.0, vencimento: '2026-03-10' },
      { valor: 1500.0, vencimento: '2026-04-10' },
    ],
    resumoParcelas: { parcela: null, ultimaParcela: null },
    inscricaoDetectada: '60001-1',
    imoveisPorInscricao: [],
    codigoSugerido: null,
  },
  {
    cotaUnica: [{ valor: 615.2, vencimento: '2026-02-20' }],
    resumoParcelas: { parcela: null, ultimaParcela: null },
    inscricaoDetectada: '30009-9',
    imoveisPorInscricao: [],
    codigoSugerido: '301',
  },
];

function extrairPdf() {
  const preset = PRESETS_EXTRACAO[presetIndex % PRESETS_EXTRACAO.length];
  presetIndex += 1;
  return JSON.parse(JSON.stringify(preset));
}

function handle(method, url, body, config) {
  if (method !== 'GET' && !url.startsWith('/config') && CONFIG.modoLeitura) {
    throw new ApiError(403, { error: 'Modo somente leitura ativado — lançamentos e edições estão desativados.' });
  }

  const params = config?.params || {};
  const path = url.split('?')[0];
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);

  if (method === 'GET' && parts[0] === 'config') {
    return { ...CONFIG, xlsxExists: true, listas: LISTAS, listasErro: null };
  }
  if (method === 'PUT' && parts[0] === 'config') {
    const { xlsxPath, pdfFolder, reajustePadrao, modoLeitura } = body;
    if (xlsxPath !== undefined) CONFIG.xlsxPath = xlsxPath;
    if (pdfFolder !== undefined) CONFIG.pdfFolder = pdfFolder;
    if (reajustePadrao !== undefined) CONFIG.reajustePadrao = Number(reajustePadrao);
    if (modoLeitura !== undefined) CONFIG.modoLeitura = Boolean(modoLeitura);
    return { ...CONFIG };
  }
  if (method === 'GET' && parts[0] === 'imoveis' && parts.length === 1) {
    const alvo = (params.q || '').trim().toLowerCase();
    if (!alvo) return [];
    return DB.filter(
      (r) =>
        String(r.codigo).toLowerCase().includes(alvo) ||
        (r.proprietario || '').toLowerCase().includes(alvo) ||
        (r.nominalIptu || '').toLowerCase().includes(alvo) ||
        (r.inscricaoIptu || '').toLowerCase().includes(alvo) ||
        (r.dati || '').toLowerCase().includes(alvo)
    ).map(candidatoShape);
  }
  if (method === 'GET' && parts[0] === 'imoveis' && parts.length === 2) {
    const row = encontrarLinha(parts[1], params.inscricao);
    const full = comTotais(row);
    if (row.imovelDeRateio) full.grupoRateio = montarGrupoRateio(row.imovelDeRateio);
    return full;
  }
  if (method === 'PATCH' && parts[0] === 'imoveis' && parts.length === 3 && parts[2] === 'lancado') {
    const row = encontrarLinha(parts[1], body.inscricao);
    if (body.tributo === 'IPTU') row.iptuLancado = body.status;
    else row.datiLancado = body.status;
    return comTotais(row);
  }
  if (method === 'PATCH' && parts[0] === 'imoveis' && parts.length === 2) {
    const row = encontrarLinha(parts[1], params.inscricao);
    Object.assign(row, body);
    return comTotais(row);
  }
  if (method === 'GET' && parts[0] === 'rateios' && parts.length === 1) {
    const map = new Map();
    for (const r of DB) {
      if (!r.imovelDeRateio) continue;
      if (!map.has(r.imovelDeRateio)) map.set(r.imovelDeRateio, []);
      map.get(r.imovelDeRateio).push(candidatoShape(r));
    }
    return [...map.entries()]
      .map(([rotuloContabil, imoveis]) => ({ rotuloContabil, totalImoveis: imoveis.length, imoveis }))
      .sort((a, b) => a.rotuloContabil.localeCompare(b.rotuloContabil));
  }
  if (method === 'GET' && parts[0] === 'rateios' && parts.length === 2) {
    return montarGrupoRateio(parts[1]);
  }
  if (method === 'GET' && parts[0] === 'pendencias') {
    return {
      pendentesIptu: DB.filter((r) => r.inscricaoIptu && r.iptuLancado !== 'Feito').map(candidatoShape),
      pendentesDati: DB.filter((r) => r.dati && r.datiLancado !== 'Feito').map(candidatoShape),
    };
  }
  if (method === 'GET' && parts[0] === 'proprietarios' && parts.length === 1) {
    const alvo = (params.q || '').trim().toLowerCase();
    const nomes = [...new Set(DB.map((r) => r.proprietario).filter(Boolean))];
    const filtrados = alvo ? nomes.filter((n) => n.toLowerCase().includes(alvo)) : nomes;
    return filtrados.map((nome) => ({ proprietario: nome, totalImoveis: DB.filter((r) => r.proprietario === nome).length }));
  }
  if (method === 'GET' && parts[0] === 'proprietarios' && parts.length === 2) {
    const alvo = parts[1].trim().toLowerCase();
    const imoveis = DB.filter((r) => r.proprietario.trim().toLowerCase() === alvo);
    if (imoveis.length === 0) throw new ApiError(404, { error: 'Proprietário não encontrado na planilha' });
    const comT = imoveis.map(comTotais);
    const somaSe = (pred, val) => {
      const f = comT.filter(pred);
      if (f.length === 0) return 0;
      return Math.round(f.reduce((acc, m) => acc + val(m), 0) * 100) / 100;
    };
    const contarPor = (get) => {
      const out = {};
      for (const r of comT) {
        const v = get(r);
        if (!v) continue;
        out[v] = (out[v] || 0) + 1;
      }
      return out;
    };
    const inscMap = new Map();
    for (const m of comT) {
      if (!m.inscricaoIptu) continue;
      if (!inscMap.has(m.inscricaoIptu)) inscMap.set(m.inscricaoIptu, []);
      inscMap.get(m.inscricaoIptu).push(String(m.codigo));
    }
    return {
      proprietario: imoveis[0].proprietario,
      totalImoveis: imoveis.length,
      valorCotaUnicaTotal: somaSe((m) => m.formaPgto === 'Cota única', (m) => (Number(m.iptuCotaUnica) || 0) + (Number(m.datiCotaUnica) || 0)),
      valorParceladoTotal: somaSe((m) => m.formaPgto === 'Parcelado', (m) => (m.iptuTotalCalculado || 0) + (m.datiTotalCalculado || 0)),
      quemPagaIptu: contarPor((m) => m.quemPagaIptu),
      quemPagaDati: contarPor((m) => m.quemPagaDati),
      inscricoes: [...inscMap.entries()].map(([inscricaoIptu, codigos]) => ({ inscricaoIptu, codigos, qtdCodigos: codigos.length })),
      imoveis: comT.map((m) => ({ codigo: m.codigo, nominalIptu: m.nominalIptu, inscricaoIptu: m.inscricaoIptu, dati: m.dati, formaPgto: m.formaPgto })),
    };
  }
  if (method === 'PATCH' && parts[0] === 'proprietarios' && parts.length === 2) {
    const novo = String(body.novoNome ?? '').trim();
    if (!novo) throw new ApiError(400, { error: 'Informe o novo nome do proprietário' });
    const alvo = parts[1].trim().toLowerCase();
    const alvos = DB.filter((r) => r.proprietario.trim().toLowerCase() === alvo);
    if (alvos.length === 0) throw new ApiError(404, { error: `Nenhum imóvel encontrado com proprietário "${parts[1]}"` });
    alvos.forEach((r) => {
      r.proprietario = novo;
    });
    return { renomeados: alvos.length, novoNome: novo };
  }
  if (method === 'POST' && parts[0] === 'lancamentos' && parts[1] === 'extrair') {
    return extrairPdf();
  }
  if (method === 'POST' && parts[0] === 'lancamentos' && parts[1] === 'rateio') {
    const f = objFromFormData(body);
    const itens = JSON.parse(f.itens);
    const resultados = itens.map((it) => {
      try {
        const r = lancarInterno({ ...it, tributo: f.tributo, arquivo: f.arquivo });
        const row = DB.find((r2) => String(r2.codigo) === String(r.codigo));
        if (row) row.imovelDeRateio = f.rotulo;
        return { status: 'sucesso', codigo: it.codigo };
      } catch (err) {
        return { status: 'erro', codigo: it.codigo, mensagem: apiErrorMessage(err) };
      }
    });
    return { rotulo: f.rotulo, resultados };
  }
  if (method === 'POST' && parts[0] === 'lancamentos' && parts.length === 1) {
    return lancarInterno(objFromFormData(body));
  }
  if (method === 'POST' && parts[0] === 'exercicio' && parts[1] === 'novo') {
    DB.forEach((r) => {
      r.iptuCotaUnica = '';
      r.iptuParcela = '';
      r.iptuUltimaParcela = '';
      r.iptuLancado = 'Não';
      r.quemPagaIptu = '';
      r.datiCotaUnica = '';
      r.datiParcela = '';
      r.datiUltimaParcela = '';
      r.datiLancado = 'Não';
      r.quemPagaDati = '';
      r.formaPgto = '';
      r.linkCarne = '';
    });
    LISTAS.exercicio = body.ano;
    return { ano: body.ano, linhasLimpas: DB.length, backupPath: '(demonstração — nenhum backup real é criado)' };
  }

  throw new ApiError(404, { error: `Rota de demonstração não implementada: ${method} ${url}` });
}

async function request(method, url, body, config) {
  await delay(jitter());
  try {
    return { data: handle(method, url, body, config) };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, { error: err.message });
  }
}

export const api = {
  get: (url, config) => request('GET', url, undefined, config),
  post: (url, body, config) => request('POST', url, body, config),
  patch: (url, body, config) => request('PATCH', url, body, config),
  put: (url, body, config) => request('PUT', url, body, config),
};
