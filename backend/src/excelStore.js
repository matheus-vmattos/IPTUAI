// Camada de acesso a planilha real do usuario (Projeto_IPTU.xlsx, aba
// "IPTU" = tabela tblIPTU). Ver backend/src/excel/sheetEditor.js para o
// porque de editar o XML na mao em vez de usar uma lib xlsx generica.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');

const { colLetterToNum, numToColLetter, escapeXml } = require('./excel/xmlUtil');
const {
  parseSharedStrings,
  indexRows,
  parseCells,
  cellValue,
  buildDataCell,
  setCellsInRow,
  clearCellsInRow,
} = require('./excel/sheetEditor');
const { COLUMNS, FORMULA_COLUMNS, FORMULA_TEMPLATES, COLUNAS_OPCIONAIS } = require('./excel/columns');

const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '..', 'data', 'config.json');

const SHEET_PATH = 'xl/worksheets/sheet2.xml'; // aba "IPTU" (rId2 -> sheet2.xml no workbook.xml.rels)
const LISTAS_PATH = 'xl/worksheets/sheet3.xml'; // aba "Listas"
const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml';
const TABLE_PATH = 'xl/tables/table1.xml';

const CONFIG_PADRAO = { xlsxPath: null, pdfFolder: null, reajustePadrao: 5, modoLeitura: false };

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    return { ...CONFIG_PADRAO, ...JSON.parse(raw) };
  } catch {
    return { ...CONFIG_PADRAO };
  }
}

async function writeConfig(partial) {
  const current = await readConfig();
  const next = { ...current, ...partial };
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

async function requireXlsxPath() {
  const cfg = await readConfig();
  if (!cfg.xlsxPath) {
    throw new Error('Nenhuma planilha configurada. Escolha o arquivo .xlsx em Configurações.');
  }
  return cfg.xlsxPath;
}

async function loadZip(xlsxPath) {
  let buf;
  try {
    buf = await fs.readFile(xlsxPath);
  } catch (err) {
    throw new Error(`Não foi possível abrir a planilha em "${xlsxPath}": ${err.message}`);
  }
  return JSZip.loadAsync(buf);
}

async function saveZipAtomically(zip, xlsxPath) {
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const tmpPath = `${xlsxPath}.tmp-${Date.now()}-${process.pid}`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, xlsxPath);
}

// Evita duas gravações concorrentes corromperem o arquivo (uso e sequencial
// por pessoa, mas o backend em si pode receber requisições sobrepostas).
let writeLock = Promise.resolve();
function withWriteLock(fn) {
  const run = writeLock.then(fn, fn);
  writeLock = run.catch(() => {});
  return run;
}

function fieldsOfRow(rowXml, sharedStrings) {
  const cells = parseCells(rowXml);
  const byCol = new Map(cells.map((c) => [c.col, c]));
  const out = {};
  for (const [field, col] of Object.entries(COLUMNS)) {
    const cell = byCol.get(col);
    out[field] = cell ? cellValue(cell, sharedStrings) : null;
  }
  return out;
}

function linhasComCodigo(rows, sharedStrings, codigo) {
  const target = String(codigo).trim();
  if (!target) return [];
  const out = [];
  for (const [rowNum, info] of rows) {
    const cells = parseCells(info.xml);
    const aCell = cells.find((c) => c.col === 'A');
    if (!aCell) continue;
    const val = cellValue(aCell, sharedStrings);
    if (val !== null && String(val).trim() === target) out.push(rowNum);
  }
  return out;
}

// O codigo "I" (coluna A) normalmente identifica uma linha so, mas a
// planilha real tem casos legitimos de um mesmo codigo em varias linhas -
// ex: um imovel que corresponde a mais de uma inscricao/guia de IPTU na
// prefeitura. Nesses casos, a inscricao (IPTU ou DATI) desambigua qual
// linha e a certa; sem ela (ou se nao bater com nenhuma das linhas
// candidatas), a ambiguidade e devolvida pro chamador decidir - NUNCA
// silenciosamente pega "a primeira que achar", que e o jeito de acabar
// lendo/editando/lancando na linha errada.
function linhaTemInscricao(f, alvo) {
  const iptu = normalizarInscricao(f.inscricaoIptu);
  const dati = normalizarInscricao(f.dati);
  return (iptu && iptu === alvo) || (dati && dati === alvo);
}

function linhaSemInscricaoCadastrada(f) {
  return !normalizarInscricao(f.inscricaoIptu) && !normalizarInscricao(f.dati);
}

// Linhas "orfas" (coluna A/codigo vazia) - normalmente erro de digitacao
// manual de antes do app existir, ou uma linha ja excluida (ver
// excluirImovel). So da pra achar uma dessas pela inscricao exata, nunca
// pelo codigo (nao tem).
function linhasSemCodigo(rows, sharedStrings) {
  const out = [];
  for (const [rowNum, info] of rows) {
    const cells = parseCells(info.xml);
    const aCell = cells.find((c) => c.col === 'A');
    const val = aCell ? cellValue(aCell, sharedStrings) : null;
    if (val === null || String(val).trim() === '') out.push(rowNum);
  }
  return out;
}

function localizarLinha(rows, sharedStrings, codigo, inscricao) {
  const alvo = inscricao ? normalizarInscricao(inscricao) : null;
  const codigoTrim = codigo === null || codigo === undefined ? '' : String(codigo).trim();

  // Sem codigo: so da pra achar a linha certa com a inscricao exata (sem
  // ela, nao ha como saber qual das possiveis linhas orfas e a certa).
  if (!codigoTrim) {
    if (!alvo) return { rowNum: null, ambiguo: false, candidatos: [] };
    const semCodigo = linhasSemCodigo(rows, sharedStrings);
    const bateram = semCodigo.filter((r) => linhaTemInscricao(fieldsOfRow(rows.get(r).xml, sharedStrings), alvo));
    if (bateram.length === 1) return { rowNum: bateram[0], ambiguo: false, candidatos: [] };
    if (bateram.length === 0) return { rowNum: null, ambiguo: false, candidatos: [] };
    return {
      rowNum: null,
      ambiguo: true,
      candidatos: bateram.map((r) => fieldsOfRow(rows.get(r).xml, sharedStrings)),
    };
  }

  const linhas = linhasComCodigo(rows, sharedStrings, codigoTrim);
  if (linhas.length === 0) return { rowNum: null, ambiguo: false, candidatos: [] };

  if (linhas.length === 1) {
    if (!alvo) return { rowNum: linhas[0], ambiguo: false, candidatos: [] };
    const f = fieldsOfRow(rows.get(linhas[0]).xml, sharedStrings);
    // Bate com a inscricao da linha, ou a linha ainda nao tem inscricao
    // cadastrada (primeiro lancamento) - e a mesma linha.
    if (linhaSemInscricaoCadastrada(f) || linhaTemInscricao(f, alvo)) {
      return { rowNum: linhas[0], ambiguo: false, candidatos: [] };
    }
    // O codigo existe, mas com OUTRA inscricao - o mesmo "I" pode pagar mais
    // de um IPTU/DATI (inscricoes diferentes na prefeitura). Nao e a mesma
    // linha: devolve "nao encontrado" pra criar uma linha nova, em vez de
    // sobrescrever por engano a inscricao que ja estava la.
    return { rowNum: null, ambiguo: false, candidatos: [] };
  }

  if (alvo) {
    const bateram = linhas.filter((r) => linhaTemInscricao(fieldsOfRow(rows.get(r).xml, sharedStrings), alvo));
    if (bateram.length === 1) return { rowNum: bateram[0], ambiguo: false, candidatos: [] };
    if (bateram.length === 0) {
      // Nenhuma das linhas existentes desse codigo tem essa inscricao -
      // mesmo raciocinio do caso de 1 linha so: e um IPTU/DATI novo pro
      // mesmo "I", cria linha nova em vez de arriscar a linha errada.
      return { rowNum: null, ambiguo: false, candidatos: [] };
    }
  }

  const candidatos = linhas.map((r) => fieldsOfRow(rows.get(r).xml, sharedStrings));
  return { rowNum: null, ambiguo: true, candidatos };
}

