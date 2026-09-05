const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const webhooksRouter = require('./routes/webhooks');
const simulateRouter = require('./routes/simulate');
const casesRouter = require('./routes/cases');
const caseActionsRouter = require('./routes/caseActions');
const metricsRouter = require('./routes/metrics');
const settingsRouter = require('./routes/settings');
const authRouter = require('./routes/auth');
const { requireAuth } = require('./middleware/auth');

const app = express();

app.use(cors());
app.use(morgan('dev'));

// /webhooks/razorpay needs the raw request body for signature verification,
// so it has its own express.json({ verify }) mounted inside the router
// itself, ahead of this global parser. Order matters: mount it first.
app.use('/webhooks', webhooksRouter);

app.use(express.json());

// Public
app.use('/auth', authRouter);
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'recovery-copilot', time: new Date().toISOString() });
});

// Merchant-facing (dashboard) routes require login (FR-23).
app.use('/simulate', requireAuth, simulateRouter);
app.use('/cases', requireAuth, casesRouter);
app.use('/cases', requireAuth, caseActionsRouter);
app.use('/metrics', requireAuth, metricsRouter);
app.use('/settings', requireAuth, settingsRouter);

module.exports = app;