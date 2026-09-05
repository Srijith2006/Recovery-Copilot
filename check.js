const db = require('./src/db/connection');
const real = db.prepare("SELECT id, customer_ref, root_cause, status, amount, created_at FROM cases WHERE customer_ref NOT LIKE 'demo.customer%' ORDER BY created_at DESC").all();
console.log('NON-SYNTHETIC CASES:', real);