// Mesma coisa que localizarLinha, mas lanca um erro (status 409 + lista de
// candidatos) em vez de devolver a ambiguidade - conveniente pras rotas de
// escrita, que nao podem simplesmente seguir em frente sem saber a linha
// certa.
function localizarLinhaOuFalhar(rows, sharedStrings, codigo, inscricao) {
  const { rowNum, ambiguo, candidatos } = localizarLinha(rows, sharedStrings, codigo, inscricao);
  if (ambiguo) {
    const erro = new Error(
      `O código "${codigo}" existe em ${candidatos.length} linhas diferentes da planilha - informe a inscrição (IPTU ou DATI) pra saber qual.`
    );
    erro.status = 409;
    erro.candidatos = candidatos;
    throw erro;
  }
  return rowNum;
}

function mapFieldsToColumns(dataUpdates) {
  const out = {};
  for (const [field, value] of Object.entries(dataUpdates)) {
    const col = COLUMNS[field];
    if (col) out[col] = value;
  }
  return out;
}

function buildFormulaCell(col, rowNum, formulaText) {
  return `<c r="${col}${rowNum}" t="str"><f>${escapeXml(formulaText)}</f><v></v></c>`;
}

function buildNewRowXml(rowNum, dataUpdates) {
  const cells = [];
  for (const [field, value] of Object.entries(dataUpdates)) {
    const col = COLUMNS[field];
    if (!col) continue;
    const cellXml = buildDataCell(col, rowNum, value, '');
    if (cellXml) cells.push({ col, xml: cellXml });
  }

  const rm1 = rowNum - 1;
  const formulaCells = [
    [FORMULA_COLUMNS.contaNoTotal, FORMULA_TEMPLATES.contaNoTotal(rowNum)],
    [FORMULA_COLUMNS.iptuTotal, FORMULA_TEMPLATES.iptuTotal(rowNum)],
    [FORMULA_COLUMNS.datiTotal, FORMULA_TEMPLATES.datiTotal(rowNum)],
    [FORMULA_COLUMNS.valorAPagar, FORMULA_TEMPLATES.valorAPagar(rowNum)],
    [FORMULA_COLUMNS.chaveBusca, FORMULA_TEMPLATES.chaveBusca(rowNum)],
    [FORMULA_COLUMNS.ordemBusca, FORMULA_TEMPLATES.ordemBusca(rowNum, rm1)],
  ];
  for (const [col, formula] of formulaCells) {
    cells.push({ col, xml: buildFormulaCell(col, rowNum, formula) });
  }

  cells.sort((a, b) => colLetterToNum(a.col) - colLetterToNum(b.col));
  return `<row r="${rowNum}" spans="1:27" x14ac:dyDescent="0.25">${cells.map((c) => c.xml).join('')}</row>`;
}

function updateDimension(sheetXml, newMaxRow) {
  return sheetXml.replace(
    /<dimension ref="A1:([A-Z]+)\d+"\/>/,
    (m, ultimaCol) => `<dimension ref="A1:${ultimaCol}${newMaxRow}"/>`
  );
}

async function loadListasRaw(zip) {
  const xml = await zip.file(LISTAS_PATH).async('string');
  const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const { rows } = indexRows(xml);
  function cellAt(rowNum, col) {
    const info = rows.get(rowNum);
    if (!info) return null;
    const cells = parseCells(info.xml);
    const cell = cells.find((c) => c.col === col);
    return cell ? cellValue(cell, sharedStrings) : null;
  }
  return { cellAt };
}

async function getListas() {
  const xlsxPath = await requireXlsxPath();
  const zip = await loadZip(xlsxPath);
  const { cellAt } = await loadListasRaw(zip);

  const exercicio = cellAt(4, 'B');
  const nParcelas = Number(cellAt(5, 'B')) || 12;
  const quemPagaOpcoes = [8, 9, 10, 11, 12].map((r) => cellAt(r, 'A')).filter(Boolean);
  const formaPgtoOpcoes = [8, 9].map((r) => cellAt(r, 'C')).filter(Boolean);
  const conferenciaOpcoes = [8, 9].map((r) => cellAt(r, 'D')).filter(Boolean);

  return { exercicio, nParcelas, quemPagaOpcoes, formaPgtoOpcoes, conferenciaOpcoes };
}

function calcTotal(parcela, ultimaParcela, nParcelas) {
  if (parcela === null || parcela === undefined || parcela === '') return null;
  const p = Number(parcela);
  const last =
    ultimaParcela === null || ultimaParcela === undefined || ultimaParcela === ''
      ? p
      : Number(ultimaParcela);
  return Math.round((p * (nParcelas - 1) + last) * 100) / 100;
}

async function listImoveis(query) {
  const xlsxPath = await requireXlsxPath();
  const zip = await loadZip(xlsxPath);
  const sheetXml = await zip.file(SHEET_PATH).async('string');
  const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const { rows, maxRow } = indexRows(sheetXml);

  const q = (query || '').trim().toLowerCase();
  const out = [];
  for (let r = 2; r <= maxRow; r++) {
    const info = rows.get(r);
    if (!info) continue;
    const fields = fieldsOfRow(info.xml, sharedStrings);
    if (fields.codigo === null && !fields.proprietario) continue;

    if (q) {
      const haystack = [
        fields.codigo,
        fields.proprietario,
        fields.nominalIptu,
        fields.inscricaoIptu,
        fields.dati,
        fields.obs,
      ]
        .filter((v) => v !== null && v !== undefined)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) continue;
    }

    out.push({
      codigo: fields.codigo,
      proprietario: fields.proprietario,
      nominalIptu: fields.nominalIptu,
      inscricaoIptu: fields.inscricaoIptu,
      dati: fields.dati,
      obs: fields.obs,
      formaPgto: fields.formaPgto,
      iptuCotaUnica: fields.iptuCotaUnica,
      iptuParcela: fields.iptuParcela,
      datiCotaUnica: fields.datiCotaUnica,
      datiParcela: fields.datiParcela,
    });
    if (out.length >= 50) break;
  }
  return out;
}

