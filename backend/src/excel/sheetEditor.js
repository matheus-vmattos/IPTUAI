// Editor cirurgico de uma planilha SpreadsheetML (sheetN.xml).
//
// Por que nao usar uma lib como exceljs para isso: exceljs (e a maioria das
// libs JS de xlsx) reconstroi o arquivo inteiro ao salvar, e esse workbook
// real tem partes avancadas do Excel (comentarios com autoria/"persons",
// webextensions/task panes, vmlDrawing) que essas libs descartam ao
// regravar - testado empiricamente neste projeto (round-trip com exceljs
// derruba xl/comments1.xml, xl/persons/person.xml e xl/webextensions/*).
// Como e a planilha real que a equipe usa no dia a dia, o risco de
// corromper esses dados na primeira gravacao do app e inaceitavel.
//
// Em vez disso, este modulo abre o .xlsx como zip e edita apenas os bytes
// da celula/linha necessarios dentro de xl/worksheets/sheetN.xml, mantendo
// absolutamente todo o resto do arquivo (incluindo os outros sheets,
// comentarios, webextensions etc.) intocado byte a byte.

const { colLetterToNum, escapeXml } = require('./xmlUtil');

function parseSharedStrings(xml) {
  if (!xml) return [];
  const strings = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const inner = m[1];
    // <si> pode ser texto simples <t>...</t> ou rich text com varios <r><t>...</t></r>
    const texts = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]);
    const joined = texts.join('');
    strings.push(unescapeXml(joined));
  }
  return strings;
}

function unescapeXml(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Indexa todas as <row> do sheetData por numero, guardando posicao exata
// no texto original para permitir slice/splice preciso.
function indexRows(sheetXml) {
  const rows = new Map();
  const re = /<row r="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g;
  let m;
  let maxRow = 0;
  while ((m = re.exec(sheetXml))) {
    const rowNum = Number(m[1]);
    rows.set(rowNum, { start: m.index, end: m.index + m[0].length, xml: m[0] });
    if (rowNum > maxRow) maxRow = rowNum;
  }
  return { rows, maxRow };
}

// Extrai as celulas <c> de uma linha, em ordem, com sua referencia de coluna.
function parseCells(rowXml) {
  const cells = [];
  const re = /<c r="([A-Z]+)(\d+)"((?:[^>]*?))(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  while ((m = re.exec(rowXml))) {
    cells.push({
      col: m[1],
      row: Number(m[2]),
      attrs: m[3] || '',
      inner: m[4] ?? null, // null = self-closed (celula vazia sem conteudo)
      raw: m[0],
    });
  }
  return cells;
}

function cellValue(cell, sharedStrings) {
  const isShared = /(^|\s)t="s"/.test(cell.attrs);
  const isInlineStr = /(^|\s)t="inlineStr"/.test(cell.attrs);
  const isStr = /(^|\s)t="str"/.test(cell.attrs); // resultado de formula, texto

  if (cell.inner == null) return null;

  if (isShared) {
    const vMatch = cell.inner.match(/<v>([\s\S]*?)<\/v>/);
    if (!vMatch) return null;
    const idx = Number(vMatch[1]);
    return sharedStrings[idx] ?? null;
  }
  if (isInlineStr) {
    const tMatch = cell.inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
    return tMatch ? unescapeXml(tMatch[1]) : '';
  }
  if (isStr) {
    const vMatch = cell.inner.match(/<v>([\s\S]*?)<\/v>/);
    return vMatch ? unescapeXml(vMatch[1]) : null;
  }
  // numero puro
  const vMatch = cell.inner.match(/<v>([\s\S]*?)<\/v>/);
  if (!vMatch) return null;
  const num = Number(vMatch[1]);
  return Number.isNaN(num) ? vMatch[1] : num;
}

function styleAttrOf(cell) {
  const m = cell.attrs.match(/(^|\s)s="(\d+)"/);
  return m ? ` s="${m[2]}"` : '';
}

// Monta o XML de uma celula de dado (nunca formula). value=null/undefined/''
// -> celula omitida (mantem a linha esparsa, igual ao padrao do arquivo).
function buildDataCell(col, row, value, existingStyleAttr) {
  const ref = `${col}${row}`;
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    return `<c r="${ref}"${existingStyleAttr}><v>${value}</v></c>`;
  }
  const text = escapeXml(String(value));
  return `<c r="${ref}"${existingStyleAttr} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

// updates: { COL: value } - so colunas de dado (nunca as de formula).
// Retorna a nova linha (string) com as celulas atualizadas/inseridas nas
// posicoes corretas, preservando todas as outras celulas (inclusive as de
// formula) exatamente como estavam.
function setCellsInRow(rowXml, rowNum, updates) {
  const cells = parseCells(rowXml);
  const byCol = new Map(cells.map((c) => [c.col, c]));

  for (const [col, value] of Object.entries(updates)) {
    const existing = byCol.get(col);
    const styleAttr = existing ? styleAttrOf(existing) : '';
    const newCellXml = buildDataCell(col, rowNum, value, styleAttr);
    if (newCellXml) {
      byCol.set(col, { col, row: rowNum, raw: newCellXml, synthetic: true });
    } else {
      byCol.delete(col);
    }
  }

  const ordered = [...byCol.values()].sort(
    (a, b) => colLetterToNum(a.col) - colLetterToNum(b.col)
  );
  const cellsXml = ordered.map((c) => c.raw).join('');

  const openTagMatch = rowXml.match(/^<row[^>]*>/);
  const openTag = openTagMatch ? openTagMatch[0] : `<row r="${rowNum}" spans="1:27">`;
  return `${openTag}${cellsXml}</row>`;
}

// Limpa um conjunto de colunas de uma linha (usado na virada de exercicio):
// mantem a celula com seu estilo/formatacao atual (se tiver) mas sem valor,
// igual as celulas nunca preenchidas da planilha - ao contrario de
// setCellsInRow com valor "", isso NAO apaga a formatacao da celula.
function clearCellsInRow(rowXml, cols) {
  const cells = parseCells(rowXml);
  const colsSet = new Set(cols);
  const partes = cells.map((cell) => {
    if (!colsSet.has(cell.col)) return cell.raw;
    const styleAttr = styleAttrOf(cell);
    return `<c r="${cell.col}${cell.row}"${styleAttr}/>`;
  });
  const openTagMatch = rowXml.match(/^<row[^>]*>/);
  const openTag = openTagMatch ? openTagMatch[0] : '<row>';
  return `${openTag}${partes.join('')}</row>`;
}

module.exports = {
  parseSharedStrings,
  indexRows,
  parseCells,
  cellValue,
  buildDataCell,
  setCellsInRow,
  clearCellsInRow,
  unescapeXml,
};
