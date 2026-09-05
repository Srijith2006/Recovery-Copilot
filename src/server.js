require('dotenv').config();
const app = require('./app');
require('./db/connection'); // ensures data dir + db file exist on boot

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Recovery Copilot API listening on http://localhost:${PORT}`);
});