// Imovel de rateio: um numero (ex: 837, 1141, 1133) que NAO e o codigo "I"
// de nenhuma linha - e o identificador, no sistema contabil da empresa, do
// valor real de IPTU que o proprietario paga. Varias linhas com codigo "I"
// proprio (cada uma com sua guia/inscricao na prefeitura) sao rateadas
// dentro desse mesmo numero. O rotulo fica guardado na coluna "Imovel de
// rateio" (X) de cada linha que participa do rateio - e SO um texto/numero
// livre escolhido pelo usuario, pode ate coincidir com o codigo "I" de um
// imovel completamente diferente na planilha, entao NUNCA e resolvido
// contra a coluna A/codigo, so contra outras linhas com o mesmo valor de X.
function montarGrupoRateio(rotulo, membrosFields, nParcelas) {
  const membros = membrosFields.map((f) => ({
    codigo: f.codigo,
    proprietario: f.proprietario,
    nominalIptu: f.nominalIptu,
    inscricaoIptu: f.inscricaoIptu,
    dati: f.dati,
    formaPgto: f.formaPgto,
    obs: f.obs,
    iptuCotaUnica: f.iptuCotaUnica,
    iptuParcela: f.iptuParcela,
    iptuUltimaParcela: f.iptuUltimaParcela,
    iptuTotalCalculado: calcTotal(f.iptuParcela, f.iptuUltimaParcela, nParcelas),
    iptuLancado: f.iptuLancado,
    datiCotaUnica: f.datiCotaUnica,
    datiParcela: f.datiParcela,
    datiUltimaParcela: f.datiUltimaParcela,
    datiTotalCalculado: calcTotal(f.datiParcela, f.datiUltimaParcela, nParcelas),
    datiLancado: f.datiLancado,
    linkCarne: f.linkCarne,
  }));
  membros.sort((a, b) => Number(a.codigo) - Number(b.codigo));

  const somar = (campo) => {
    const soma = membros.reduce((acc, m) => acc + (Number(m[campo]) || 0), 0);
    return soma || null;
  };

  // Um rateio pode abranger mais de uma inscricao (cada uma com um ou mais
  // "I") - quebra os membros por inscricao pra permitir o "drill-down" na
  // busca (escolhe o rateio -> escolhe a inscricao -> ve os imoveis dela).
  const porInscricaoMap = new Map();
  for (const m of membros) {
    const chave = m.inscricaoIptu || m.dati || null;
    if (!porInscricaoMap.has(chave)) porInscricaoMap.set(chave, []);
    porInscricaoMap.get(chave).push(m);
  }
  const porInscricao = [...porInscricaoMap.entries()]
    .map(([inscricao, imoveis]) => ({ inscricao, imoveis }))
    .sort((a, b) => String(a.inscricao).localeCompare(String(b.inscricao), undefined, { numeric: true }));

  return {
    rotuloContabil: rotulo,
    totalImoveis: membros.length,
    imoveis: membros,
    porInscricao,
    totais: {
      iptuCotaUnica: somar('iptuCotaUnica'),
      iptuParcelado: somar('iptuTotalCalculado'),
      datiCotaUnica: somar('datiCotaUnica'),
      datiParcelado: somar('datiTotalCalculado'),
    },
  };
}

async function calcularGrupoRateio(fields, rows, maxRow, sharedStrings, nParcelas) {
  const rotulo = String(fields.imovelDeRateio ?? '').trim();
  if (!rotulo) return null;

  const membrosFields = [];
  for (let r = 2; r <= maxRow; r++) {
    const info = rows.get(r);
    if (!info) continue;
    const f = fieldsOfRow(info.xml, sharedStrings);
    if (String(f.imovelDeRateio ?? '').trim() !== rotulo) continue;
    membrosFields.push(f);
  }
  return montarGrupoRateio(rotulo, membrosFields, nParcelas);
}

// Lista todos os rotulos de "Imovel de rateio" ja usados na planilha, com
// os membros de cada um - alimenta o painel de rateios e a busca no fluxo
// de lancar (pra reconhecer qual grupo e qual sem ter que decorar numero).
async function listarGruposDeRateio() {
  const xlsxPath = await requireXlsxPath();
  const zip = await loadZip(xlsxPath);
  const sheetXml = await zip.file(SHEET_PATH).async('string');
  const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const { rows, maxRow } = indexRows(sheetXml);
  const { cellAt } = await loadListasRaw(zip);
  const nParcelas = Number(cellAt(5, 'B')) || 12;

  const porRotulo = new Map();
  for (let r = 2; r <= maxRow; r++) {
    const info = rows.get(r);
    if (!info) continue;
    const f = fieldsOfRow(info.xml, sharedStrings);
    const rotulo = String(f.imovelDeRateio ?? '').trim();
    if (!rotulo) continue;
    if (!porRotulo.has(rotulo)) porRotulo.set(rotulo, []);
    porRotulo.get(rotulo).push(f);
  }

  const grupos = [...porRotulo.entries()].map(([rotulo, membrosFields]) =>
    montarGrupoRateio(rotulo, membrosFields, nParcelas)
  );
  grupos.sort((a, b) => a.rotuloContabil.localeCompare(b.rotuloContabil, undefined, { numeric: true }));
  return grupos;
}

// Busca um grupo especifico pelo rotulo - devolve grupo vazio (nao null)
// se o rotulo ainda nao existir em nenhuma linha, pra o fluxo de "criar um
// rateio novo" poder usar a mesma tela sem tratar caso especial.
async function getGrupoDeRateio(rotulo) {
  const alvo = String(rotulo ?? '').trim();
  const vazio = (r) => ({ rotuloContabil: r, totalImoveis: 0, imoveis: [], porInscricao: [], totais: {} });
  if (!alvo) return vazio('');
  const grupos = await listarGruposDeRateio();
  return grupos.find((g) => g.rotuloContabil === alvo) || vazio(alvo);
}

// Imoveis ainda sem carne lancado neste exercicio (coluna "salvo" != Feito)
// - so conta pendencia de IPTU/DATI pra quem de fato tem inscricao daquele
// tributo (ignora "Não tem"/vazio). Visao geral de "o que falta lancar".
function temValorReal(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s !== '' && s.toLowerCase() !== 'não tem';
}

