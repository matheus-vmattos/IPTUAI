const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const excelStore = require('../excelStore');
const asyncHandler = require('../asyncHandler');

const router = express.Router();

// Visualizador embutido: serve o PDF salvo em disco pra abrir num <iframe>
// dentro do próprio app, sem precisar do visualizador externo do sistema
// operacional. Só serve arquivos dentro da pasta de carnês configurada
// (nunca um caminho arbitrário do disco) - o "path" vem do linkCarne já
// gravado na planilha, mas validamos mesmo assim.
router.get(
  '/visualizar',
  asyncHandler(async (req, res) => {
    const alvo = req.query.path;
    if (!alvo) return res.status(400).json({ error: 'Informe o caminho do carnê' });

    const config = await excelStore.readConfig();
    if (!config.pdfFolder) {
      return res.status(400).json({ error: 'Nenhuma pasta de carnês configurada' });
    }

    const pastaResolvida = path.resolve(config.pdfFolder);
    const alvoResolvido = path.resolve(alvo);
    const dentroDaPasta =
      alvoResolvido === pastaResolvida || alvoResolvido.startsWith(pastaResolvida + path.sep);
    if (!dentroDaPasta) {
      return res.status(403).json({ error: 'Arquivo fora da pasta de carnês configurada' });
    }

    let buffer;
    try {
      buffer = await fs.readFile(alvoResolvido);
    } catch {
      return res.status(404).json({ error: 'Arquivo não encontrado no disco' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(alvoResolvido)}"`);
    res.send(buffer);
  })
);

module.exports = router;
