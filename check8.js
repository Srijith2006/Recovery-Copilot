const db = require('./src/db/connection');
db.prepare("UPDATE cases SET status = 'recovered', updated_at = datetime('now') WHERE id = 'd87140cd-bcf7-4763-826a-92e54caec0e3'").run();
console.log('done');
