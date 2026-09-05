const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Single merchant-role account for MVP (FR-23) — credentials come from env,
// never hardcoded/committed. No RBAC needed at this scale.
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  const expectedUser = process.env.MERCHANT_USERNAME;
  const expectedPass = process.env.MERCHANT_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;

  if (!expectedUser || !expectedPass || !jwtSecret) {
    return res.status(500).json({ error: 'Server auth is not configured (missing env vars).' });
  }

  if (username !== expectedUser || password !== expectedPass) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = jwt.sign({ sub: username, role: 'merchant' }, jwtSecret, { expiresIn: '12h' });
  res.json({ token, expiresIn: '12h' });
});

module.exports = router;