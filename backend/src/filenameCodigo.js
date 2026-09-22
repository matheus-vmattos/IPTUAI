// Muita gente ja salva/renomeia os PDFs dos carnes com o codigo do imovel no
// nome do arquivo (ex: "I213.pdf", "213 - Rua Tal.pdf"). Isso extrai um
// candidato a partir do nome - e sempre so uma sugestao, o usuario confirma.
const EXERCICIO_MIN = 2000;
const EXERCICIO_MAX = 2099;

function extrairCodigoDoNome(nomeArquivo) {
  if (!nomeArquivo) return null;
  // "_" conta como caractere de palavra pro \b do regex abaixo (nao separa),
  // entao normaliza pra espaco (comum em nomes tipo "carne_213.pdf").
  const base = nomeArquivo.replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');

  // Marcador explicito da coluna "I" (ex: "I213", "I 213", "I-213").
  const comI = base.match(/\bI[\s\-_.]?(\d{1,6})\b/i);
  if (comI) return comI[1];

  // Sem marcador: primeiro numero "solto" que nao parece um ano (carnes
  // costumam trazer o exercicio no nome, ex: "213 - IPTU 2026.pdf").
  const numeros = [...base.matchAll(/\b(\d{1,6})\b/g)].map((m) => m[1]);
  const candidato = numeros.find((n) => {
    const valor = Number(n);
    return !(n.length === 4 && valor >= EXERCICIO_MIN && valor <= EXERCICIO_MAX);
  });
  return candidato || null;
}

module.exports = { extrairCodigoDoNome };
