const jwt = require('jsonwebtoken');

/**
 * Protects merchant-facing routes (dashboard: /cases, /metrics, /simulate).
 * Does NOT apply to /webhooks/razorpay (Razorpay itself calls that, verified
 * by signature instead) or /health or /auth/login.
 */
function requireAuth(req, res, next) {
  const authHeader = req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization: Bearer <token> header.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = { requireAuth };