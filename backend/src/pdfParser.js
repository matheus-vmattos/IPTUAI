const fs = require('fs');
const pdfParse = require('pdf-parse');

const DATE_RE = /(\d{2})[\/.-](\d{2})[\/.-](\d{4})/;
const VALUE_RE = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/;
const PARCELA_RE = /parcela\s*(?:n[ºo.]?\s*)?(\d{1,2})|(\d{1,2})\s*\/\s*\d{1,2}\s*(?:parcela)?|cota\s*(?:n[ºo.]?\s*)?(\d{1,2})/i;

function parseValor(str) {
  return Number(str.replace(/\./g, '').replace(',', '.'));
}

function parseData(str) {
  const m = str.match(DATE_RE);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Extrai candidatos a parcela (numero, valor, vencimento) linha a linha.
 * Heuristica simples: cada linha que tiver uma data E um valor monetario
 * vira uma candidata. O numero da parcela e inferido da propria linha ou
 * da posicao (1a linha encontrada = parcela 1, etc). Isso e so um ponto de
 * partida - o usuario sempre revisa/edita antes de confirmar (fluxo hibrido).
 */
async function extrairParcelas(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const linhas = data.text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const candidatas = [];
  let ordem = 0;

  for (const linha of linhas) {
    const dataMatch = linha.match(DATE_RE);
    const valorMatch = linha.match(VALUE_RE);
    if (!dataMatch || !valorMatch) continue;

    ordem += 1;
    const parcelaMatch = linha.match(PARCELA_RE);
    const numero = parcelaMatch
      ? Number(parcelaMatch[1] || parcelaMatch[2] || parcelaMatch[3])
      : ordem;

    candidatas.push({
      numero,
      valor: parseValor(valorMatch[1]),
      vencimento: parseData(dataMatch[0]),
      linhaOriginal: linha,
    });
  }

  // Remove duplicatas exatas (mesma data+valor) que aparecem por causa de
  // cabecalho/rodape repetido no PDF.
  const vistos = new Set();
  const unicas = candidatas.filter((c) => {
    const chave = `${c.numero}-${c.valor}-${c.vencimento}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });

  return {
    textoBruto: data.text,
    parcelasSugeridas: unicas,
  };
}

module.exports = { extrairParcelas };
