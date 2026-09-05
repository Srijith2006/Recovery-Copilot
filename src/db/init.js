const fs = require('fs');
const path = require('path');
const db = require('./connection');

const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

db.exec(schema);

console.log('Recovery Copilot: database schema applied ->', path.join(__dirname, '..', '..', 'data', 'recovery_copilot.db'));