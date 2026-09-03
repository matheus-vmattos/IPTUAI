// Utilitarios minimos de SpreadsheetML usados pelo editor cirurgico da
// planilha. Nao e um parser XML genérico - so o suficiente para
// referencias de celula (ex: "AA684") e escapar texto com seguranca.

function colLetterToNum(letters) {
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

function numToColLetter(num) {
  let letters = '';
  let n = num;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function splitCellRef(ref) {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error(`Referencia de celula invalida: ${ref}`);
  return { col: m[1], row: Number(m[2]) };
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = { colLetterToNum, numToColLetter, splitCellRef, escapeXml };
