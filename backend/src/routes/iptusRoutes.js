const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../auth');
const { extrairParcelas } = require('../pdfParser');

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
const TMP_DIR = path.join(UPLOADS_DIR, 'tmp');
const FINAL_DIR = path.join(UPLOADS_DIR, 'iptus');
fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(FINAL_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: TMP_DIR,
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.pdf`),
  }),
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

// Passo 1 do wizard: sobe o PDF e devolve sugestoes de parcelas extraidas
// automaticamente (fluxo hibrido - usuario revisa antes de confirmar).
router.post('/parse', upload.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Envie um arquivo PDF' });

  try {
    const { parceladas, cotaUnica } = await extrairParcelas(req.file.path);
    res.json({
      tempId: req.file.filename,
      nomeOriginal: req.file.originalname,
      parceladas,
      cotaUnica,
    });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    res.status(422).json({ error: 'Nao foi possivel ler o PDF', detalhe: err.message });
  }
});

// Passo 2: confirma os dados revisados pelo usuario e grava o lancamento.
router.post('/', (req, res) => {
  const { tempId, nomeOriginal, codigoImovel, exercicio, tipoPagamento, formaPagamento, parcelas } =
    req.body;

  if (!tempId) return res.status(400).json({ error: 'tempId ausente - refaca o upload' });
  if (!codigoImovel || !codigoImovel.trim()) {
    return res.status(400).json({ error: 'Informe o codigo de identificacao do imovel' });
  }
  if (!['unica', 'parcelado'].includes(tipoPagamento)) {
    return res.status(400).json({ error: 'tipoPagamento deve ser "unica" ou "parcelado"' });
  }
  if (!['imobiliaria', 'repassado'].includes(formaPagamento)) {
    return res.status(400).json({ error: 'formaPagamento deve ser "imobiliaria" ou "repassado"' });
  }
  if (!Array.isArray(parcelas) || parcelas.length === 0) {
    return res.status(400).json({ error: 'Informe ao menos uma parcela' });
  }
  for (const p of parcelas) {
    if (!p.numero || !p.valor || !p.vencimento) {
      return res.status(400).json({ error: 'Cada parcela precisa de numero, valor e vencimento' });
    }
  }
  const numerosVistos = new Set();
  for (const p of parcelas) {
    if (numerosVistos.has(Number(p.numero))) {
      return res.status(400).json({ error: `Numero de parcela ${p.numero} esta duplicado` });
    }
    numerosVistos.add(Number(p.numero));
  }

  const tmpPath = path.join(TMP_DIR, path.basename(tempId));
  if (!fs.existsSync(tmpPath)) {
    return res.status(410).json({ error: 'Arquivo temporario expirado - refaca o upload' });
  }

  const codigoNorm = codigoImovel.trim().toUpperCase().replace(/\s+/g, ' ');

  const insertIptu = db.prepare(`
    INSERT INTO iptus (imovel_id, exercicio, tipo_pagamento, forma_pagamento, arquivo_nome, arquivo_path, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertParcela = db.prepare(`
    INSERT INTO parcelas (iptu_id, numero, valor, vencimento) VALUES (?, ?, ?, ?)
  `);

  const finalName = `${crypto.randomUUID()}.pdf`;
  const finalPath = path.join(FINAL_DIR, finalName);

  const criarLancamento = db.transaction((caminhoRelativoArquivo) => {
    let imovel = db.prepare('SELECT * FROM imoveis WHERE codigo = ?').get(codigoNorm);
    if (!imovel) {
      const infoImovel = db
        .prepare('INSERT INTO imoveis (codigo, created_by) VALUES (?, ?)')
        .run(codigoNorm, req.user.sub);
      imovel = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(infoImovel.lastInsertRowid);
    }

    const infoIptu = insertIptu.run(
      imovel.id,
      exercicio || null,
      tipoPagamento,
      formaPagamento,
      nomeOriginal || 'iptu.pdf',
      caminhoRelativoArquivo,
      req.user.sub
    );
    for (const p of parcelas) {
      insertParcela.run(infoIptu.lastInsertRowid, Number(p.numero), Number(p.valor), p.vencimento);
    }
    return { imovel, iptuId: infoIptu.lastInsertRowid };
  });

  // So move o arquivo para o destino final depois que sabemos que o
  // registro no banco foi gravado - assim uma falha na gravacao (ex:
  // numero de parcela duplicado) nao deixa o PDF orfao nem obriga a
  // pessoa a reenviar o arquivo do zero.
  let resultado;
  try {
    fs.renameSync(tmpPath, finalPath);
    resultado = criarLancamento(path.relative(UPLOADS_DIR, finalPath));
  } catch (err) {
    if (fs.existsSync(finalPath) && !fs.existsSync(tmpPath)) {
      fs.renameSync(finalPath, tmpPath);
    }
    return res.status(400).json({ error: 'Nao foi possivel salvar o lancamento', detalhe: err.message });
  }

  const iptu = db.prepare('SELECT * FROM iptus WHERE id = ?').get(resultado.iptuId);
  const parcelasSalvas = db
    .prepare('SELECT * FROM parcelas WHERE iptu_id = ? ORDER BY numero')
    .all(resultado.iptuId);

  res.status(201).json({ ...iptu, imovel: resultado.imovel, parcelas: parcelasSalvas });
});

router.get('/:id/arquivo', (req, res) => {
  const iptu = db.prepare('SELECT * FROM iptus WHERE id = ?').get(req.params.id);
  if (!iptu) return res.status(404).json({ error: 'IPTU nao encontrado' });

  const fullPath = path.join(UPLOADS_DIR, iptu.arquivo_path);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Arquivo nao encontrado no servidor' });

  res.sendFile(fullPath);
});

module.exports = router;
