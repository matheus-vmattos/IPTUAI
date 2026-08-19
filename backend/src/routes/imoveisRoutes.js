const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const asyncHandler = require('../asyncHandler');

const router = express.Router();
router.use(requireAuth);

function normalizaCodigo(codigo) {
  return codigo.trim().toUpperCase().replace(/\s+/g, ' ');
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const busca = (req.query.q || '').trim();
    const imoveis = busca
      ? await db.all('SELECT * FROM imoveis WHERE codigo LIKE ? ORDER BY codigo', [
          `%${normalizaCodigo(busca)}%`,
        ])
      : await db.all('SELECT * FROM imoveis ORDER BY codigo');
    res.json(imoveis);
  })
);

router.get(
  '/:codigo',
  asyncHandler(async (req, res) => {
    const codigo = normalizaCodigo(req.params.codigo);
    const imovel = await db.get('SELECT * FROM imoveis WHERE codigo = ?', [codigo]);
    if (!imovel) return res.status(404).json({ error: 'Imovel nao encontrado' });

    // arquivo_blob fica de fora aqui de proposito - so e buscado sob demanda
    // na rota de download/impressao, para nao inflar essa resposta.
    const iptus = await db.all(
      `SELECT id, imovel_id, exercicio, tipo_pagamento, forma_pagamento, arquivo_nome, created_by, created_at
       FROM iptus WHERE imovel_id = ? ORDER BY exercicio DESC, id DESC`,
      [imovel.id]
    );

    const iptusComParcelas = [];
    for (const iptu of iptus) {
      const parcelas = await db.all('SELECT * FROM parcelas WHERE iptu_id = ? ORDER BY numero', [
        iptu.id,
      ]);
      iptusComParcelas.push({ ...iptu, parcelas });
    }

    res.json({ ...imovel, iptus: iptusComParcelas });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { codigo, endereco } = req.body;
    if (!codigo || !codigo.trim()) {
      return res.status(400).json({ error: 'Informe o codigo de identificacao (ex: I 213)' });
    }

    const codigoNorm = normalizaCodigo(codigo);
    const existente = await db.get('SELECT * FROM imoveis WHERE codigo = ?', [codigoNorm]);
    if (existente) return res.json(existente);

    const info = await db.run(
      'INSERT INTO imoveis (codigo, endereco, created_by) VALUES (?, ?, ?)',
      [codigoNorm, endereco || null, req.user.sub]
    );

    const imovel = await db.get('SELECT * FROM imoveis WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json(imovel);
  })
);

module.exports = router;
