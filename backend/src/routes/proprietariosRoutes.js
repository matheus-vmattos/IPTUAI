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

// Renomeia o proprietario em todas as linhas dele de uma vez (ex: imovel
// mudou de dono) - body: { novoNome }.
router.patch(
  '/:nome',
  asyncHandler(async (req, res) => {
    const { novoNome } = req.body || {};
    if (!novoNome || !String(novoNome).trim()) {
      return res.status(400).json({ error: 'Informe o novo nome do proprietário' });
    }
    const resultado = await excelStore.renomearProprietario(req.params.nome, novoNome);
    res.json(resultado);
  })
);

module.exports = router;
