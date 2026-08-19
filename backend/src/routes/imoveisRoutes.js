const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

function normalizaCodigo(codigo) {
  return codigo.trim().toUpperCase().replace(/\s+/g, ' ');
}

router.get('/', (req, res) => {
  const busca = (req.query.q || '').trim();
  const imoveis = busca
    ? db
        .prepare('SELECT * FROM imoveis WHERE codigo LIKE ? ORDER BY codigo')
        .all(`%${normalizaCodigo(busca)}%`)
    : db.prepare('SELECT * FROM imoveis ORDER BY codigo').all();
  res.json(imoveis);
});

router.get('/:codigo', (req, res) => {
  const codigo = normalizaCodigo(req.params.codigo);
  const imovel = db.prepare('SELECT * FROM imoveis WHERE codigo = ?').get(codigo);
  if (!imovel) return res.status(404).json({ error: 'Imovel nao encontrado' });

  const iptus = db
    .prepare('SELECT * FROM iptus WHERE imovel_id = ? ORDER BY exercicio DESC, id DESC')
    .all(imovel.id);

  const iptusComParcelas = iptus.map((iptu) => ({
    ...iptu,
    parcelas: db
      .prepare('SELECT * FROM parcelas WHERE iptu_id = ? ORDER BY numero')
      .all(iptu.id),
  }));

  res.json({ ...imovel, iptus: iptusComParcelas });
});

router.post('/', (req, res) => {
  const { codigo, endereco } = req.body;
  if (!codigo || !codigo.trim()) {
    return res.status(400).json({ error: 'Informe o codigo de identificacao (ex: I 213)' });
  }

  const codigoNorm = normalizaCodigo(codigo);
  const existente = db.prepare('SELECT * FROM imoveis WHERE codigo = ?').get(codigoNorm);
  if (existente) return res.json(existente);

  const info = db
    .prepare('INSERT INTO imoveis (codigo, endereco, created_by) VALUES (?, ?, ?)')
    .run(codigoNorm, endereco || null, req.user.sub);

  res.status(201).json(db.prepare('SELECT * FROM imoveis WHERE id = ?').get(info.lastInsertRowid));
});

module.exports = router;
