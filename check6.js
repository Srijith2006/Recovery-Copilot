const db = require('./src/db/connection');
const { createCaseFromEvent } = require('./src/services/caseService');

async function main() {
  const row = db.prepare("SELECT * FROM events WHERE received_at = '2026-09-03 05:15:25'").get();
  const event = {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload),
  };
  console.log('Reconstructed event.type:', event.type);
  console.log('Reconstructed event.payload keys:', Object.keys(event.payload));

  try {
    const result = await createCaseFromEvent(event);
    console.log('SUCCESS, case created:', result);
  } catch (err) {
    console.log('THREW AN ERROR:');
    console.log(err.message);
    console.log(err.stack);
  }
}

main();
