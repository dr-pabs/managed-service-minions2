require('dotenv').config({ path: `${__dirname}/../.env` });

const path = require('path');
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

// In production the React app is built and served as static files from /build.
// In development the CRA dev server (port 3000) handles the frontend instead.
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../build')));
}

app.use('/api/sessions', sessions);
app.use('/api/live',     live);
app.use('/api/cost',     cost);
app.use('/api/tools',    tools);
app.use('/api/config',   config);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// SPA catch-all: serve index.html for any non-API route so React Router works.
if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) =>
    res.sendFile(path.join(__dirname, '../build/index.html'))
  );
}

const PORT = parseInt(process.env.API_PORT || '3001', 10);
if (require.main === module) {
  app.listen(PORT, () => console.log(`API server on :${PORT}`));
}

module.exports = app;
