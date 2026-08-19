const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const asyncHandler = require('../asyncHandler');

const router = express.Router();
router.use(requireAuth);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!['pendente', 'pago'].includes(status)) {
      return res.status(400).json({ error: 'status deve ser "pendente" ou "pago"' });
    }

    const parcela = await db.get('SELECT * FROM parcelas WHERE id = ?', [req.params.id]);
    if (!parcela) return res.status(404).json({ error: 'Parcela nao encontrada' });

    await db.run('UPDATE parcelas SET status = ?, paid_at = ? WHERE id = ?', [
      status,
      status === 'pago' ? new Date().toISOString() : null,
      parcela.id,
    ]);

    const atualizada = await db.get('SELECT * FROM parcelas WHERE id = ?', [parcela.id]);
    res.json(atualizada);
  })
);

module.exports = router;
