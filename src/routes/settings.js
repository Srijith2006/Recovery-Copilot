const express = require('express');
const { getAllSettings, setSetting } = require('../services/configService');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(getAllSettings());
});

router.put('/', (req, res) => {
  const { max_attempts, contact_window_hours } = req.body || {};

  if (max_attempts != null) {
    const n = Number(max_attempts);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      return res.status(400).json({ error: 'max_attempts must be an integer between 1 and 10.' });
    }
    setSetting('max_attempts', n);
  }

  if (contact_window_hours != null) {
    const n = Number(contact_window_hours);
    if (!Number.isFinite(n) || n < 1 || n > 168) {
      return res.status(400).json({ error: 'contact_window_hours must be between 1 and 168.' });
    }
    setSetting('contact_window_hours', n);
  }

  res.json(getAllSettings());
});

module.exports = router;