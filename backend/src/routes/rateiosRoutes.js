const express = require('express');
const excelStore = require('../excelStore');
const asyncHandler = require('../asyncHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const grupos = await excelStore.listarGruposDeRateio();
    res.json(grupos);
  })
);

router.get(
  '/:rotulo',
  asyncHandler(async (req, res) => {
    const grupo = await excelStore.getGrupoDeRateio(req.params.rotulo);
    res.json(grupo);
  })
);

module.exports = router;
