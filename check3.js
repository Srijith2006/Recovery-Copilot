const db = require('./src/db/connection');
const real = db.prepare("SELECT id, type, razorpay_event_id, payload, received_at FROM events WHERE razorpay_event_id NOT LIKE 'evt_synth%' ORDER BY received_at DESC LIMIT 5").all();
console.log('COUNT:', real.length);
real.forEach(e => {
  console.log('---');
  console.log('type:', e.type);
  console.log('razorpay_event_id:', e.razorpay_event_id);
  console.log('received_at:', e.received_at);
  console.log('payload:', e.payload);
});