async function listarPendencias() {
  const xlsxPath = await requireXlsxPath();
  const zip = await loadZip(xlsxPath);
  const sheetXml = await zip.file(SHEET_PATH).async('string');
  const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const { rows, maxRow } = indexRows(sheetXml);

  const pendentesIptu = [];
  const pendentesDati = [];
  for (let r = 2; r <= maxRow; r++) {
    const info = rows.get(r);
    if (!info) continue;
    const f = fieldsOfRow(info.xml, sharedStrings);
    if (f.codigo === null && !f.proprietario) continue;

    if (temValorReal(f.inscricaoIptu) && f.iptuSalvo !== 'Feito') {
      pendentesIptu.push({
        codigo: f.codigo,
        proprietario: f.proprietario,
        nominalIptu: f.nominalIptu,
        inscricaoIptu: f.inscricaoIptu,
        imovelDeRateio: f.imovelDeRateio,
        obs: f.obs,
      });
    }
    if (temValorReal(f.dati) && f.datiSalvo !== 'Feito') {
      pendentesDati.push({
        codigo: f.codigo,
        proprietario: f.proprietario,
        nominalIptu: f.nominalIptu,
        dati: f.dati,
        imovelDeRateio: f.imovelDeRateio,
        obs: f.obs,
      });
    }
  }
  return { pendentesIptu, pendentesDati };
}

// Separa os imoveis (com inscricao real de IPTU/DATI) entre quem ja tem
// provisao calculada pro proximo exercicio e quem ainda nao - util pra
// acompanhar o quanto falta provisionar pro ano que vem, independente do
// que ja foi lancado de verdade no exercicio atual (ver listarPendencias).
async function listarProvisao() {
  const xlsxPath = await requireXlsxPath();
  const zip = await loadZip(xlsxPath);
  const sheetXml = await zip.file(SHEET_PATH).async('string');
  const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const { rows, maxRow } = indexRows(sheetXml);
  const { cellAt } = await loadListasRaw(zip);
  const exercicioAtual = Number(cellAt(4, 'B'));
  const proximoExercicio = Number.isInteger(exercicioAtual) ? exercicioAtual + 1 : null;

  const comProvisaoIptu = [];
  const semProvisaoIptu = [];
  const comProvisaoDati = [];
  const semProvisaoDati = [];
  for (let r = 2; r <= maxRow; r++) {
    const info = rows.get(r);
    if (!info) continue;
    const f = fieldsOfRow(info.xml, sharedStrings);
    if (f.codigo === null && !f.proprietario) continue;

    if (temValorReal(f.inscricaoIptu)) {
      const item = {
        codigo: f.codigo,
        proprietario: f.proprietario,
        nominalIptu: f.nominalIptu,
        inscricaoIptu: f.inscricaoIptu,
        imovelDeRateio: f.imovelDeRateio,
        obs: f.obs,
        provisao: f.iptuProvisaoProximoAno,
      };
      (f.iptuProvisaoProximoAno != null ? comProvisaoIptu : semProvisaoIptu).push(item);
    }
    if (temValorReal(f.dati)) {
      const item = {
        codigo: f.codigo,
        proprietario: f.proprietario,
        nominalIptu: f.nominalIptu,
        dati: f.dati,
        imovelDeRateio: f.imovelDeRateio,
        obs: f.obs,
        provisao: f.datiProvisaoProximoAno,
      };
      (f.datiProvisaoProximoAno != null ? comProvisaoDati : semProvisaoDati).push(item);
    }
  }
  return { comProvisaoIptu, semProvisaoIptu, comProvisaoDati, semProvisaoDati, proximoExercicio };
}

async function getImovel(codigo, inscricao) {
  const xlsxPath = await requireXlsxPath();
  const zip = await loadZip(xlsxPath);
  const sheetXml = await zip.file(SHEET_PATH).async('string');
  const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const { rows, maxRow } = indexRows(sheetXml);

  const rowNum = localizarLinhaOuFalhar(rows, sharedStrings, codigo, inscricao);
  if (!rowNum) return null;

  const fields = fieldsOfRow(rows.get(rowNum).xml, sharedStrings);
  const { cellAt } = await loadListasRaw(zip);
  const nParcelas = Number(cellAt(5, 'B')) || 12;

  const iptuTotalCalculado = calcTotal(fields.iptuParcela, fields.iptuUltimaParcela, nParcelas);
  const datiTotalCalculado = calcTotal(fields.datiParcela, fields.datiUltimaParcela, nParcelas);

  let valorAPagarCalculado = null;
  if (fields.formaPgto === 'Cota única') {
    valorAPagarCalculado = (Number(fields.iptuCotaUnica) || 0) + (Number(fields.datiCotaUnica) || 0);
  } else if (fields.formaPgto === 'Parcelado') {
    valorAPagarCalculado = (iptuTotalCalculado || 0) + (datiTotalCalculado || 0);
  }

  const grupoRateio = await calcularGrupoRateio(fields, rows, maxRow, sharedStrings, nParcelas);

  return { ...fields, iptuTotalCalculado, datiTotalCalculado, valorAPagarCalculado, grupoRateio };
}

// Busca por igualdade exata (normalizada) de inscricao, em IPTU (coluna D)
// ou DATI (coluna E). Usada pra sugerir o imovel certo a partir da
// inscricao lida do PDF - mais confiavel que o codigo tirado do nome do
// arquivo, que costuma ser so um numero de referencia do CRM do usuario e
// pode nao bater com o codigo "I" real da linha (ex: imoveis de rateio).
function normalizarInscricao(v) {
  return String(v ?? '').trim().toLowerCase();
}

async function buscarPorInscricao(inscricao) {
  const alvo = normalizarInscricao(inscricao);
  if (!alvo) return [];

  const xlsxPath = await requireXlsxPath();
  const zip = await loadZip(xlsxPath);
  const sheetXml = await zip.file(SHEET_PATH).async('string');
  const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const { rows, maxRow } = indexRows(sheetXml);

  const out = [];
  for (let r = 2; r <= maxRow; r++) {
    const info = rows.get(r);
    if (!info) continue;
    const fields = fieldsOfRow(info.xml, sharedStrings);
    const bateuIptu = normalizarInscricao(fields.inscricaoIptu) === alvo;
    const bateuDati = normalizarInscricao(fields.dati) === alvo;
    if (!bateuIptu && !bateuDati) continue;

    out.push({
      codigo: fields.codigo,
      proprietario: fields.proprietario,
      nominalIptu: fields.nominalIptu,
      inscricaoIptu: fields.inscricaoIptu,
      dati: fields.dati,
      imovelDeRateio: fields.imovelDeRateio,
      obs: fields.obs,
      tributoQueBateu: bateuIptu && bateuDati ? 'IPTU/DATI' : bateuIptu ? 'IPTU' : 'DATI',
    });
  }
  return out;
}

function novoGuid() {
  return `{${crypto.randomUUID().toUpperCase()}}`;
}

