const express = require('express');
const { computeMetrics } = require('../services/metricsService');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(computeMetrics());
});

module.exports = router;