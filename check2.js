const db = require('./src/db/connection');
const recent = db.prepare("SELECT id, type, payload, received_at FROM events ORDER BY received_at DESC LIMIT 3").all();
recent.forEach(e => {
  console.log('---');
  console.log('type:', e.type);
  console.log('received_at:', e.received_at);
  console.log('payload:', e.payload);
});
