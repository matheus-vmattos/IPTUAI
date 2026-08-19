const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.patch('/:id', (req, res) => {
  const { status } = req.body;
  if (!['pendente', 'pago'].includes(status)) {
    return res.status(400).json({ error: 'status deve ser "pendente" ou "pago"' });
  }

  const parcela = db.prepare('SELECT * FROM parcelas WHERE id = ?').get(req.params.id);
  if (!parcela) return res.status(404).json({ error: 'Parcela nao encontrada' });

  db.prepare('UPDATE parcelas SET status = ?, paid_at = ? WHERE id = ?').run(
    status,
    status === 'pago' ? new Date().toISOString() : null,
    parcela.id
  );

  res.json(db.prepare('SELECT * FROM parcelas WHERE id = ?').get(parcela.id));
});

module.exports = router;