// Migracao idempotente: adiciona ao final da tabela tblIPTU as colunas
// opcionais que o app precisa e que a planilha original do usuario nao
// tinha (hoje: provisao de IPTU/DATI pro proximo exercicio). So mexe em
// table1.xml (novas tableColumn + count + ref/autoFilter) e na linha 1 do
// sheet2.xml (cabecalho) + dimension - nenhuma outra linha ou coluna e
// tocada. Se as colunas ja existirem (nome do cabecalho ja presente na
// tabela), nao faz nada.
function ensureColunasProvisao(sheetXml, tableXml) {
  const faltando = COLUNAS_OPCIONAIS.filter(({ nome }) => !tableXml.includes(`name="${nome}"`));
  if (faltando.length === 0) return { sheetXml, tableXml, criada: false };

  const idsExistentes = [...tableXml.matchAll(/<tableColumn id="(\d+)"/g)].map((m) => Number(m[1]));
  let proximoId = Math.max(...idsExistentes) + 1;

  const refMatch = tableXml.match(/ref="A1:([A-Z]+)(\d+)"/);
  if (!refMatch) throw new Error('Não foi possível ler o intervalo da tabela tblIPTU');
  const ultimaLinha = refMatch[2];
  let ultimoColNum = colLetterToNum(refMatch[1]);

  const novasColunasXml = [];
  const novasLetras = [];
  for (const { nome } of faltando) {
    ultimoColNum += 1;
    const letra = numToColLetter(ultimoColNum);
    novasLetras.push(letra);
    novasColunasXml.push(`<tableColumn id="${proximoId}" xr3:uid="${novoGuid()}" name="${escapeXml(nome)}"/>`);
    proximoId += 1;
  }

  // Confere que as letras calculadas dinamicamente batem com o mapeamento
  // fixo em columns.js - se nao bater, a planilha esta num estado
  // inesperado e e mais seguro parar do que gravar na coluna errada.
  const letrasEsperadas = faltando.map(({ field }) => COLUMNS[field]);
  if (novasLetras.join(',') !== letrasEsperadas.join(',')) {
    throw new Error(
      `Não foi possível adicionar as colunas de provisão automaticamente ` +
        `(esperava ${letrasEsperadas.join('/')}, calculou ${novasLetras.join('/')}). ` +
        `A planilha pode ter sido editada manualmente - avise o suporte antes de continuar.`
    );
  }

  const novaUltimaCol = numToColLetter(ultimoColNum);
  const novoCount = idsExistentes.length + faltando.length;

  const novoTableXml = tableXml
    .replace(/count="\d+"/, `count="${novoCount}"`)
    .replace('</tableColumns>', `${novasColunasXml.join('')}</tableColumns>`)
    .replace(/A1:[A-Z]+\d+/g, `A1:${novaUltimaCol}${ultimaLinha}`);

  const { rows } = indexRows(sheetXml);
  const linha1 = rows.get(1);
  if (!linha1) throw new Error('Linha de cabeçalho não encontrada na aba IPTU');

  const novasCelulasHeader = faltando
    .map(({ nome }, i) => {
      const texto = escapeXml(nome);
      return `<c r="${novasLetras[i]}1" s="26" t="inlineStr"><is><t xml:space="preserve">${texto}</t></is></c>`;
    })
    .join('');
  const novaLinha1 = linha1.xml.replace('</row>', `${novasCelulasHeader}</row>`);

  let novoSheetXml = sheetXml.slice(0, linha1.start) + novaLinha1 + sheetXml.slice(linha1.end);
  novoSheetXml = novoSheetXml.replace(
    /<dimension ref="A1:[A-Z]+\d+"\/>/,
    `<dimension ref="A1:${novaUltimaCol}${ultimaLinha}"/>`
  );

  return { sheetXml: novoSheetXml, tableXml: novoTableXml, criada: true };
}

