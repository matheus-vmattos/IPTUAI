const express = require('express');
const excelStore = require('../excelStore');
const asyncHandler = require('../asyncHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const proprietarios = await excelStore.listarProprietarios(req.query.q || '');
    res.json(proprietarios);
  })
);

router.get(
  '/:nome',
  asyncHandler(async (req, res) => {
    const resumo = await excelStore.getResumoProprietario(req.params.nome);
    if (!resumo) return res.status(404).json({ error: 'Proprietário não encontrado na planilha' });
    res.json(resumo);
  })
);

module.exports = router;
