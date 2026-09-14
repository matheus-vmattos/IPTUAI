const express = require('express');
const excelStore = require('../excelStore');
const asyncHandler = require('../asyncHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const imoveis = await excelStore.listImoveis(req.query.q || '');
    res.json(imoveis);
  })
);

// Codigo "I" normalmente e unico, mas a planilha real tem casos de um
// mesmo codigo em varias linhas (ex: um "I" com mais de uma
// inscricao/guia de IPTU) - nesse caso o backend devolve 409 com a lista
// de candidatos, e o parametro ?inscricao= desambigua qual linha usar.
router.get(
  '/:codigo',
  asyncHandler(async (req, res) => {
    const imovel = await excelStore.getImovel(req.params.codigo, req.query.inscricao);
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado na planilha' });
    res.json(imovel);
  })
);

// Edicao livre: aceita qualquer subconjunto dos campos da linha (mesmos
// nomes usados no resto da API: proprietario, nominalIptu, inscricaoIptu,
// dati, quemPagaIptu, quemPagaDati, formaPgto, iptuCotaUnica, iptuParcela,
// iptuUltimaParcela, datiCotaUnica, datiParcela, datiUltimaParcela,
// linkCarne, iptuSalvo, iptuLancado, datiSalvo, datiLancado,
// imovelDeRateio, obs). So funciona pra imovel ja existente. ?inscricao=
// desambigua qual linha, se o codigo bater em mais de uma - usa a
// inscricao ORIGINAL da linha (antes da edicao), nunca o valor novo que
// porventura esteja sendo editado no mesmo corpo da requisicao.
router.patch(
  '/:codigo',
  asyncHandler(async (req, res) => {
    const resultado = await excelStore.atualizarImovel(req.params.codigo, req.body || {}, req.query.inscricao);
    res.json(resultado);
  })
);

router.patch(
  '/:codigo/lancado',
  asyncHandler(async (req, res) => {
    const { tributo, status, inscricao } = req.body;
    if (!['IPTU', 'DATI'].includes(tributo)) {
      return res.status(400).json({ error: 'tributo deve ser "IPTU" ou "DATI"' });
    }
    const resultado = await excelStore.marcarLancado({
      codigo: req.params.codigo,
      tributo,
      status: status || 'Feito',
      inscricao,
    });
    res.json(resultado);
  })
);

module.exports = router;