// tributo: 'IPTU' | 'DATI'
async function lancarTributo(payload) {
  const { codigo, tributo } = payload;
  if (!codigo || !String(codigo).trim()) {
    throw new Error('Informe o código de identificação do imóvel (coluna I)');
  }
  if (!['IPTU', 'DATI'].includes(tributo)) {
    throw new Error('tributo deve ser "IPTU" ou "DATI"');
  }

  return withWriteLock(async () => {
    const xlsxPath = await requireXlsxPath();
    const zip = await loadZip(xlsxPath);
    let sheetXml = await zip.file(SHEET_PATH).async('string');
    let tableXml = await zip.file(TABLE_PATH).async('string');

    // Garante que as colunas de provisao existem ANTES de indexar as linhas
    // - se a migracao mexer na linha 1 (cabecalho), os offsets das linhas
    // 2+ calculados a partir do sheetXml original ficariam invalidos.
    const migracao = ensureColunasProvisao(sheetXml, tableXml);
    sheetXml = migracao.sheetXml;
    tableXml = migracao.tableXml;

    const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
    const sharedStrings = parseSharedStrings(sharedStringsXml);
    const { rows, maxRow } = indexRows(sheetXml);
    const { cellAt } = await loadListasRaw(zip);
    const nParcelas = Number(cellAt(5, 'B')) || 12;

    const existingRowNum = localizarLinhaOuFalhar(rows, sharedStrings, codigo, payload.inscricaoIptu || payload.dati);

    const dataUpdates = {};
    const setIfDefined = (field, value) => {
      if (value !== undefined) dataUpdates[field] = value;
    };
    setIfDefined('proprietario', payload.proprietario);
    setIfDefined('nominalIptu', payload.nominalIptu);
    setIfDefined('inscricaoIptu', payload.inscricaoIptu);
    setIfDefined('dati', payload.dati);
    setIfDefined('obs', payload.obs);
    setIfDefined('imovelDeRateio', payload.imovelDeRateio);
    setIfDefined('formaPgto', payload.formaPgto);
    setIfDefined('linkCarne', payload.linkCarne);

    // Provisao pro proximo exercicio: se um % de reajuste foi informado,
    // calcula o valor total deste lancamento e grava valorTotal*(1+%) na
    // coluna de provisao do tributo - vira o "valor esperado" a comparar
    // no proximo ciclo. Se ja existia uma provisao de um lancamento
    // anterior (ciclo passado), devolve a diferenca pro valor real de agora.
    const campoProvisao = tributo === 'IPTU' ? 'iptuProvisaoProximoAno' : 'datiProvisaoProximoAno';
    const campoProvisaoParcela = tributo === 'IPTU' ? 'iptuProvisaoParcela' : 'datiProvisaoParcela';
    const campoProvisaoUltimaParcela =
      tributo === 'IPTU' ? 'iptuProvisaoUltimaParcela' : 'datiProvisaoUltimaParcela';

    let provisaoAnterior = null;
    let provisaoParcelaAnterior = null;
    let provisaoUltimaParcelaAnterior = null;
    if (existingRowNum) {
      const antesDoUpdate = fieldsOfRow(rows.get(existingRowNum).xml, sharedStrings);
      const aNum = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
      provisaoAnterior = aNum(antesDoUpdate[campoProvisao]);
      provisaoParcelaAnterior = aNum(antesDoUpdate[campoProvisaoParcela]);
      provisaoUltimaParcelaAnterior = aNum(antesDoUpdate[campoProvisaoUltimaParcela]);
    }

    let valorTotalDesteAno = null;
    if (payload.formaPgto === 'Cota única') {
      valorTotalDesteAno = payload.cotaUnica !== undefined ? Number(payload.cotaUnica) : null;
    } else if (payload.formaPgto === 'Parcelado') {
      valorTotalDesteAno = calcTotal(payload.parcela, payload.ultimaParcela, nParcelas);
    }

    let diferenca = null;
    let parcelaAjustada = null;
    let ultimaParcelaAjustada = null;
    let diferencaParcela = null;
    let diferencaUltimaParcela = null;

    if (payload.reajustePct !== undefined && payload.reajustePct !== null && valorTotalDesteAno !== null) {
      const pct = Number(payload.reajustePct);
      dataUpdates[campoProvisao] = Math.round(valorTotalDesteAno * (1 + pct / 100) * 100) / 100;

      if (payload.formaPgto === 'Parcelado') {
        const parcela = Number(payload.parcela);
        const ultima = payload.ultimaParcela !== undefined ? Number(payload.ultimaParcela) : parcela;
        parcelaAjustada = Math.round(parcela * (1 + pct / 100) * 100) / 100;
        ultimaParcelaAjustada = Math.round(ultima * (1 + pct / 100) * 100) / 100;
        dataUpdates[campoProvisaoParcela] = parcelaAjustada;
        dataUpdates[campoProvisaoUltimaParcela] = ultimaParcelaAjustada;
      }
    }
    if (provisaoAnterior !== null && valorTotalDesteAno !== null) {
      diferenca = Math.round((valorTotalDesteAno - provisaoAnterior) * 100) / 100;
    }
    if (payload.formaPgto === 'Parcelado') {
      if (provisaoParcelaAnterior !== null && payload.parcela !== undefined) {
        diferencaParcela = Math.round((Number(payload.parcela) - provisaoParcelaAnterior) * 100) / 100;
      }
      if (provisaoUltimaParcelaAnterior !== null) {
        const ultimaReal =
          payload.ultimaParcela !== undefined ? Number(payload.ultimaParcela) : Number(payload.parcela);
        if (!Number.isNaN(ultimaReal)) {
          diferencaUltimaParcela = Math.round((ultimaReal - provisaoUltimaParcelaAnterior) * 100) / 100;
        }
      }
    }

    if (tributo === 'IPTU') {
      setIfDefined('quemPagaIptu', payload.quemPaga);
      setIfDefined('iptuCotaUnica', payload.cotaUnica);
      setIfDefined('iptuParcela', payload.parcela);
      setIfDefined('iptuUltimaParcela', payload.ultimaParcela);
      dataUpdates.iptuSalvo = 'Feito';
    } else {
      setIfDefined('quemPagaDati', payload.quemPaga);
      setIfDefined('datiCotaUnica', payload.cotaUnica);
      setIfDefined('datiParcela', payload.parcela);
      setIfDefined('datiUltimaParcela', payload.ultimaParcela);
      dataUpdates.datiSalvo = 'Feito';
    }

    let newSheetXml;
    let rowNum;
    let created = false;

    if (existingRowNum) {
      rowNum = existingRowNum;
      const info = rows.get(rowNum);
      const newRowXml = setCellsInRow(info.xml, rowNum, mapFieldsToColumns(dataUpdates));
      newSheetXml = sheetXml.slice(0, info.start) + newRowXml + sheetXml.slice(info.end);
    } else {
      rowNum = maxRow + 1;
      created = true;
      dataUpdates.codigo = codigo;
      const newRowXml = buildNewRowXml(rowNum, dataUpdates);
      const insertAt = sheetXml.indexOf('</sheetData>');
      newSheetXml = sheetXml.slice(0, insertAt) + newRowXml + sheetXml.slice(insertAt);
      newSheetXml = updateDimension(newSheetXml, rowNum);
    }

    zip.file(SHEET_PATH, newSheetXml);

    if (created) {
      const novoTableXml = tableXml.replace(/A1:([A-Z]+)\d+/g, (m, ultimaCol) => `A1:${ultimaCol}${rowNum}`);
      zip.file(TABLE_PATH, novoTableXml);
    } else if (migracao.criada) {
      zip.file(TABLE_PATH, tableXml);
    }

    await saveZipAtomically(zip, xlsxPath);

    return {
      codigo: String(codigo).trim(),
      rowNum,
      created,
      provisaoAnterior,
      valorTotalDesteAno,
      diferenca,
      parcelaAjustada,
      ultimaParcelaAjustada,
      provisaoParcelaAnterior,
      provisaoUltimaParcelaAnterior,
      diferencaParcela,
      diferencaUltimaParcela,
    };
  });
}

async function marcarLancado({ codigo, tributo, status, inscricao }) {
  if (!['IPTU', 'DATI'].includes(tributo)) throw new Error('tributo deve ser "IPTU" ou "DATI"');

  return withWriteLock(async () => {
    const xlsxPath = await requireXlsxPath();
    const zip = await loadZip(xlsxPath);
    const sheetXml = await zip.file(SHEET_PATH).async('string');
    const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
    const sharedStrings = parseSharedStrings(sharedStringsXml);
    const { rows } = indexRows(sheetXml);

    const rowNum = localizarLinhaOuFalhar(rows, sharedStrings, codigo, inscricao);
    if (!rowNum) throw new Error(`Imóvel com código "${codigo}" não encontrado na planilha`);

    const field = tributo === 'IPTU' ? 'iptuLancado' : 'datiLancado';
    const info = rows.get(rowNum);
    const newRowXml = setCellsInRow(info.xml, rowNum, mapFieldsToColumns({ [field]: status }));
    const newSheetXml = sheetXml.slice(0, info.start) + newRowXml + sheetXml.slice(info.end);

    zip.file(SHEET_PATH, newSheetXml);
    await saveZipAtomically(zip, xlsxPath);
    return { codigo, rowNum };
  });
}

const CAMPOS_NUMERICOS = new Set([
  'iptuCotaUnica',
  'iptuParcela',
  'iptuUltimaParcela',
  'datiCotaUnica',
  'datiParcela',
  'datiUltimaParcela',
  'iptuProvisaoProximoAno',
  'datiProvisaoProximoAno',
  'iptuProvisaoParcela',
  'iptuProvisaoUltimaParcela',
  'datiProvisaoParcela',
  'datiProvisaoUltimaParcela',
]);

