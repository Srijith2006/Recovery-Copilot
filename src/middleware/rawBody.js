// Express's json parser discards the raw bytes it consumes. Signature
// verification needs the *exact* raw body (whitespace and all), so this
// middleware stashes it on req.rawBody before parsing happens.
// Mount this ONLY on the webhook route, ahead of express.json().

function captureRawBody(req, res, buf) {
  req.rawBody = buf;
}

module.exports = { captureRawBody };