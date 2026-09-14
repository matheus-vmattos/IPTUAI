const express = require('express');
const excelStore = require('../excelStore');
const asyncHandler = require('../asyncHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pendencias = await excelStore.listarPendencias();
    res.json(pendencias);
  })
);

module.exports = router;