// Edicao livre de um imovel ja existente: aceita qualquer subconjunto dos
// campos de dado da linha (sem as regras do wizard de lancamento, tipo
// "cotaUnica" ou "quemPaga" exigidos). Nao mexe no codigo (coluna I) - pra
// isso e melhor lancar de novo com o codigo certo do que renomear a linha.
async function atualizarImovel(codigo, camposLivres, inscricaoDesambiguacao) {
  const { codigo: _ignorado, ...brutos } = camposLivres || {};

  // Campos de valor precisam virar numero de verdade - se chegar string
  // (ex: vindo de um formulario/JSON) a celula seria gravada como texto e
  // as formulas de total da planilha parariam de calcular.
  const campos = {};
  for (const [campo, valor] of Object.entries(brutos)) {
    if (CAMPOS_NUMERICOS.has(campo) && typeof valor === 'string' && valor.trim() !== '') {
      const num = Number(valor);
      if (Number.isNaN(num)) throw new Error(`Valor inválido em "${campo}": ${valor}`);
      campos[campo] = num;
    } else {
      campos[campo] = valor;
    }
  }

  return withWriteLock(async () => {
    const xlsxPath = await requireXlsxPath();
    const zip = await loadZip(xlsxPath);
    let sheetXml = await zip.file(SHEET_PATH).async('string');
    let tableXml = await zip.file(TABLE_PATH).async('string');

    // Garante as colunas opcionais (ex: provisao) antes de indexar linhas,
    // caso a edicao livre mexa nelas antes de qualquer lancamento ter
    // rodado a migracao.
    const migracao = ensureColunasProvisao(sheetXml, tableXml);
    sheetXml = migracao.sheetXml;
    tableXml = migracao.tableXml;

    const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
    const sharedStrings = parseSharedStrings(sharedStringsXml);
    const { rows } = indexRows(sheetXml);

    const rowNum = localizarLinhaOuFalhar(rows, sharedStrings, codigo, inscricaoDesambiguacao);
    if (!rowNum) throw new Error(`Imóvel com código "${codigo}" não encontrado na planilha`);

    const info = rows.get(rowNum);
    const newRowXml = setCellsInRow(info.xml, rowNum, mapFieldsToColumns(campos));
    const newSheetXml = sheetXml.slice(0, info.start) + newRowXml + sheetXml.slice(info.end);

    zip.file(SHEET_PATH, newSheetXml);
    if (migracao.criada) zip.file(TABLE_PATH, tableXml);
    await saveZipAtomically(zip, xlsxPath);
    return { codigo, rowNum };
  });
}

// Exclui um imovel. NAO remove fisicamente a linha da tabela (exigiria
// renumerar todas as linhas seguintes e suas formulas - arriscado demais
// numa planilha real em uso) - em vez disso limpa TODOS os campos de dado
// da linha, deixando-a vazia (igual uma linha nunca preenchida; as formulas
// de total simplesmente mostram "" pra uma linha sem inscricao). Faz backup
// do arquivo antes, do mesmo jeito que a virada de exercicio.
async function excluirImovel(codigo, inscricao) {
  return withWriteLock(async () => {
    const xlsxPath = await requireXlsxPath();

    const dir = path.dirname(xlsxPath);
    const ext = path.extname(xlsxPath);
    const nomeBase = path.basename(xlsxPath, ext);
    const backupPath = path.join(dir, `${nomeBase} - backup antes de excluir I${codigo}${ext}`);
    await fs.copyFile(xlsxPath, backupPath);

    const zip = await loadZip(xlsxPath);
    const sheetXml = await zip.file(SHEET_PATH).async('string');
    const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
    const sharedStrings = parseSharedStrings(sharedStringsXml);
    const { rows } = indexRows(sheetXml);

    const rowNum = localizarLinhaOuFalhar(rows, sharedStrings, codigo, inscricao);
    if (!rowNum) throw new Error(`Imóvel com código "${codigo}" não encontrado na planilha`);

    const info = rows.get(rowNum);
    const newRowXml = clearCellsInRow(info.xml, Object.values(COLUMNS));
    const newSheetXml = sheetXml.slice(0, info.start) + newRowXml + sheetXml.slice(info.end);

    zip.file(SHEET_PATH, newSheetXml);
    await saveZipAtomically(zip, xlsxPath);
    return { codigo, rowNum, backupPath };
  });
}

// Campos que dependem do exercicio corrente e devem ser limpos na virada de
// ano - o resto (proprietario, nomes, inscricoes, rateio, OBS) e cadastral
// e continua valendo pro ano novo.
const CAMPOS_VIRADA_DE_ANO = [
  'quemPagaIptu',
  'quemPagaDati',
  'formaPgto',
  'iptuCotaUnica',
  'iptuParcela',
  'iptuUltimaParcela',
  'datiCotaUnica',
  'datiParcela',
  'datiUltimaParcela',
  'linkCarne',
  'iptuSalvo',
  'iptuLancado',
  'datiSalvo',
  'datiLancado',
];

// Virada de exercicio: faz backup do arquivo original, limpa os campos de
// "arranjo de pagamento" do ano anterior em toda a tabela e atualiza o
// exercicio (Listas!B4). Mantem tudo que e cadastral (proprietario, nomes,
// inscricoes, rateio, OBS).
async function iniciarNovoExercicio(novoAno) {
  const ano = Number(novoAno);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2200) {
    throw new Error('Informe um ano válido (ex: 2027)');
  }

  return withWriteLock(async () => {
    const xlsxPath = await requireXlsxPath();

    const dir = path.dirname(xlsxPath);
    const ext = path.extname(xlsxPath);
    const nomeBase = path.basename(xlsxPath, ext);
    const backupPath = path.join(dir, `${nomeBase} - backup antes de ${ano}${ext}`);
    await fs.copyFile(xlsxPath, backupPath);

    const zip = await loadZip(xlsxPath);
    const sheetXml = await zip.file(SHEET_PATH).async('string');
    const { rows, maxRow } = indexRows(sheetXml);

    const colsParaLimpar = CAMPOS_VIRADA_DE_ANO.map((campo) => COLUMNS[campo]);

    let novoSheetXml = sheetXml;
    let linhasLimpas = 0;
    // de tras pra frente: cada substituicao usa o start/end calculado sobre
    // o sheetXml original, entao so funciona se as linhas ja processadas
    // (depois na string) nao deslocarem a posicao das que faltam (antes).
    for (let r = maxRow; r >= 2; r--) {
      const info = rows.get(r);
      if (!info) continue;
      const novaLinha = clearCellsInRow(info.xml, colsParaLimpar);
      novoSheetXml = novoSheetXml.slice(0, info.start) + novaLinha + novoSheetXml.slice(info.end);
      linhasLimpas += 1;
    }
    zip.file(SHEET_PATH, novoSheetXml);

    const listasXml = await zip.file(LISTAS_PATH).async('string');
    const { rows: listasRows } = indexRows(listasXml);
    const linhaExercicio = listasRows.get(4);
    if (linhaExercicio) {
      const novaLinha = setCellsInRow(linhaExercicio.xml, 4, { B: ano });
      const novoListasXml =
        listasXml.slice(0, linhaExercicio.start) + novaLinha + listasXml.slice(linhaExercicio.end);
      zip.file(LISTAS_PATH, novoListasXml);
    }

    await saveZipAtomically(zip, xlsxPath);
    return { ano, backupPath, linhasLimpas };
  });
}

