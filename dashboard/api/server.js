require('dotenv').config({ path: `${__dirname}/../.env` });

const express = require('express');
const cors = require('cors');

const sessions = require('./routes/sessions');
const live     = require('./routes/live');
const cost     = require('./routes/cost');
const tools    = require('./routes/tools');
const config   = require('./routes/config');

const app = express();

app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:3001'] }));
app.use(express.json());

app.use('/api/sessions', sessions);
app.use('/api/live',     live);
app.use('/api/cost',     cost);
app.use('/api/tools',    tools);
app.use('/api/config',   config);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = parseInt(process.env.API_PORT || '3001', 10);
if (require.main === module) {
  app.listen(PORT, () => console.log(`API server on :${PORT}`));
}

module.exports = app;
