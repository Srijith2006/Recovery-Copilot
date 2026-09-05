const db = require('./src/db/connection');
const around = db.prepare("SELECT id, type, razorpay_event_id, payload, received_at FROM events WHERE received_at >= '2026-09-03 05:09:00' AND received_at <= '2026-09-03 05:17:00' ORDER BY received_at ASC").all();
console.log('EVENTS IN THAT UTC WINDOW:', around.length);
around.forEach(e => {
  console.log('---');
  console.log('received_at (UTC):', e.received_at);
  console.log('type:', e.type);
  console.log('razorpay_event_id:', e.razorpay_event_id);
  console.log('payload:', e.payload);
});
