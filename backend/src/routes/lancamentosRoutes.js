const express = require('express');
const multer = require('multer');
const fs = require('fs/promises');
const path = require('path');
const excelStore = require('../excelStore');
const { extrairParcelas, resumirParcelas } = require('../pdfParser');
const { extrairCodigoDoNome } = require('../filenameCodigo');
const asyncHandler = require('../asyncHandler');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Apenas arquivos PDF são aceitos'));
    }
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = express.Router();

// Passo 1: sobe o PDF (so em memoria) e devolve sugestoes de valores
// extraidos automaticamente. Nada e salvo aqui - o usuario revisa antes de
// confirmar o lancamento.
router.post(
  '/extrair',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Envie um arquivo PDF' });

    try {
      const { parceladas, cotaUnica } = await extrairParcelas(req.file.buffer);
      const resumoParcelas = resumirParcelas(parceladas);

      const codigoSugerido = extrairCodigoDoNome(req.file.originalname);
      let imovelSugerido = null;
      if (codigoSugerido) {
        imovelSugerido = await excelStore.getImovel(codigoSugerido).catch(() => null);
      }

      res.json({
        nomeOriginal: req.file.originalname,
        parceladas,
        cotaUnica,
        resumoParcelas,
        codigoSugerido,
        imovelSugerido,
      });
    } catch (err) {
      res.status(422).json({ error: 'Não foi possível ler o PDF', detalhe: err.message });
    }
  })
);

function sanitizarNomeArquivo(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Passo 2: confirma os dados revisados e grava o lancamento direto na
// planilha (aba IPTU). O PDF, se enviado, e salvo na pasta configurada e o
// caminho vira o "Link do carnê" da linha.
router.post(
  '/',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const { codigo, tributo, formaPgto } = body;

    if (!codigo || !String(codigo).trim()) {
      return res.status(400).json({ error: 'Informe o código de identificação do imóvel (coluna I)' });
    }
    if (!['IPTU', 'DATI'].includes(tributo)) {
      return res.status(400).json({ error: 'tributo deve ser "IPTU" ou "DATI"' });
    }
    if (!['Cota única', 'Parcelado'].includes(formaPgto)) {
      return res.status(400).json({ error: 'formaPgto deve ser "Cota única" ou "Parcelado"' });
    }

    const payload = {
      codigo: String(codigo).trim(),
      tributo,
      formaPgto,
      proprietario: body.proprietario || undefined,
      nominalIptu: body.nominalIptu || undefined,
      inscricaoIptu: body.inscricaoIptu || undefined,
      dati: body.dati || undefined,
      quemPaga: body.quemPaga || undefined,
      obs: body.obs || undefined,
      imovelDeRateio: body.imovelDeRateio || undefined,
    };

    if (formaPgto === 'Cota única') {
      const valor = Number(body.cotaUnica);
      if (!body.cotaUnica || Number.isNaN(valor)) {
        return res.status(400).json({ error: 'Informe o valor da cota única' });
      }
      payload.cotaUnica = valor;
    } else {
      const valor = Number(body.parcela);
      if (!body.parcela || Number.isNaN(valor)) {
        return res.status(400).json({ error: 'Informe o valor da parcela' });
      }
      payload.parcela = valor;
      if (body.ultimaParcela !== undefined && body.ultimaParcela !== '') {
        const ultima = Number(body.ultimaParcela);
        if (Number.isNaN(ultima)) {
          return res.status(400).json({ error: 'Valor da última parcela inválido' });
        }
        payload.ultimaParcela = ultima;
      }
    }

    if (req.file) {
      const config = await excelStore.readConfig();
      if (!config.pdfFolder) {
        return res
          .status(400)
          .json({ error: 'Configure a pasta onde salvar os carnês em Configurações' });
      }
      await fs.mkdir(config.pdfFolder, { recursive: true });

      const nome = `${sanitizarNomeArquivo(payload.codigo)}_${tributo}_${Date.now()}.pdf`;
      const destino = path.join(config.pdfFolder, nome);
      await fs.writeFile(destino, req.file.buffer);
      payload.linkCarne = destino;
    }

    const resultado = await excelStore.lancarTributo(payload);
    res.status(201).json(resultado);
  })
);

module.exports = router;
