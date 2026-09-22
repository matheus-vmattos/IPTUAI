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
      const { parceladas, cotaUnica, inscricaoDetectada } = await extrairParcelas(req.file.buffer);
      const resumoParcelas = resumirParcelas(parceladas);

      const codigoSugerido = extrairCodigoDoNome(req.file.originalname);
      let imovelSugerido = null;
      if (codigoSugerido) {
        imovelSugerido = await excelStore.getImovel(codigoSugerido).catch(() => null);
      }

      // A inscricao lida de dentro do PDF e mais confiavel que o codigo
      // tirado do nome do arquivo (que costuma ser so uma referencia do CRM
      // do usuario, e pode nao bater com o codigo "I" real - ex: imoveis de
      // rateio, onde uma inscricao se espalha por varias linhas).
      let imoveisPorInscricao = [];
      if (inscricaoDetectada) {
        imoveisPorInscricao = await excelStore.buscarPorInscricao(inscricaoDetectada).catch(() => []);
      }

      res.json({
        nomeOriginal: req.file.originalname,
        parceladas,
        cotaUnica,
        resumoParcelas,
        codigoSugerido,
        imovelSugerido,
        inscricaoDetectada,
        imoveisPorInscricao,
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

// Valida um item bruto (do form ou de um item de array JSON) e monta o
// payload de excelStore.lancarTributo - usado tanto pelo lancamento normal
// quanto por cada linha de um lancamento de rateio (POST /rateio). "extras"
// sobrescreve campos do item (ex: imovelDeRateio e linkCarne forcados pro
// rotulo/arquivo do rateio inteiro).
function montarPayloadLancamento(item, tributo, extras) {
  const codigo = item.codigo;
  const formaPgto = item.formaPgto;
  if (!codigo || !String(codigo).trim()) {
    throw Object.assign(new Error('Informe o código de identificação do imóvel (coluna I)'), { status: 400 });
  }
  if (!['Cota única', 'Parcelado'].includes(formaPgto)) {
    throw Object.assign(new Error('formaPgto deve ser "Cota única" ou "Parcelado"'), { status: 400 });
  }

  const payload = {
    codigo: String(codigo).trim(),
    tributo,
    formaPgto,
    proprietario: item.proprietario || undefined,
    nominalIptu: item.nominalIptu || undefined,
    inscricaoIptu: item.inscricaoIptu || undefined,
    dati: item.dati || undefined,
    quemPaga: item.quemPaga || undefined,
    obs: item.obs || undefined,
    imovelDeRateio: item.imovelDeRateio || undefined,
    ...extras,
  };

  if (item.reajustePct !== undefined && item.reajustePct !== '') {
    const pct = Number(item.reajustePct);
    if (Number.isNaN(pct)) throw Object.assign(new Error('% de reajuste inválido'), { status: 400 });
    payload.reajustePct = pct;
  }

  if (formaPgto === 'Cota única') {
    const valor = Number(item.cotaUnica);
    if (!item.cotaUnica || Number.isNaN(valor)) {
      throw Object.assign(new Error('Informe o valor da cota única'), { status: 400 });
    }
    payload.cotaUnica = valor;
  } else {
    const valor = Number(item.parcela);
    if (!item.parcela || Number.isNaN(valor)) {
      throw Object.assign(new Error('Informe o valor da parcela'), { status: 400 });
    }
    payload.parcela = valor;
    // Em branco = "última parcela igual à parcela normal" (como o rótulo do
    // campo promete) - grava o mesmo valor explicitamente, em vez de deixar
    // de enviar o campo. Do contrário, ao editar/dividir uma linha que já
    // tinha uma última parcela diferente de antes, o valor antigo ficava
    // "grudado" na planilha mesmo sem o usuário pedir isso.
    if (item.ultimaParcela !== undefined && item.ultimaParcela !== '') {
      const ultima = Number(item.ultimaParcela);
      if (Number.isNaN(ultima)) {
        throw Object.assign(new Error('Valor da última parcela inválido'), { status: 400 });
      }
      payload.ultimaParcela = ultima;
    } else {
      payload.ultimaParcela = valor;
    }
  }

  return payload;
}

// Passo 2: confirma os dados revisados e grava o lancamento direto na
// planilha (aba IPTU). O PDF, se enviado, e salvo na pasta configurada e o
// caminho vira o "Link do carnê" da linha.
router.post(
  '/',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!['IPTU', 'DATI'].includes(body.tributo)) {
      return res.status(400).json({ error: 'tributo deve ser "IPTU" ou "DATI"' });
    }

    let payload;
    try {
      payload = montarPayloadLancamento(body, body.tributo, {});
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    if (req.file) {
      const config = await excelStore.readConfig();
      if (!config.pdfFolder) {
        return res
          .status(400)
          .json({ error: 'Configure a pasta onde salvar os carnês em Configurações' });
      }
      await fs.mkdir(config.pdfFolder, { recursive: true });

      const nome = `${sanitizarNomeArquivo(payload.codigo)}_${body.tributo}_${Date.now()}.pdf`;
      const destino = path.join(config.pdfFolder, nome);
      await fs.writeFile(destino, req.file.buffer);
      payload.linkCarne = destino;
    }

    const resultado = await excelStore.lancarTributo(payload);
    res.status(201).json(resultado);
  })
);

