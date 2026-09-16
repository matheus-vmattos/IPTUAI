const express = require('express');
const excelStore = require('../excelStore');
const asyncHandler = require('../asyncHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const provisao = await excelStore.listarProvisao();
    res.json(provisao);
  })
);

module.exports = router;
