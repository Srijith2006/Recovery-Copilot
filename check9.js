const db = require('./src/db/connection');

const theCase = db.prepare("SELECT id, customer_ref, status FROM cases WHERE id = '72719ccb-d611-43f9-83a1-2286869c8129'").get();
console.log('THE CASE:', theCase);

const captures = db.prepare("SELECT payload, received_at FROM events WHERE type = 'payment.captured' ORDER BY received_at DESC LIMIT 3").all();
console.log('RECENT CAPTURES:', captures.length);
captures.forEach(c => console.log(c.received_at, '|', c.payload));
