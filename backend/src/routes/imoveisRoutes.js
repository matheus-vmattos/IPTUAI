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

router.get(
  '/:codigo',
  asyncHandler(async (req, res) => {
    const imovel = await excelStore.getImovel(req.params.codigo);
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado na planilha' });
    res.json(imovel);
  })
);

// Edicao livre: aceita qualquer subconjunto dos campos da linha (mesmos
// nomes usados no resto da API: proprietario, nominalIptu, inscricaoIptu,
// dati, quemPagaIptu, quemPagaDati, formaPgto, iptuCotaUnica, iptuParcela,
// iptuUltimaParcela, datiCotaUnica, datiParcela, datiUltimaParcela,
// linkCarne, iptuSalvo, iptuLancado, datiSalvo, datiLancado,
// imovelDeRateio, obs). So funciona pra imovel ja existente.
router.patch(
  '/:codigo',
  asyncHandler(async (req, res) => {
    const resultado = await excelStore.atualizarImovel(req.params.codigo, req.body || {});
    res.json(resultado);
  })
);

router.patch(
  '/:codigo/lancado',
  asyncHandler(async (req, res) => {
    const { tributo, status } = req.body;
    if (!['IPTU', 'DATI'].includes(tributo)) {
      return res.status(400).json({ error: 'tributo deve ser "IPTU" ou "DATI"' });
    }
    const resultado = await excelStore.marcarLancado({
      codigo: req.params.codigo,
      tributo,
      status: status || 'Feito',
    });
    res.json(resultado);
  })
);

module.exports = router;
