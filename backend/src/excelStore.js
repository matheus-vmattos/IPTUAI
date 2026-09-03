// Camada de acesso a planilha real do usuario (Projeto_IPTU.xlsx, aba
// "IPTU" = tabela tblIPTU). Ver backend/src/excel/sheetEditor.js para o
// porque de editar o XML na mao em vez de usar uma lib xlsx generica.
const fs = require('fs/promises');
const path = require('path');
const JSZip = require('jszip');

const { colLetterToNum, escapeXml } = require('./excel/xmlUtil');
const {
  parseSharedStrings,
  indexRows,
  parseCells,
  cellValue,
  buildDataCell,
  setCellsInRow,
} = require('./excel/sheetEditor');
const { COLUMNS, FORMULA_COLUMNS, FORMULA_TEMPLATES } = require('./excel/columns');

const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '..', 'data', 'config.json');

const SHEET_PATH = 'xl/worksheets/sheet2.xml'; // aba "IPTU" (rId2 -> sheet2.xml no workbook.xml.rels)
const LISTAS_PATH = 'xl/worksheets/sheet3.xml'; // aba "Listas"
const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml';
const TABLE_PATH = 'xl/tables/table1.xml';

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    return { xlsxPath: null, pdfFolder: null, ...JSON.parse(raw) };
  } catch {
    return { xlsxPath: null, pdfFolder: null };
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

function findRowByCodigo(rows, sharedStrings, codigo) {
  const target = String(codigo).trim();
  if (!target) return null;
  for (const [rowNum, info] of rows) {
    const cells = parseCells(info.xml);
    const aCell = cells.find((c) => c.col === 'A');
    if (!aCell) continue;
    const val = cellValue(aCell, sharedStrings);
    if (val !== null && String(val).trim() === target) return rowNum;
  }
  return null;
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
  return sheetXml.replace(/<dimension ref="A1:[A-Z]+\d+"\/>/, `<dimension ref="A1:AA${newMaxRow}"/>`);
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
    });
    if (out.length >= 50) break;
  }
  return out;
}

async function getImovel(codigo) {
  const xlsxPath = await requireXlsxPath();
  const zip = await loadZip(xlsxPath);
  const sheetXml = await zip.file(SHEET_PATH).async('string');
  const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const { rows } = indexRows(sheetXml);

  const rowNum = findRowByCodigo(rows, sharedStrings, codigo);
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

  return { ...fields, iptuTotalCalculado, datiTotalCalculado, valorAPagarCalculado };
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
    const sheetXml = await zip.file(SHEET_PATH).async('string');
    const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
    const sharedStrings = parseSharedStrings(sharedStringsXml);
    const { rows, maxRow } = indexRows(sheetXml);

    const existingRowNum = findRowByCodigo(rows, sharedStrings, codigo);

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
      const tableXml = await zip.file(TABLE_PATH).async('string');
      zip.file(TABLE_PATH, tableXml.replace(/A1:AA\d+/g, `A1:AA${rowNum}`));
    }

    await saveZipAtomically(zip, xlsxPath);

    return { codigo: String(codigo).trim(), rowNum, created };
  });
}

async function marcarLancado({ codigo, tributo, status }) {
  if (!['IPTU', 'DATI'].includes(tributo)) throw new Error('tributo deve ser "IPTU" ou "DATI"');

  return withWriteLock(async () => {
    const xlsxPath = await requireXlsxPath();
    const zip = await loadZip(xlsxPath);
    const sheetXml = await zip.file(SHEET_PATH).async('string');
    const sharedStringsXml = await zip.file(SHARED_STRINGS_PATH).async('string');
    const sharedStrings = parseSharedStrings(sharedStringsXml);
    const { rows } = indexRows(sheetXml);

    const rowNum = findRowByCodigo(rows, sharedStrings, codigo);
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

module.exports = {
  readConfig,
  writeConfig,
  getListas,
  listImoveis,
  getImovel,
  lancarTributo,
  marcarLancado,
  listarProprietarios,
  getResumoProprietario,
};
