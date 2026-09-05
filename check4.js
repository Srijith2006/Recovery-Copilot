const db = require('./src/db/connection');

const total = db.prepare("SELECT COUNT(*) as n FROM events").get();
console.log('TOTAL EVENTS:', total.n);

const nullIds = db.prepare("SELECT COUNT(*) as n FROM events WHERE razorpay_event_id IS NULL").get();
console.log('EVENTS WITH NULL razorpay_event_id:', nullIds.n);

const around = db.prepare("SELECT id, type, razorpay_event_id, received_at FROM events WHERE received_at >= '2026-09-03 10:38:00' ORDER BY received_at DESC").all();
console.log('EVENTS SINCE 10:38 IST TODAY:', around.length);
around.forEach(e => console.log(e.received_at, '|', e.type, '|', e.razorpay_event_id));
