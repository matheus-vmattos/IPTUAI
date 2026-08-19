const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../auth');
const { extrairParcelas } = require('../pdfParser');
const asyncHandler = require('../asyncHandler');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Apenas arquivos PDF sao aceitos'));
    }
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = express.Router();
router.use(requireAuth);

// Passo 1 do wizard: sobe o PDF (fica so em memoria) e devolve sugestoes de
// parcelas extraidas automaticamente (fluxo hibrido - usuario revisa antes
// de confirmar). Nada e salvo aqui - o arquivo e reenviado no passo final.
router.post(
  '/parse',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Envie um arquivo PDF' });

    try {
      const { parceladas, cotaUnica } = await extrairParcelas(req.file.buffer);
      res.json({ nomeOriginal: req.file.originalname, parceladas, cotaUnica });
    } catch (err) {
      res.status(422).json({ error: 'Nao foi possivel ler o PDF', detalhe: err.message });
    }
  })
);

// Passo 2: confirma os dados revisados pelo usuario e grava o lancamento,
// junto com o PDF (reenviado nesta mesma requisicao) guardado como BLOB no
// banco - sem depender de disco local, o backend funciona em qualquer
// hospedagem gratuita sem armazenamento persistente.
router.post(
  '/',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Envie o arquivo PDF' });

    const { codigoImovel, exercicio, tipoPagamento, formaPagamento } = req.body;

    let parcelas;
    try {
      parcelas = JSON.parse(req.body.parcelas || '[]');
    } catch {
      return res.status(400).json({ error: 'Lista de parcelas invalida' });
    }

    if (!codigoImovel || !codigoImovel.trim()) {
      return res.status(400).json({ error: 'Informe o codigo de identificacao do imovel' });
    }
    if (!['unica', 'parcelado'].includes(tipoPagamento)) {
      return res.status(400).json({ error: 'tipoPagamento deve ser "unica" ou "parcelado"' });
    }
    if (!['imobiliaria', 'repassado'].includes(formaPagamento)) {
      return res
        .status(400)
        .json({ error: 'formaPagamento deve ser "imobiliaria" ou "repassado"' });
    }
    if (!Array.isArray(parcelas) || parcelas.length === 0) {
      return res.status(400).json({ error: 'Informe ao menos uma parcela' });
    }
    for (const p of parcelas) {
      if (!p.numero || !p.valor || !p.vencimento) {
        return res
          .status(400)
          .json({ error: 'Cada parcela precisa de numero, valor e vencimento' });
      }
    }
    const numerosVistos = new Set();
    for (const p of parcelas) {
      if (numerosVistos.has(Number(p.numero))) {
        return res.status(400).json({ error: `Numero de parcela ${p.numero} esta duplicado` });
      }
      numerosVistos.add(Number(p.numero));
    }

    const codigoNorm = codigoImovel.trim().toUpperCase().replace(/\s+/g, ' ');

    const tx = await db.client.transaction('write');
    try {
      const imovelResult = await tx.execute({
        sql: 'SELECT * FROM imoveis WHERE codigo = ?',
        args: [codigoNorm],
      });
      let imovel = imovelResult.rows[0];
      if (!imovel) {
        const insertImovel = await tx.execute({
          sql: 'INSERT INTO imoveis (codigo, created_by) VALUES (?, ?)',
          args: [codigoNorm, req.user.sub],
        });
        const novoImovel = await tx.execute({
          sql: 'SELECT * FROM imoveis WHERE id = ?',
          args: [Number(insertImovel.lastInsertRowid)],
        });
        imovel = novoImovel.rows[0];
      }

      const insertIptu = await tx.execute({
        sql: `INSERT INTO iptus (imovel_id, exercicio, tipo_pagamento, forma_pagamento, arquivo_nome, arquivo_blob, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          imovel.id,
          exercicio || null,
          tipoPagamento,
          formaPagamento,
          req.file.originalname || 'iptu.pdf',
          req.file.buffer,
          req.user.sub,
        ],
      });
      const iptuId = Number(insertIptu.lastInsertRowid);

      for (const p of parcelas) {
        await tx.execute({
          sql: 'INSERT INTO parcelas (iptu_id, numero, valor, vencimento) VALUES (?, ?, ?, ?)',
          args: [iptuId, Number(p.numero), Number(p.valor), p.vencimento],
        });
      }

      await tx.commit();

      const iptu = await db.get(
        `SELECT id, imovel_id, exercicio, tipo_pagamento, forma_pagamento, arquivo_nome, created_by, created_at
         FROM iptus WHERE id = ?`,
        [iptuId]
      );
      const parcelasSalvas = await db.all('SELECT * FROM parcelas WHERE iptu_id = ? ORDER BY numero', [
        iptuId,
      ]);

      res.status(201).json({ ...iptu, imovel, parcelas: parcelasSalvas });
    } catch (err) {
      await tx.rollback();
      res.status(400).json({ error: 'Nao foi possivel salvar o lancamento', detalhe: err.message });
    }
  })
);

router.get(
  '/:id/arquivo',
  asyncHandler(async (req, res) => {
    const iptu = await db.get('SELECT arquivo_nome, arquivo_blob FROM iptus WHERE id = ?', [
      req.params.id,
    ]);
    if (!iptu) return res.status(404).json({ error: 'IPTU nao encontrado' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${iptu.arquivo_nome}"`);
    res.send(Buffer.from(iptu.arquivo_blob));
  })
);

module.exports = router;
