const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'recovery_copilot.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
// node:sqlite has no .pragma() shortcut (unlike better-sqlite3) — pragmas
// just run through exec() like any other statement.
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Ensure schema tables exist
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

// Migration check: update 'events' table check constraint if it excludes payment_link.paid
try {
  const tableSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='events'").get();
  if (tableSqlRow && tableSqlRow.sql && tableSqlRow.sql.includes('type IN (') && !tableSqlRow.sql.includes('payment_link.paid')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE events_temp (
        id                  TEXT PRIMARY KEY,
        razorpay_event_id   TEXT,
        type                TEXT NOT NULL,
        payload             TEXT NOT NULL,
        received_at         TEXT NOT NULL DEFAULT (datetime('now')),
        idempotency_key     TEXT NOT NULL UNIQUE
      );
      INSERT INTO events_temp (id, razorpay_event_id, type, payload, received_at, idempotency_key)
      SELECT id, razorpay_event_id, type, payload, received_at, idempotency_key FROM events;
      DROP TABLE events;
      ALTER TABLE events_temp RENAME TO events;
      COMMIT;
    `);
    db.exec('PRAGMA foreign_keys = ON;');
  }
} catch (err) {
  console.error('[db] Error migrating events table schema:', err.message);
}

module.exports = db;