// Lancamento de um imovel de rateio: um unico carne cobre varias linhas "I"
// da planilha (cada uma com sua propria divisao de valor, que costuma
// variar - nao e sempre igual). Salva o PDF uma vez so e grava cada linha
// com o rotulo do rateio ("Imovel de rateio") e o mesmo link do carne, pra
// aparecer em todas quando consultadas.
router.post(
  '/rateio',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const { rotulo, tributo } = body;

    if (!rotulo || !String(rotulo).trim()) {
      return res.status(400).json({ error: 'Informe o número do imóvel de rateio' });
    }
    if (!['IPTU', 'DATI'].includes(tributo)) {
      return res.status(400).json({ error: 'tributo deve ser "IPTU" ou "DATI"' });
    }

    let itens;
    try {
      itens = JSON.parse(body.itens);
    } catch {
      return res.status(400).json({ error: 'Lista de itens do rateio inválida' });
    }
    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Informe ao menos uma linha do rateio' });
    }

    let linkCarne;
    if (req.file) {
      const config = await excelStore.readConfig();
      if (!config.pdfFolder) {
        return res
          .status(400)
          .json({ error: 'Configure a pasta onde salvar os carnês em Configurações' });
      }
      await fs.mkdir(config.pdfFolder, { recursive: true });

      const nome = `rateio-${sanitizarNomeArquivo(rotulo)}_${tributo}_${Date.now()}.pdf`;
      const destino = path.join(config.pdfFolder, nome);
      await fs.writeFile(destino, req.file.buffer);
      linkCarne = destino;
    }

    const extras = { imovelDeRateio: String(rotulo).trim() };
    if (linkCarne) extras.linkCarne = linkCarne;

    // Grava uma linha de cada vez (sequencial, nao em paralelo) - cada
    // chamada carrega e salva o arquivo inteiro, e escritas concorrentes no
    // mesmo zip corromperiam a planilha. Um item com erro nao interrompe os
    // outros - fica registrado no resultado pra revisão.
    const resultados = [];
    for (const item of itens) {
      try {
        const payload = montarPayloadLancamento(item, tributo, extras);
        const resultado = await excelStore.lancarTributo(payload);
        resultados.push({ codigo: item.codigo, status: 'sucesso', ...resultado });
      } catch (err) {
        resultados.push({
          codigo: item.codigo,
          status: 'erro',
          mensagem: err.message,
          candidatos: err.candidatos,
        });
      }
    }

    res.status(201).json({ rotulo: String(rotulo).trim(), tributo, linkCarne, resultados });
  })
);

module.exports = router;
