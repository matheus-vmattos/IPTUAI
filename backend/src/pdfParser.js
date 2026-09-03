const pdfParse = require('pdf-parse');

const DATE_RE = /(\d{2})[\/.-](\d{2})[\/.-](\d{4})/g;

// Carnes de IPTU sao gerados por cada prefeitura com seu proprio layout, mas o
// rotulo do valor da guia costuma usar uma dessas variacoes.
const VALOR_PATTERNS = [
  /Valor da Parcela c\/ ?Taxa:?\s*([\d.,]+)/gi,
  /Valor com Taxa:?\s*([\d.,]+)/gi,
  /Valor Parcela c\/ ?Taxas?:?\s*([\d.,]+)/gi,
  /Valor do Documento:?\s*([\d.,]+)/gi,
  /Valor Total:?\s*([\d.,]+)/gi,
  /Valor a Pagar:?\s*([\d.,]+)/gi,
];

// Sinaliza que aquele valor/vencimento e uma alternativa de pagamento a vista
// (comum ter varias guias de cota unica com desconto diferente por data).
const COTA_UNICA_RE = /COTA\s*[UÚ]NICA|%\s*de\s*desconto/i;

const CONTEXT_WINDOW = 350;
const MAX_DATE_DISTANCE = 400;

function parseValor(str) {
  return Number(str.replace(/\./g, '').replace(',', '.'));
}

function parseData(str) {
  const m = str.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Extratores de texto de PDF (pdf-parse/pdf.js) nao preservam a ordem visual
 * de layouts com colunas/campos posicionados livremente - rotulo e valor
 * frequentemente terminam em linhas diferentes, fora de ordem. Por isso a
 * extracao trabalha sobre o texto "achatado" (sem quebras de linha) e casa
 * cada valor monetario rotulado com a data mais proxima dele no texto, em
 * vez de exigir que estejam na mesma linha.
 */
function extrairCandidatas(flat) {
  const datas = [];
  let m;
  const dateRe = new RegExp(DATE_RE.source, DATE_RE.flags);
  while ((m = dateRe.exec(flat))) {
    datas.push({ index: m.index, texto: m[0] });
  }

  function dataMaisProxima(idx) {
    let melhor = null;
    let menorDist = Infinity;
    for (const d of datas) {
      const dist = Math.abs(d.index - idx);
      if (dist < menorDist) {
        menorDist = dist;
        melhor = d;
      }
    }
    return menorDist <= MAX_DATE_DISTANCE ? melhor : null;
  }

  const candidatas = [];
  for (const padrao of VALOR_PATTERNS) {
    const re = new RegExp(padrao.source, padrao.flags);
    let match;
    while ((match = re.exec(flat))) {
      const data = dataMaisProxima(match.index);
      if (!data) continue;

      const contexto = flat.slice(
        Math.max(0, match.index - CONTEXT_WINDOW),
        match.index + CONTEXT_WINDOW
      );
      const tipo = COTA_UNICA_RE.test(contexto) ? 'unica' : 'parcelado';

      candidatas.push({
        tipo,
        valor: parseValor(match[1]),
        vencimento: parseData(data.texto),
      });
    }
  }

  // Cada guia normalmente aparece impressa duas vezes no PDF (via do banco e
  // via do contribuinte) - mantem so uma ocorrencia por valor+vencimento+tipo.
  const vistos = new Set();
  return candidatas.filter((c) => {
    const chave = `${c.tipo}-${c.valor}-${c.vencimento}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

async function extrairParcelas(buffer) {
  const data = await pdfParse(buffer);
  const flat = data.text.replace(/\s+/g, ' ').trim();

  const candidatas = extrairCandidatas(flat);

  // Parcelado: numera sequencialmente pela ordem de vencimento, ja que o
  // numero da parcela impresso no PDF nem sempre e recuperavel de forma
  // confiavel a partir do texto extraido.
  const parceladas = candidatas
    .filter((c) => c.tipo === 'parcelado')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .map((c, i) => ({ numero: i + 1, valor: c.valor, vencimento: c.vencimento }));

  // Cota unica: podem existir varias guias alternativas (mesmo pagamento a
  // vista, com valores diferentes conforme a data de pagamento/desconto).
  const cotaUnica = candidatas
    .filter((c) => c.tipo === 'unica')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .map((c) => ({ valor: c.valor, vencimento: c.vencimento }));

  return {
    textoBruto: data.text,
    parceladas,
    cotaUnica,
  };
}

/**
 * A planilha nao guarda vencimento por parcela - guarda so o valor de uma
 * parcela "padrao" e, quando a ultima parcela tem valor diferente (comum
 * por causa de arredondamento no rateio do IPTU pelo numero de parcelas),
 * o valor dela separado. O total e calculado pela propria planilha como
 * parcela*(N-1) + ultima.
 */
function resumirParcelas(parceladas) {
  if (!parceladas || parceladas.length === 0) return { parcela: null, ultimaParcela: null };

  const ordenadas = [...parceladas].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const ultima = ordenadas[ordenadas.length - 1];
  const demais = ordenadas.slice(0, -1);

  // Valor mais frequente entre as parcelas (exceto a ultima) - e o que a
  // planilha espera em "parcela". Se so existir a ultima, usa o valor dela.
  const contagem = new Map();
  for (const p of demais) {
    contagem.set(p.valor, (contagem.get(p.valor) || 0) + 1);
  }
  let valorParcela = ultima.valor;
  let maiorContagem = 0;
  for (const [valor, count] of contagem) {
    if (count > maiorContagem) {
      maiorContagem = count;
      valorParcela = valor;
    }
  }

  const ultimaParcela = ultima.valor === valorParcela ? null : ultima.valor;
  return { parcela: valorParcela, ultimaParcela };
}

module.exports = { extrairParcelas, resumirParcelas };