async function listarProprietarios(query) {
  const xlsxPath = await requireXlsxPath();
  const zip = await loadZip(xlsxPath);
  const sheetXml = await zip.file(SHEET_PATH).async('string');
  const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const { rows, maxRow } = indexRows(sheetXml);

  const q = (query || '').trim().toLowerCase();
  const contagem = new Map();
  for (let r = 2; r <= maxRow; r++) {
    const info = rows.get(r);
    if (!info) continue;
    const nome = fieldsOfRow(info.xml, sharedStrings).proprietario;
    if (!nome) continue;
    if (q && !nome.toLowerCase().includes(q)) continue;
    contagem.set(nome, (contagem.get(nome) || 0) + 1);
  }

  return [...contagem.entries()]
    .map(([proprietario, totalImoveis]) => ({ proprietario, totalImoveis }))
    .sort((a, b) => a.proprietario.localeCompare(b.proprietario));
}

// Painel agregado por proprietario: quantos imoveis, quanto valor total (por
// forma de pagamento), quem paga cada um, e quantos codigos "I" compartilham
// a mesma inscricao (comum em imoveis de rateio).
async function getResumoProprietario(nome) {
  const xlsxPath = await requireXlsxPath();
  const zip = await loadZip(xlsxPath);
  const sheetXml = await zip.file(SHEET_PATH).async('string');
  const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const { rows, maxRow } = indexRows(sheetXml);
  const { cellAt } = await loadListasRaw(zip);
  const nParcelas = Number(cellAt(5, 'B')) || 12;

  const alvo = String(nome).trim().toLowerCase();
  const imoveis = [];
  for (let r = 2; r <= maxRow; r++) {
    const info = rows.get(r);
    if (!info) continue;
    const fields = fieldsOfRow(info.xml, sharedStrings);
    if (!fields.proprietario || fields.proprietario.trim().toLowerCase() !== alvo) continue;
    imoveis.push(fields);
  }
  if (imoveis.length === 0) return null;

  let valorCotaUnicaTotal = 0;
  let valorParceladoTotal = 0;
  const quemPagaIptu = {};
  const quemPagaDati = {};
  const inscricaoCodigos = new Map();

  for (const im of imoveis) {
    valorCotaUnicaTotal += (Number(im.iptuCotaUnica) || 0) + (Number(im.datiCotaUnica) || 0);

    const iptuTotal = calcTotal(im.iptuParcela, im.iptuUltimaParcela, nParcelas);
    const datiTotal = calcTotal(im.datiParcela, im.datiUltimaParcela, nParcelas);
    valorParceladoTotal += (iptuTotal || 0) + (datiTotal || 0);

    if (im.quemPagaIptu) quemPagaIptu[im.quemPagaIptu] = (quemPagaIptu[im.quemPagaIptu] || 0) + 1;
    if (im.quemPagaDati) quemPagaDati[im.quemPagaDati] = (quemPagaDati[im.quemPagaDati] || 0) + 1;

    if (im.inscricaoIptu) {
      const lista = inscricaoCodigos.get(im.inscricaoIptu) || [];
      lista.push(im.codigo);
      inscricaoCodigos.set(im.inscricaoIptu, lista);
    }
  }

  return {
    proprietario: imoveis[0].proprietario,
    totalImoveis: imoveis.length,
    imoveis: imoveis.map((im) => ({
      codigo: im.codigo,
      nominalIptu: im.nominalIptu,
      inscricaoIptu: im.inscricaoIptu,
      dati: im.dati,
      formaPgto: im.formaPgto,
    })),
    valorCotaUnicaTotal: Math.round(valorCotaUnicaTotal * 100) / 100,
    valorParceladoTotal: Math.round(valorParceladoTotal * 100) / 100,
    quemPagaIptu,
    quemPagaDati,
    inscricoes: [...inscricaoCodigos.entries()].map(([inscricaoIptu, codigos]) => ({
      inscricaoIptu,
      qtdCodigos: codigos.length,
      codigos,
    })),
  };
}

// Renomeia o proprietario em TODAS as linhas atualmente atribuidas a ele
// (comparacao exata, sem diferenciar maiusculas - mesma regra usada pra
// achar o resumo) - util quando o imovel muda de dono e as linhas antigas
// nao devem ficar apontando pro proprietario errado. Nao mexe em mais
// nenhum campo (inscricoes, quem paga etc continuam como estavam).
async function renomearProprietario(nomeAtual, nomeNovo) {
  const novo = String(nomeNovo ?? '').trim();
  if (!novo) throw new Error('Informe o novo nome do proprietário');

  return withWriteLock(async () => {
    const xlsxPath = await requireXlsxPath();
    const zip = await loadZip(xlsxPath);
    const sheetXml = await zip.file(SHEET_PATH).async('string');
    const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
    const sharedStrings = parseSharedStrings(sharedStringsXml);
    const { rows, maxRow } = indexRows(sheetXml);

    const alvo = String(nomeAtual ?? '').trim().toLowerCase();
    let novoSheetXml = sheetXml;
    let renomeados = 0;

    // De tras pra frente: cada substituicao usa start/end calculados sobre
    // o sheetXml original, que ficam invalidos pras linhas seguintes assim
    // que uma linha anterior muda de tamanho.
    for (let r = maxRow; r >= 2; r--) {
      const info = rows.get(r);
      if (!info) continue;
      const fields = fieldsOfRow(info.xml, sharedStrings);
      if (!fields.proprietario || fields.proprietario.trim().toLowerCase() !== alvo) continue;

      const newRowXml = setCellsInRow(info.xml, r, mapFieldsToColumns({ proprietario: novo }));
      novoSheetXml = novoSheetXml.slice(0, info.start) + newRowXml + novoSheetXml.slice(info.end);
      renomeados += 1;
    }

    if (renomeados === 0) throw new Error(`Nenhum imóvel encontrado com proprietário "${nomeAtual}"`);

    zip.file(SHEET_PATH, novoSheetXml);
    await saveZipAtomically(zip, xlsxPath);
    return { renomeados, novoNome: novo };
  });
}

module.exports = {
  readConfig,
  writeConfig,
  getListas,
  listImoveis,
  getImovel,
  buscarPorInscricao,
  lancarTributo,
  marcarLancado,
  atualizarImovel,
  excluirImovel,
  iniciarNovoExercicio,
  listarProprietarios,
  getResumoProprietario,
  renomearProprietario,
  ensureColunasProvisao,
  listarGruposDeRateio,
  getGrupoDeRateio,
  listarPendencias,
  listarProvisao,
};
