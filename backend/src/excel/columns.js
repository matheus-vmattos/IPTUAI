// Mapeamento das colunas da tabela tblIPTU (aba "IPTU") da planilha do
// usuario. As colunas marcadas como formula NUNCA sao escritas pelo app -
// o proprio Excel recalcula (Conta no total, IPTU total, DATI total, Valor
// a pagar, Chave busca, Ordem busca).
const COLUMNS = {
  codigo: 'A', // "I" - código de identificação do imóvel
  proprietario: 'B',
  nominalIptu: 'C',
  inscricaoIptu: 'D',
  dati: 'E',
  quemPagaIptu: 'F',
  quemPagaDati: 'G',
  formaPgto: 'H',
  // I = Conta no total (fórmula)
  iptuCotaUnica: 'J',
  iptuParcela: 'K',
  iptuUltimaParcela: 'L',
  // M = IPTU total (fórmula)
  datiCotaUnica: 'N',
  datiParcela: 'O',
  datiUltimaParcela: 'P',
  // Q = DATI total (fórmula)
  // R = Valor a pagar (fórmula)
  linkCarne: 'S',
  iptuSalvo: 'T',
  iptuLancado: 'U',
  datiSalvo: 'V',
  datiLancado: 'W',
  imovelDeRateio: 'X',
  obs: 'Y',
  // Z = Chave busca (fórmula)
  // AA = Ordem busca (fórmula)
};

const FORMULA_COLUMNS = { contaNoTotal: 'I', iptuTotal: 'M', datiTotal: 'Q', valorAPagar: 'R', chaveBusca: 'Z', ordemBusca: 'AA' };

// Templates exatos das fórmulas, extraídos da própria planilha (mesmas em
// toda a tabela, row 2, 121, 300 e 684 conferidas). {r} = linha atual,
// {rm1} = linha anterior (r-1).
const FORMULA_TEMPLATES = {
  contaNoTotal: (r) => `IF($D${r}="","",IF(COUNTIF($D$2:$D${r},$D${r})=1,"Sim","Não"))`,
  iptuTotal: (r) => `IF($K${r}="","",$K${r}*(Listas!$B$5-1)+IF($L${r}="",$K${r},$L${r}))`,
  datiTotal: (r) => `IF($O${r}="","",$O${r}*(Listas!$B$5-1)+IF($P${r}="",$O${r},$P${r}))`,
  valorAPagar: (r) =>
    `IF($H${r}=Listas!$C$8,IF($J${r}="",0,$J${r})+IF($N${r}="",0,$N${r}),IF($H${r}=Listas!$C$9,IF($M${r}="",0,$M${r})+IF($Q${r}="",0,$Q${r}),""))`,
  chaveBusca: (r) =>
    `LOWER("i "&$A${r}&" "&$A${r}&" "&$B${r}&" "&$C${r}&" "&$D${r}&" "&SUBSTITUTE($D${r},"-","")&" "&$E${r}&" "&SUBSTITUTE($E${r},"-","")&" rateio "&$X${r}&" "&$Y${r})`,
  ordemBusca: (r, rm1) =>
    `IF(AND(Painel!$C$5<>"",ISNUMBER(SEARCH(Painel!$C$5,$Z${r}))),COUNT($AA$1:AA${rm1})+1,"")`,
};

module.exports = { COLUMNS, FORMULA_COLUMNS, FORMULA_TEMPLATES };
