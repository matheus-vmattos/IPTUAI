const express = require('express');
const fs = require('fs/promises');
const excelStore = require('../excelStore');
const asyncHandler = require('../asyncHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const config = await excelStore.readConfig();

    let xlsxExists = false;
    if (config.xlsxPath) {
      xlsxExists = await fs
        .access(config.xlsxPath)
        .then(() => true)
        .catch(() => false);
    }

    let listas = null;
    let listasErro = null;
    if (config.xlsxPath && xlsxExists) {
      try {
        listas = await excelStore.getListas();
      } catch (err) {
        listasErro = err.message;
      }
    }

    res.json({ ...config, xlsxExists, listas, listasErro });
  })
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const { xlsxPath, pdfFolder } = req.body;
    const updates = {};
    if (xlsxPath !== undefined) updates.xlsxPath = xlsxPath;
    if (pdfFolder !== undefined) updates.pdfFolder = pdfFolder;

    const config = await excelStore.writeConfig(updates);

    if (config.pdfFolder) {
      await fs.mkdir(config.pdfFolder, { recursive: true }).catch(() => {});
    }

    res.json(config);
  })
);

module.exports = router;
