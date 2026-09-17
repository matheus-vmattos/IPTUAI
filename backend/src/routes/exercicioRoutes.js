const express = require('express');
const excelStore = require('../excelStore');
const asyncHandler = require('../asyncHandler');

const router = express.Router();

// Virada de ano: limpa valores/status/quem paga/forma de pgto de todas as
// linhas (mantendo proprietário, inscrições, rateio, OBS) e atualiza o
// exercício da planilha. Faz backup do arquivo original antes de mexer.
router.post(
  '/novo',
  asyncHandler(async (req, res) => {
    const { ano } = req.body || {};
    if (!ano) return res.status(400).json({ error: 'Informe o novo ano (ex: 2027)' });
    const resultado = await excelStore.iniciarNovoExercicio(ano);
    res.json(resultado);
  })
);

module.exports = router;
