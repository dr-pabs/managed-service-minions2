# Dashboard Live Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all six `MOCK_*` constants in the dashboard with real data from Log Analytics (toolshed + bot stdout), the goose serve ACP WebSocket, and hardcoded config mirroring the Rust allowlist.

**Architecture:** A new lightweight Express API server (`dashboard/api/server.js`) sits between the React SPA and Azure backends. It queries Log Analytics via `@azure/monitor-query` for historical session and tool-call data, proxies the goose serve WebSocket for live minion state, and reads allowlist config from a local JS module. The React components call `/api/*` endpoints; `proxy` in `package.json` routes those calls to the API server in development.

**Tech Stack:** Node.js 20 (Express 4), `@azure/monitor-query`, `@azure/identity`, `ws` (WebSocket), React 18 (`useEffect` + `useState` hooks), Jest 29 (API unit tests).

---

## Data Sources

| Component | Data Source | Key |
|---|---|---|
| SessionExplorer | Log Analytics — bot stdout (`session_start` / `session_end` events) | `GET /api/sessions` |
| CorrelationTree | Log Analytics — toolshed stdout (AuditEntry JSON, filtered by `correlation_id`) | `GET /api/sessions/:corrId/tree` |
| LiveDashboard (active) | goose serve WebSocket `ws://localhost:3284`, proxied as SSE | `GET /api/live/stream` (SSE) |
| LiveDashboard (recent) | Log Analytics — toolshed stdout last 60 min | `GET /api/live` |
| CostDashboard | Log Analytics — toolshed stdout, `duration_ms` × per-tool cost estimate | `GET /api/cost` |
| ToolCallAnalyzer | Log Analytics — toolshed stdout, aggregated by `tool` + `agent` | `GET /api/tools` |
| PromptManager (allowlist) | Hardcoded JS config mirroring `allowlist.rs` | `GET /api/config` |
| PromptManager (env) | `process.env` filtered to known keys | `GET /api/config` |

### Toolshed AuditEntry schema (already in logger.rs)

```json
{
  "ts": "2026-06-17T10:42:05.123Z",
  "correlation_id": "corr_a1b2c3d4",
  "agent": "code-reviewer",
  "tool": "github.get_pr_diff",
  "params": { "pr_number": 342 },
  "result": "success",
  "duration_ms": 450,
  "output_size_bytes": 1024
}
```

### Bot session event schema (new — added in Tasks 1–2)

```json
{ "event": "session_start", "correlation_id": "corr_xyz", "channel": "slack", "user": "U123", "ts": "2026-06-17T10:42:00.000Z" }
{ "event": "session_end",   "correlation_id": "corr_xyz", "status": "completed", "retries": 0, "ts": "2026-06-17T10:43:30.000Z" }
```

---

## File Map

```
bots/
  slack-bot/src/bot.js       MODIFY — emit session_start / session_end JSON to stdout
  teams-bot/src/bot.js       MODIFY — emit session_start / session_end JSON to stdout

dashboard/
  .env.example               NEW    — required environment variables
  package.json               MODIFY — add concurrently, @azure/monitor-query, @azure/identity, ws, express, cors
  api/
    server.js                NEW    — Express entry point, mounts all routes
    clients/
      loganalytics.js        NEW    — LogsQueryClient factory, shared by all routes
      websocket.js           NEW    — goose serve WebSocket singleton + SSE fanout
    routes/
      sessions.js            NEW    — GET /api/sessions, GET /api/sessions/:corrId/tree
      live.js                NEW    — GET /api/live, GET /api/live/stream (SSE)
      cost.js                NEW    — GET /api/cost?period=today|week|month
      tools.js               NEW    — GET /api/tools?agent=all
      config.js              NEW    — GET /api/config
    __tests__/
      sessions.test.js       NEW    — unit tests with mocked LA client
      live.test.js           NEW
      cost.test.js           NEW
      tools.test.js          NEW
      config.test.js         NEW
  src/
    hooks/
      useApi.js              NEW    — shared fetch hook (loading / error / data)
      usePoll.js             NEW    — polling variant of useApi
      useStream.js           NEW    — EventSource hook for SSE
    components/
      SessionExplorer.js     MODIFY — replace MOCK_SESSIONS with useApi('/sessions')
      CorrelationTree.js     MODIFY — replace MOCK_TREE with useApi('/sessions/:corrId/tree')
      LiveDashboard.js       MODIFY — replace MOCK_LIVE/MOCK_RECENT with usePoll + useStream
      CostDashboard.js       MODIFY — replace MOCK_COST with useApi('/cost')
      ToolCallAnalyzer.js    MODIFY — replace MOCK_TOOLS with useApi('/tools')
      PromptManager.js       MODIFY — replace MOCK_PROMPTS with useApi('/config')
```

---

## Progress

| # | Task | Status |
|---|------|--------|
| 1 | Bot session events — Slack | ⬜ Pending |
| 2 | Bot session events — Teams | ⬜ Pending |
| 3 | Dashboard package.json + .env.example | ⬜ Pending |
| 4 | Log Analytics client | ⬜ Pending |
| 5 | goose WebSocket client + SSE fanout | ⬜ Pending |
| 6 | API server entry point | ⬜ Pending |
| 7 | Sessions route + tests | ⬜ Pending |
| 8 | Live route + tests | ⬜ Pending |
| 9 | Cost route + tests | ⬜ Pending |
| 10 | Tools route + tests | ⬜ Pending |
| 11 | Config route + tests | ⬜ Pending |
| 12 | useApi / usePoll / useStream hooks | ⬜ Pending |
| 13 | Wire SessionExplorer | ⬜ Pending |
| 14 | Wire CorrelationTree | ⬜ Pending |
| 15 | Wire LiveDashboard | ⬜ Pending |
| 16 | Wire CostDashboard | ⬜ Pending |
| 17 | Wire ToolCallAnalyzer | ⬜ Pending |
| 18 | Wire PromptManager | ⬜ Pending |
| 19 | CI + docs | ⬜ Pending |

---

## Milestone 1 — Bot Session Events

### Task 1: Slack bot — emit session_start / session_end

**Files:**
- Modify: `bots/slack-bot/src/bot.js`

The bot already generates `correlationId` before calling `sendToGoose`. We add two JSON log lines to stdout so Log Analytics can derive session metadata.

- [ ] **Step 1: Add `logSession` helper at top of bot.js**

```javascript
// bots/slack-bot/src/bot.js — add after existing const declarations

function logSession(event, fields) {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));
}
```

- [ ] **Step 2: Emit session_start before calling sendToGoose**

Locate the `app.message` handler. Before the `sendToGoose` call add:

```javascript
logSession('session_start', {
  correlation_id: correlationId,
  channel: 'slack',
  user: event.user,
});
```

- [ ] **Step 3: Emit session_end in the then/catch after sendToGoose**

```javascript
const result = await sendToGoose(userMessage, correlationId, userId);
logSession('session_end', {
  correlation_id: correlationId,
  status: 'completed',
  retries: 0,
});
// ... post result to Slack
```

In the catch block:

```javascript
logSession('session_end', {
  correlation_id: correlationId,
  status: 'failed',
  retries: 0,
});
```

- [ ] **Step 4: Run existing Slack bot tests**

```
cd bots/slack-bot && npm test
```

Expected: all existing tests pass (logSession writes to stdout, not stderr, so test assertions still hold).

- [ ] **Step 5: Commit**

```bash
git add bots/slack-bot/src/bot.js
git commit -m "feat(slack-bot): emit session_start/end JSON events to stdout"
```

---

### Task 2: Teams bot — emit session_start / session_end

**Files:**
- Modify: `bots/teams-bot/src/bot.js`

Identical pattern; user ID comes from `context.activity.from.id`.

- [ ] **Step 1: Add logSession helper**

```javascript
function logSession(event, fields) {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));
}
```

- [ ] **Step 2: Emit session_start**

Before the `sendToGoose` call in `onMessage`:

```javascript
logSession('session_start', {
  correlation_id: correlationId,
  channel: 'teams',
  user: context.activity.from.id,
});
```

- [ ] **Step 3: Emit session_end**

```javascript
// On success
logSession('session_end', { correlation_id: correlationId, status: 'completed', retries: 0 });
// On failure (catch)
logSession('session_end', { correlation_id: correlationId, status: 'failed', retries: 0 });
```

- [ ] **Step 4: Run Teams bot tests**

```
cd bots/teams-bot && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add bots/teams-bot/src/bot.js
git commit -m "feat(teams-bot): emit session_start/end JSON events to stdout"
```

---

## Milestone 2 — Dashboard API Server

### Task 3: package.json + .env.example

**Files:**
- Modify: `dashboard/package.json`
- Create: `dashboard/.env.example`

- [ ] **Step 1: Add new dependencies to dashboard/package.json**

Add to `"dependencies"`:

```json
"@azure/identity": "^4.4.0",
"@azure/monitor-query": "^1.3.0",
"cors": "^2.8.5",
"express": "^4.19.2",
"ws": "^8.18.0"
```

Add to `"devDependencies"`:

```json
"concurrently": "^8.2.2",
"jest": "^29.7.0",
"supertest": "^7.0.0"
```

Update `"scripts"`:

```json
"start": "react-scripts start",
"start:api": "node api/server.js",
"dev": "concurrently \"npm run start:api\" \"npm start\"",
"build": "react-scripts build",
"test": "react-scripts test",
"test:api": "jest api/",
"eject": "react-scripts eject"
```

Add at root level:

```json
"proxy": "http://localhost:3001",
"jest": {
  "testEnvironment": "node",
  "testMatch": ["**/api/__tests__/**/*.test.js"]
}
```

- [ ] **Step 2: Install**

```
cd dashboard && npm install
```

Expected: no errors, `package-lock.json` updated.

- [ ] **Step 3: Create dashboard/.env.example**

```
# Log Analytics workspace (required for production; leave empty to use mock data in dev)
LOG_ANALYTICS_WORKSPACE_ID=your-la-workspace-id-here

# Azure identity (only needed in dev — production uses Managed Identity)
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=

# API port (default: 3001)
API_PORT=3001

# goose serve WebSocket (default: ws://localhost:3284)
GOOSE_WS_URL=ws://localhost:3284

# Set to "true" to return mock data instead of querying Log Analytics (dev without LA access)
LA_MOCK=false
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/package.json dashboard/package-lock.json dashboard/.env.example
git commit -m "chore(dashboard): add API server dependencies + env template"
```

---

### Task 4: Log Analytics client

**Files:**
- Create: `dashboard/api/clients/loganalytics.js`

- [ ] **Step 1: Write the client module**

```javascript
// dashboard/api/clients/loganalytics.js
const { LogsQueryClient } = require('@azure/monitor-query');
const { DefaultAzureCredential } = require('@azure/identity');

let _client = null;

function getClient() {
  if (!_client) {
    _client = new LogsQueryClient(new DefaultAzureCredential());
  }
  return _client;
}

const WORKSPACE_ID = process.env.LOG_ANALYTICS_WORKSPACE_ID || '';
const MOCK = process.env.LA_MOCK === 'true';

/**
 * Run a KQL query and return rows as an array of plain objects.
 * If LA_MOCK=true, returns the provided fallback instead.
 */
async function query(kql, timespan, fallback = []) {
  if (MOCK || !WORKSPACE_ID) return fallback;
  const result = await getClient().queryWorkspace(WORKSPACE_ID, kql, { duration: timespan });
  if (result.status !== 'Success' || !result.tables?.length) return fallback;
  const table = result.tables[0];
  return table.rows.map(row =>
    Object.fromEntries(table.columns.map((col, i) => [col.name, row[i]]))
  );
}

module.exports = { query };
```

- [ ] **Step 2: Write unit test**

Create `dashboard/api/__tests__/loganalytics.test.js`:

```javascript
process.env.LA_MOCK = 'true';
const { query } = require('../clients/loganalytics');

test('returns fallback when LA_MOCK=true', async () => {
  const fallback = [{ tool: 'github.get_pr_diff', calls: 5 }];
  const rows = await query('any kql', 'P1D', fallback);
  expect(rows).toEqual(fallback);
});
```

- [ ] **Step 3: Run test**

```
cd dashboard && npm run test:api -- --testPathPattern loganalytics
```

Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add dashboard/api/clients/loganalytics.js dashboard/api/__tests__/loganalytics.test.js
git commit -m "feat(dashboard/api): add Log Analytics client with mock fallback"
```

---

### Task 5: goose WebSocket client + SSE fanout

**Files:**
- Create: `dashboard/api/clients/websocket.js`

This module maintains a single WebSocket connection to `goose serve` and fans out live events to SSE subscribers (dashboard browser tabs).

- [ ] **Step 1: Write the WebSocket client**

```javascript
// dashboard/api/clients/websocket.js
const WebSocket = require('ws');

const GOOSE_URL = process.env.GOOSE_WS_URL || 'ws://localhost:3284';

let ws = null;
const subscribers = new Set();  // Set<(data: object) => void>

// Live sessions tracked in memory: corr_id → { corr_id, agent, started, turns }
const activeSessions = new Map();

function connect() {
  ws = new WebSocket(GOOSE_URL);

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.method === 'notifications/AgentStatus') {
      const { sessionId, status, agent_type, turns } = msg.params ?? {};
      if (status === 'running') {
        activeSessions.set(sessionId, {
          corr_id: sessionId,
          minion: agent_type ?? 'unknown',
          status: 'running',
          progress: `${turns ?? 0}/20 turns`,
          elapsed: '0s',
          started: new Date().toISOString(),
        });
      } else if (['done', 'error', 'cancelled'].includes(status)) {
        activeSessions.delete(sessionId);
      }
      broadcast({ active: [...activeSessions.values()] });
    }
  });

  ws.on('close', () => {
    // Reconnect after 5 s
    setTimeout(connect, 5000);
  });

  ws.on('error', () => {
    // Error events always fire before close — let close handler reconnect
  });
}

function broadcast(data) {
  for (const fn of subscribers) fn(data);
}

function subscribe(fn) {
  subscribers.add(fn);
  // Immediately send current state
  fn({ active: [...activeSessions.values()] });
  return () => subscribers.delete(fn);
}

function getActive() {
  return [...activeSessions.values()];
}

// Auto-connect when module is loaded (skip in test environment)
if (process.env.NODE_ENV !== 'test') connect();

module.exports = { subscribe, getActive, connect };
```

- [ ] **Step 2: Write unit test**

Create `dashboard/api/__tests__/websocket.test.js`:

```javascript
process.env.NODE_ENV = 'test';
const { subscribe, getActive } = require('../clients/websocket');

test('subscribe receives empty active list immediately', () => {
  const updates = [];
  const unsubscribe = subscribe(data => updates.push(data));
  expect(updates).toHaveLength(1);
  expect(updates[0].active).toEqual([]);
  unsubscribe();
});

test('unsubscribe removes listener', () => {
  const updates = [];
  const unsubscribe = subscribe(data => updates.push(data));
  unsubscribe();
  // No additional pushes after unsubscribe
  expect(updates).toHaveLength(1);
});
```

- [ ] **Step 3: Run test**

```
cd dashboard && npm run test:api -- --testPathPattern websocket
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add dashboard/api/clients/websocket.js dashboard/api/__tests__/websocket.test.js
git commit -m "feat(dashboard/api): add goose WebSocket client with SSE fanout"
```

---

### Task 6: API server entry point

**Files:**
- Create: `dashboard/api/server.js`

- [ ] **Step 1: Write server.js**

```javascript
// dashboard/api/server.js
require('dotenv').config({ path: `${__dirname}/../.env` });

const express = require('express');
const cors = require('cors');

const sessions = require('./routes/sessions');
const live = require('./routes/live');
const cost = require('./routes/cost');
const tools = require('./routes/tools');
const config = require('./routes/config');

const app = express();

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

app.use('/api/sessions', sessions);
app.use('/api/live', live);
app.use('/api/cost', cost);
app.use('/api/tools', tools);
app.use('/api/config', config);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = parseInt(process.env.API_PORT || '3001', 10);
if (require.main === module) {
  app.listen(PORT, () => console.log(`API server on :${PORT}`));
}

module.exports = app;
```

- [ ] **Step 2: Verify server starts (routes don't exist yet — will 404)**

```
cd dashboard && node api/server.js &
curl -s http://localhost:3001/api/health
# Expected: {"ok":true}
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/api/server.js
git commit -m "feat(dashboard/api): add Express server entry point"
```

---

### Task 7: Sessions route + tests

**Files:**
- Create: `dashboard/api/routes/sessions.js`
- Create: `dashboard/api/__tests__/sessions.test.js`

#### Endpoint specs

`GET /api/sessions?limit=50` — returns array of session objects sorted by `ts` descending.

`GET /api/sessions/:corrId/tree` — returns tree object for a single correlation ID.

#### KQL — session list

Queries Log Analytics for bot stdout events. Bot containers are named `slackbot` and `teamsbot` in Container Apps.

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(7d)
| where ContainerName_s in ("slackbot", "teamsbot")
| extend entry = parse_json(Log_s)
| where tostring(entry.event) in ("session_start", "session_end")
| project
    event     = tostring(entry.event),
    corr_id   = tostring(entry.correlation_id),
    channel   = tostring(entry.channel),
    user      = tostring(entry.user),
    status    = tostring(entry.status),
    retries   = toint(entry.retries),
    ts        = tostring(entry.ts)
| summarize
    channel = anyif(channel, event == "session_start"),
    user    = anyif(user,    event == "session_start"),
    ts      = anyif(ts,      event == "session_start"),
    status  = anyif(status,  event == "session_end"),
    retries = anyif(retries, event == "session_end")
  by corr_id
| order by ts desc
| take 50
```

#### KQL — correlation tree

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(30d)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where tostring(entry.correlation_id) == "{CORR_ID}"
| project
    ts          = tostring(entry.ts),
    agent       = tostring(entry.agent),
    tool        = tostring(entry.tool),
    result      = tostring(entry.result),
    duration_ms = toint(entry.duration_ms),
    params      = tostring(entry.params)
| order by ts asc
```

- [ ] **Step 1: Write sessions.js**

```javascript
// dashboard/api/routes/sessions.js
const { Router } = require('express');
const { query } = require('../clients/loganalytics');

const router = Router();

const SESSION_LIST_KQL = `
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(7d)
| where ContainerName_s in ("slackbot", "teamsbot")
| extend entry = parse_json(Log_s)
| where tostring(entry.event) in ("session_start", "session_end")
| project event=tostring(entry.event), corr_id=tostring(entry.correlation_id),
    channel=tostring(entry.channel), user=tostring(entry.user),
    status=tostring(entry.status), retries=toint(entry.retries), ts=tostring(entry.ts)
| summarize
    channel=anyif(channel, event=="session_start"),
    user=anyif(user, event=="session_start"),
    ts=anyif(ts, event=="session_start"),
    status=anyif(status, event=="session_end"),
    retries=anyif(retries, event=="session_end")
  by corr_id
| order by ts desc
| take 50
`;

router.get('/', async (req, res) => {
  try {
    const rows = await query(SESSION_LIST_KQL, 'P7D', MOCK_SESSIONS);
    res.json(rows.map(r => ({
      corr_id: r.corr_id,
      channel: r.channel || 'unknown',
      user: r.user || 'unknown',
      status: r.status || 'active',
      ts: r.ts,
      retries: r.retries ?? 0,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:corrId/tree', async (req, res) => {
  const { corrId } = req.params;
  const kql = `
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(30d)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where tostring(entry.correlation_id) == "${corrId.replace(/"/g, '')}"
| project ts=tostring(entry.ts), agent=tostring(entry.agent), tool=tostring(entry.tool),
    result=tostring(entry.result), duration_ms=toint(entry.duration_ms), params=tostring(entry.params)
| order by ts asc
  `;
  try {
    const rows = await query(kql, 'P30D', MOCK_TREE_ROWS);
    // Group tool calls by agent
    const byAgent = {};
    for (const row of rows) {
      if (!byAgent[row.agent]) {
        byAgent[row.agent] = { id: `${corrId}.${Object.keys(byAgent).length + 1}`, type: row.agent, tool_calls: [] };
      }
      byAgent[row.agent].tool_calls.push({
        tool: row.tool,
        status: row.result === 'success' ? 'success' : 'error',
        duration: row.duration_ms ? `${row.duration_ms}ms` : 'unknown',
        params: (() => { try { return JSON.parse(row.params); } catch { return {}; } })(),
      });
    }
    res.json({
      correlation_id: corrId,
      minions: Object.values(byAgent),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const MOCK_SESSIONS = [
  { corr_id: 'corr_a1b2c3d4', channel: 'slack', user: 'alice', status: 'completed', ts: '2026-06-17T08:42:00.000Z', retries: 0 },
  { corr_id: 'corr_b2c3d4e5', channel: 'teams', user: 'bob', status: 'completed', ts: '2026-06-17T08:35:00.000Z', retries: 1 },
  { corr_id: 'corr_c3d4e5f6', channel: 'slack', user: 'carol', status: 'failed', ts: '2026-06-17T08:20:00.000Z', retries: 2 },
];

const MOCK_TREE_ROWS = [
  { ts: '2026-06-17T08:42:01.000Z', agent: 'ticket-analyst', tool: 'ado.query_work_items', result: 'success', duration_ms: 600, params: '{"ticket_id":"INC00421"}' },
  { ts: '2026-06-17T08:42:05.000Z', agent: 'code-explorer', tool: 'filesystem.read_file', result: 'success', duration_ms: 200, params: '{"path":"src/auth.js"}' },
  { ts: '2026-06-17T08:42:08.000Z', agent: 'pr-crafter', tool: 'github.create_pr', result: 'success', duration_ms: 800, params: '{"title":"Fix INC00421"}' },
];

module.exports = router;
```

- [ ] **Step 2: Write sessions.test.js**

```javascript
// dashboard/api/__tests__/sessions.test.js
process.env.LA_MOCK = 'true';
const request = require('supertest');
const app = require('../server');

test('GET /api/sessions returns array', async () => {
  const res = await request(app).get('/api/sessions');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body.length).toBeGreaterThan(0);
  expect(res.body[0]).toHaveProperty('corr_id');
  expect(res.body[0]).toHaveProperty('channel');
  expect(res.body[0]).toHaveProperty('status');
});

test('GET /api/sessions/:corrId/tree returns minions array', async () => {
  const res = await request(app).get('/api/sessions/corr_a1b2c3d4/tree');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('correlation_id', 'corr_a1b2c3d4');
  expect(Array.isArray(res.body.minions)).toBe(true);
  if (res.body.minions.length > 0) {
    expect(res.body.minions[0]).toHaveProperty('type');
    expect(Array.isArray(res.body.minions[0].tool_calls)).toBe(true);
  }
});

test('GET /api/sessions/:corrId/tree prevents KQL injection', async () => {
  const res = await request(app).get('/api/sessions/corr_"; drop table ToolCallLog; --/tree');
  // Should not 500 — injection chars are stripped
  expect(res.status).not.toBe(500);
});
```

- [ ] **Step 3: Run tests**

```
cd dashboard && npm run test:api -- --testPathPattern sessions
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add dashboard/api/routes/sessions.js dashboard/api/__tests__/sessions.test.js
git commit -m "feat(dashboard/api): add /api/sessions + /api/sessions/:corrId/tree routes"
```

---

### Task 8: Live route + tests

**Files:**
- Create: `dashboard/api/routes/live.js`
- Create: `dashboard/api/__tests__/live.test.js`

`GET /api/live` — returns `{ active: [...], recent: [...], stats: {...} }` snapshot.

`GET /api/live/stream` — Server-Sent Events stream. Each `data:` message is the same shape.

#### KQL — recent completions (last 60 min)

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where isnotempty(tostring(entry.correlation_id))
| summarize
    last_tool = arg_max(TimeGenerated, *),
    call_count = count()
  by corr_id = tostring(entry.correlation_id), agent = tostring(entry.agent)
| project
    minion = agent,
    status = 'completed',
    ts = format_datetime(last_tool, 'HH:mm:ss')
| order by ts desc
| take 10
```

- [ ] **Step 1: Write live.js**

```javascript
// dashboard/api/routes/live.js
const { Router } = require('express');
const { query } = require('../clients/loganalytics');
const gooseWs = require('../clients/websocket');

const router = Router();

const RECENT_KQL = `
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where isnotempty(tostring(entry.correlation_id))
| summarize last_ts=max(TimeGenerated), calls=count() by corr_id=tostring(entry.correlation_id), agent=tostring(entry.agent)
| project minion=agent, status='completed', ts=format_datetime(last_ts, 'HH:mm:ss')
| order by ts desc
| take 10
`;

const STATS_KQL = `
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1d)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where isnotempty(tostring(entry.correlation_id))
| summarize
    completed = dcount(correlation_id),
    failed    = countif(tostring(entry.result) == "failure"),
    avg_ms    = avg(toint(entry.duration_ms))
  by corr_id = tostring(entry.correlation_id)
| summarize
    completed_today = count(),
    failed_today    = sumif(1, failed > 0),
    avg_duration_ms = avg(avg_ms)
`;

async function getLiveData() {
  const [recent, stats] = await Promise.all([
    query(RECENT_KQL, 'PT1H', MOCK_RECENT),
    query(STATS_KQL, 'P1D', MOCK_STATS),
  ]);
  const statsRow = stats[0] ?? MOCK_STATS[0];
  const avgMs = statsRow.avg_duration_ms ?? 72000;
  const avgFmt = avgMs >= 60000
    ? `${Math.round(avgMs / 60000)}m ${Math.round((avgMs % 60000) / 1000)}s`
    : `${Math.round(avgMs / 1000)}s`;

  return {
    active: gooseWs.getActive(),
    recent,
    stats: {
      active: gooseWs.getActive().length,
      completed_today: statsRow.completed_today ?? 0,
      failed_today: statsRow.failed_today ?? 0,
      avg_duration: avgFmt,
    },
  };
}

router.get('/', async (_req, res) => {
  try {
    res.json(await getLiveData());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  // Send initial snapshot
  getLiveData().then(data => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });

  // Subscribe to WebSocket push updates
  const unsubFromWs = gooseWs.subscribe(wsData => {
    getLiveData().then(data => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  });

  // Also poll every 10 s for recent + stats
  const poll = setInterval(() => {
    if (res.writableEnded) { clearInterval(poll); return; }
    getLiveData().then(data => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }, 10000);

  req.on('close', () => {
    clearInterval(poll);
    unsubFromWs();
  });
});

const MOCK_RECENT = [
  { minion: 'code-reviewer', status: 'completed', ts: '10:40:50' },
  { minion: 'security-auditor', status: 'completed', ts: '10:38:00' },
  { minion: 'code-explorer', status: 'failed', ts: '10:37:42' },
  { minion: 'ticket-analyst', status: 'completed', ts: '10:35:20' },
];

const MOCK_STATS = [{ completed_today: 127, failed_today: 2, avg_duration_ms: 72000 }];

module.exports = router;
```

- [ ] **Step 2: Write live.test.js**

```javascript
// dashboard/api/__tests__/live.test.js
process.env.LA_MOCK = 'true';
process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../server');

test('GET /api/live returns active, recent, stats', async () => {
  const res = await request(app).get('/api/live');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('active');
  expect(res.body).toHaveProperty('recent');
  expect(res.body).toHaveProperty('stats');
  expect(Array.isArray(res.body.active)).toBe(true);
  expect(Array.isArray(res.body.recent)).toBe(true);
  expect(typeof res.body.stats.completed_today).toBe('number');
});

test('GET /api/live/stream sends SSE headers', done => {
  const http = require('http');
  const server = app.listen(0, () => {
    const { port } = server.address();
    const req = http.get(`http://localhost:${port}/api/live/stream`, res => {
      expect(res.headers['content-type']).toMatch('text/event-stream');
      req.destroy();
      server.close(done);
    });
  });
});
```

- [ ] **Step 3: Run tests**

```
cd dashboard && npm run test:api -- --testPathPattern live
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add dashboard/api/routes/live.js dashboard/api/__tests__/live.test.js
git commit -m "feat(dashboard/api): add /api/live + SSE stream route"
```

---

### Task 9: Cost route + tests

**Files:**
- Create: `dashboard/api/routes/cost.js`
- Create: `dashboard/api/__tests__/cost.test.js`

Cost is estimated from `duration_ms` in ToolCallLog, using a fixed rate of $0.06/hour of minion compute time. This is a proxy metric — actual Azure AI Foundry token costs require querying Azure Cost Management (out of scope for Phase 1; noted in `Future Work` below).

#### KQL — daily costs (last 7 days)

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(7d)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where isnotempty(tostring(entry.correlation_id)) and toint(entry.duration_ms) > 0
| extend cost_usd = (toint(entry.duration_ms) / 3600000.0) * 0.06
| summarize daily_cost = sum(cost_usd) by date = bin(TimeGenerated, 1d)
| order by date asc
```

- [ ] **Step 1: Write cost.js**

```javascript
// dashboard/api/routes/cost.js
const { Router } = require('express');
const { query } = require('../clients/loganalytics');

const router = Router();

const COST_PER_HOUR = 0.06;  // $/hr of minion compute (proxy metric — not actual LLM cost)

const DAILY_KQL = `
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(7d)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where isnotempty(tostring(entry.correlation_id)) and toint(entry.duration_ms) > 0
| extend cost_usd = (toint(entry.duration_ms) / 3600000.0) * ${COST_PER_HOUR}
| summarize daily_cost=round(sum(cost_usd), 4) by date=bin(TimeGenerated, 1d)
| order by date asc
`;

const BY_AGENT_KQL = `
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(30d)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where isnotempty(tostring(entry.agent)) and toint(entry.duration_ms) > 0
| extend cost_usd = (toint(entry.duration_ms) / 3600000.0) * ${COST_PER_HOUR}
| summarize cost=round(sum(cost_usd), 4), calls=count() by agent=tostring(entry.agent)
| order by cost desc
`;

router.get('/', async (_req, res) => {
  try {
    const [daily, byAgent] = await Promise.all([
      query(DAILY_KQL, 'P7D', MOCK_DAILY),
      query(BY_AGENT_KQL, 'P30D', MOCK_BY_AGENT),
    ]);

    const totalMonth = byAgent.reduce((s, r) => s + (r.cost ?? 0), 0);
    const totalWeek  = daily.slice(-7).reduce((s, r) => s + (r.daily_cost ?? 0), 0);
    const today      = daily.at(-1)?.daily_cost ?? 0;

    const totalForPct = byAgent.reduce((s, r) => s + (r.cost ?? 0), 0) || 1;

    res.json({
      today:      { total: round2(today), currency: 'USD', note: 'estimated compute cost' },
      this_week:  { total: round2(totalWeek), currency: 'USD', note: 'estimated compute cost' },
      this_month: { total: round2(totalMonth), currency: 'USD', note: 'estimated compute cost' },
      by_agent: byAgent.map(r => ({
        agent:      r.agent,
        cost:       round2(r.cost ?? 0),
        calls:      r.calls ?? 0,
        percentage: Math.round(((r.cost ?? 0) / totalForPct) * 100),
      })),
      daily: daily.map(r => ({
        date: new Date(r.date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
        cost: round2(r.daily_cost ?? 0),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const round2 = n => Math.round(n * 100) / 100;

const MOCK_DAILY = [
  { date: '2026-06-11T00:00:00.000Z', daily_cost: 5.12 },
  { date: '2026-06-12T00:00:00.000Z', daily_cost: 7.89 },
  { date: '2026-06-13T00:00:00.000Z', daily_cost: 6.45 },
  { date: '2026-06-14T00:00:00.000Z', daily_cost: 3.21 },
  { date: '2026-06-15T00:00:00.000Z', daily_cost: 10.55 },
  { date: '2026-06-16T00:00:00.000Z', daily_cost: 8.23 },
  { date: '2026-06-17T00:00:00.000Z', daily_cost: 4.23 },
];

const MOCK_BY_AGENT = [
  { agent: 'code-reviewer',   cost: 12.45, calls: 89 },
  { agent: 'pr-crafter',      cost:  8.92, calls: 52 },
  { agent: 'ticket-analyst',  cost:  5.67, calls: 45 },
  { agent: 'code-explorer',   cost:  4.10, calls: 156 },
  { agent: 'security-auditor',cost:  3.58, calls: 5 },
];

module.exports = router;
```

- [ ] **Step 2: Write cost.test.js**

```javascript
// dashboard/api/__tests__/cost.test.js
process.env.LA_MOCK = 'true';
process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../server');

test('GET /api/cost returns required shape', async () => {
  const res = await request(app).get('/api/cost');
  expect(res.status).toBe(200);
  const { today, this_week, this_month, by_agent, daily } = res.body;
  expect(typeof today.total).toBe('number');
  expect(typeof this_week.total).toBe('number');
  expect(typeof this_month.total).toBe('number');
  expect(Array.isArray(by_agent)).toBe(true);
  expect(Array.isArray(daily)).toBe(true);
});

test('percentages in by_agent sum to ~100', async () => {
  const res = await request(app).get('/api/cost');
  const total = res.body.by_agent.reduce((s, a) => s + a.percentage, 0);
  expect(total).toBeGreaterThanOrEqual(95);
  expect(total).toBeLessThanOrEqual(105);
});
```

- [ ] **Step 3: Run tests**

```
cd dashboard && npm run test:api -- --testPathPattern cost
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add dashboard/api/routes/cost.js dashboard/api/__tests__/cost.test.js
git commit -m "feat(dashboard/api): add /api/cost route (estimated compute cost)"
```

---

### Task 10: Tools route + tests

**Files:**
- Create: `dashboard/api/routes/tools.js`
- Create: `dashboard/api/__tests__/tools.test.js`

`GET /api/tools?agent=All` — returns per-tool statistics array sorted by call count descending.

#### KQL — tool aggregation

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1d)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where isnotempty(tostring(entry.tool))
| summarize
    calls       = count(),
    avg_ms      = round(avg(toint(entry.duration_ms)), 0),
    errors      = countif(tostring(entry.result) != "success"),
    last_ts     = max(TimeGenerated)
  by tool = tostring(entry.tool), agent = tostring(entry.agent)
| order by calls desc
```

- [ ] **Step 1: Write tools.js**

```javascript
// dashboard/api/routes/tools.js
const { Router } = require('express');
const { query } = require('../clients/loganalytics');

const router = Router();

const TOOLS_KQL = `
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1d)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where isnotempty(tostring(entry.tool))
| summarize
    calls=count(), avg_ms=round(avg(toint(entry.duration_ms)), 0),
    errors=countif(tostring(entry.result) != "success"), last_ts=max(TimeGenerated)
  by tool=tostring(entry.tool), agent=tostring(entry.agent)
| order by calls desc
`;

router.get('/', async (req, res) => {
  const { agent } = req.query;
  try {
    let rows = await query(TOOLS_KQL, 'P1D', MOCK_TOOLS);
    if (agent && agent !== 'All') {
      rows = rows.filter(r => r.agent === agent);
    }
    res.json(rows.map(r => ({
      tool:         r.tool,
      agent:        r.agent,
      calls:        r.calls ?? 0,
      avg_duration: r.avg_ms ? `${r.avg_ms}ms` : 'unknown',
      errors:       r.errors ?? 0,
      last:         r.last_ts
        ? new Date(r.last_ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—',
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const MOCK_TOOLS = [
  { tool: 'github.get_pr_diff',         agent: 'code-reviewer',   calls: 89,  avg_ms: 450, errors: 0, last_ts: '2026-06-17T10:42:05Z' },
  { tool: 'github.create_review_comment',agent: 'code-reviewer',   calls: 34,  avg_ms: 300, errors: 0, last_ts: '2026-06-17T10:40:50Z' },
  { tool: 'github.create_pr',            agent: 'pr-crafter',      calls: 12,  avg_ms: 800, errors: 1, last_ts: '2026-06-17T10:41:35Z' },
  { tool: 'filesystem.read_file',        agent: 'code-explorer',   calls: 156, avg_ms: 120, errors: 0, last_ts: '2026-06-17T10:42:17Z' },
  { tool: 'filesystem.write_file',       agent: 'pr-crafter',      calls: 28,  avg_ms: 250, errors: 0, last_ts: '2026-06-17T10:41:35Z' },
  { tool: 'ado.query_work_items',        agent: 'ticket-analyst',  calls: 45,  avg_ms: 600, errors: 3, last_ts: '2026-06-17T10:38:20Z' },
  { tool: 'github.commit',               agent: 'pr-crafter',      calls: 12,  avg_ms: 500, errors: 0, last_ts: '2026-06-17T10:41:35Z' },
  { tool: 'github.get_advisories',       agent: 'security-auditor',calls:  5,  avg_ms: 2000,errors: 0, last_ts: '2026-06-17T10:35:00Z' },
];

module.exports = router;
```

- [ ] **Step 2: Write tools.test.js**

```javascript
// dashboard/api/__tests__/tools.test.js
process.env.LA_MOCK = 'true';
process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../server');

test('GET /api/tools returns array with required fields', async () => {
  const res = await request(app).get('/api/tools');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body[0]).toHaveProperty('tool');
  expect(res.body[0]).toHaveProperty('agent');
  expect(res.body[0]).toHaveProperty('calls');
  expect(res.body[0]).toHaveProperty('errors');
});

test('GET /api/tools?agent=code-reviewer filters results', async () => {
  const res = await request(app).get('/api/tools?agent=code-reviewer');
  expect(res.status).toBe(200);
  expect(res.body.every(r => r.agent === 'code-reviewer')).toBe(true);
});
```

- [ ] **Step 3: Run tests**

```
cd dashboard && npm run test:api -- --testPathPattern tools
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add dashboard/api/routes/tools.js dashboard/api/__tests__/tools.test.js
git commit -m "feat(dashboard/api): add /api/tools route"
```

---

### Task 11: Config route + tests

**Files:**
- Create: `dashboard/api/routes/config.js`
- Create: `dashboard/api/__tests__/config.test.js`

`GET /api/config` — returns allowlists (mirrored from `allowlist.rs`) and safe environment variable snapshot.

- [ ] **Step 1: Write config.js**

```javascript
// dashboard/api/routes/config.js
// Allowlist mirrors mcp-servers/toolshed/src/allowlist.rs — keep in sync when Rust changes.
const { Router } = require('express');

const router = Router();

const ALLOWLISTS = {
  'code-reviewer':   ['github.get_pr_diff', 'github.create_review_comment', 'github.get_pr_comments'],
  'code-explorer':   ['filesystem.list_directory', 'filesystem.read_file'],
  'pr-crafter':      ['github.create_branch', 'github.commit', 'github.create_pr', 'filesystem.write_file'],
  'ticket-analyst':  ['ado.query_work_items', 'jira.search_issues'],
  'security-auditor':['filesystem.read_file', 'github.get_advisories'],
};

const SAFE_ENV_KEYS = [
  'GOOSE_PROVIDER', 'GOOSE_SERVER_PORT', 'MAX_TURNS_DEFAULT',
  'RETRY_MAX_ATTEMPTS', 'RETRY_BACKOFF_MS', 'RATE_LIMIT_PER_MINION',
  'LOG_LEVEL', 'CORRELATION_ID_PREFIX', 'API_PORT',
];

router.get('/', (_req, res) => {
  const env = {};
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key];
  }

  res.json({
    allowlists: Object.entries(ALLOWLISTS).map(([agent, tools]) => ({ agent, tools })),
    env,
  });
});

module.exports = router;
```

- [ ] **Step 2: Write config.test.js**

```javascript
// dashboard/api/__tests__/config.test.js
process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../server');

test('GET /api/config returns allowlists and env', async () => {
  const res = await request(app).get('/api/config');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.allowlists)).toBe(true);
  expect(res.body.allowlists.every(a => a.agent && Array.isArray(a.tools))).toBe(true);
  expect(typeof res.body.env).toBe('object');
});

test('allowlists include all 5 agents', async () => {
  const res = await request(app).get('/api/config');
  const agents = res.body.allowlists.map(a => a.agent);
  expect(agents).toContain('code-reviewer');
  expect(agents).toContain('pr-crafter');
  expect(agents).toContain('security-auditor');
  expect(agents).toContain('ticket-analyst');
  expect(agents).toContain('code-explorer');
});

test('env does not expose secrets', async () => {
  const res = await request(app).get('/api/config');
  const keys = Object.keys(res.body.env);
  expect(keys).not.toContain('AZURE_CLIENT_SECRET');
  expect(keys).not.toContain('SLACK_BOT_TOKEN');
  expect(keys).not.toContain('GITHUB_PAT');
});
```

- [ ] **Step 3: Run tests**

```
cd dashboard && npm run test:api -- --testPathPattern config
```

Expected: 3 tests pass.

- [ ] **Step 4: Run ALL API tests**

```
cd dashboard && npm run test:api
```

Expected: all tests across sessions, live, cost, tools, config pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/api/routes/config.js dashboard/api/__tests__/config.test.js
git commit -m "feat(dashboard/api): add /api/config route (allowlists + env)"
```

---

## Milestone 3 — React Hooks

### Task 12: useApi / usePoll / useStream hooks

**Files:**
- Create: `dashboard/src/hooks/useApi.js`
- Create: `dashboard/src/hooks/usePoll.js`
- Create: `dashboard/src/hooks/useStream.js`

- [ ] **Step 1: Write useApi.js**

```javascript
// dashboard/src/hooks/useApi.js
import { useState, useEffect } from 'react';

export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api${path}`)
      .then(r => r.ok ? r.json() : Promise.reject(`${r.status} ${r.statusText}`))
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
    // deps are caller-controlled — disable lint for this generic hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  return { data, loading, error };
}
```

- [ ] **Step 2: Write usePoll.js**

```javascript
// dashboard/src/hooks/usePoll.js
import { useState, useEffect } from 'react';

export function usePoll(path, intervalMs = 10000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    function fetchNow() {
      fetch(`/api${path}`)
        .then(r => r.ok ? r.json() : Promise.reject(`${r.status} ${r.statusText}`))
        .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
        .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    }

    fetchNow();
    const timer = setInterval(fetchNow, intervalMs);
    return () => { cancelled = true; clearInterval(timer); };
  }, [path, intervalMs]);

  return { data, loading, error };
}
```

- [ ] **Step 3: Write useStream.js**

```javascript
// dashboard/src/hooks/useStream.js
import { useState, useEffect } from 'react';

export function useStream(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const es = new EventSource(`/api${path}`);
    es.onmessage = e => {
      try { setData(JSON.parse(e.data)); } catch { /* ignore malformed */ }
    };
    es.onerror = () => {
      setError('SSE connection lost — reconnecting…');
    };
    return () => es.close();
  }, [path]);

  return { data, error };
}
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/hooks/
git commit -m "feat(dashboard): add useApi, usePoll, useStream hooks"
```

---

## Milestone 4 — Wire React Components

### Task 13: Wire SessionExplorer

**Files:**
- Modify: `dashboard/src/components/SessionExplorer.js`

Remove `MOCK_SESSIONS` and replace with `useApi('/sessions')`.

- [ ] **Step 1: Rewrite SessionExplorer.js**

Replace the entire file with:

```javascript
import React, { useState } from 'react';
import { useApi } from '../hooks/useApi';

const CHANNELS = ['All', 'slack', 'teams', 'cron'];
const STATUSES = ['All', 'completed', 'active', 'failed'];

export default function SessionExplorer({ onSessionClick }) {
  const [channel, setChannel] = useState('All');
  const [status, setStatus]   = useState('All');
  const { data: sessions, loading, error } = useApi('/sessions');

  const filtered = (sessions ?? []).filter(s =>
    (channel === 'All' || s.channel === channel) &&
    (status  === 'All' || s.status  === status)
  );

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading sessions…</p>;
  if (error)   return <p style={{ color: 'var(--red)', padding: '24px' }}>Error: {error}</p>;

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Sessions</h2>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', fontSize: '12px' }}>
        <div>
          <span style={{ color: 'var(--text-muted)', marginRight: '8px' }}>Channel:</span>
          {CHANNELS.map(c => (
            <button key={c} onClick={() => setChannel(c)} style={{
              background: channel === c ? 'var(--blue)' : 'var(--bg)',
              color: channel === c ? '#fff' : 'var(--text)',
              border: `1px solid ${channel === c ? 'var(--blue)' : 'var(--border)'}`,
              borderRadius: '14px', padding: '3px 12px', cursor: 'pointer', marginRight: '6px'
            }}>{c}</button>
          ))}
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)', marginRight: '8px' }}>Status:</span>
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatus(s)} style={{
              background: status === s ? 'var(--blue)' : 'var(--bg)',
              color: status === s ? '#fff' : 'var(--text)',
              border: `1px solid ${status === s ? 'var(--blue)' : 'var(--border)'}`,
              borderRadius: '14px', padding: '3px 12px', cursor: 'pointer', marginRight: '6px'
            }}>{s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        {filtered.length === 0 && (
          <div style={{ background: 'var(--bg-card)', padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No sessions match the current filters.
          </div>
        )}
        {filtered.map(session => (
          <div
            key={session.corr_id}
            onClick={() => onSessionClick(session)}
            style={{
              background: 'var(--bg-card)', padding: '12px 16px', cursor: 'pointer',
              display: 'grid', gridTemplateColumns: '180px 80px 80px 100px 1fr',
              alignItems: 'center', gap: '16px',
            }}
          >
            <code style={{ fontSize: '12px', color: 'var(--blue)' }}>{session.corr_id}</code>
            <span style={{ fontSize: '12px' }}>{session.channel}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{session.user}</span>
            <span style={{
              fontSize: '12px',
              color: session.status === 'completed' ? 'var(--green)'
                   : session.status === 'failed'    ? 'var(--red)' : 'var(--yellow)'
            }}>{session.status}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {session.ts ? new Date(session.ts).toLocaleString() : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify component still renders in dev (with LA_MOCK=true)**

```
cd dashboard && LA_MOCK=true npm run dev
# Open http://localhost:3000 — Sessions tab should show mock sessions
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/SessionExplorer.js
git commit -m "feat(dashboard): wire SessionExplorer to /api/sessions"
```

---

### Task 14: Wire CorrelationTree

**Files:**
- Modify: `dashboard/src/components/CorrelationTree.js`

Remove `MOCK_TREE`; fetch tree for `session.corr_id` when session is set.

- [ ] **Step 1: Rewrite CorrelationTree.js**

```javascript
import React from 'react';
import { useApi } from '../hooks/useApi';

const statusColor = s => s === 'completed' ? 'var(--green)' : s === 'failed' ? 'var(--red)' : 'var(--yellow)';

export default function CorrelationTree({ session, onBack }) {
  const corrId = session?.corr_id ?? session?.correlation_id ?? '';
  const { data: tree, loading, error } = useApi(
    `/sessions/${encodeURIComponent(corrId)}/tree`,
    [corrId]
  );

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading correlation tree…</p>;
  if (error)   return <p style={{ color: 'var(--red)', padding: '24px' }}>Error: {error}</p>;
  if (!tree)   return null;

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer',
        fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px'
      }}>← Back to Sessions</button>

      <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>
        Correlation Tree: <code style={{ color: 'var(--blue)' }}>{tree.correlation_id}</code>
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
        {session?.channel} · {session?.user} · {session?.ts ? new Date(session.ts).toLocaleString() : ''}
      </p>

      <div style={{ borderLeft: '2px solid var(--blue)', paddingLeft: '20px' }}>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '12px 16px', marginBottom: '12px', display: 'inline-block'
        }}>
          <span style={{ fontWeight: 600 }}>📋 Orchestrator</span>
          <span style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
            {tree.minions.length} minions
          </span>
        </div>

        {(tree.minions ?? []).map((minion, i) => (
          <div key={minion.id} style={{
            borderLeft: i < tree.minions.length - 1 ? '2px solid var(--border)' : 'none',
            paddingLeft: '24px', paddingBottom: '8px'
          }}>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '10px 14px', marginBottom: '6px',
              display: 'flex', alignItems: 'center', gap: '12px'
            }}>
              <span style={{ color: statusColor(minion.status ?? 'completed'), fontWeight: 600 }}>✅</span>
              <code style={{ color: 'var(--blue)', fontSize: '12px' }}>{minion.id}</code>
              <span style={{ fontSize: '13px', fontWeight: 500 }}>{minion.type}</span>
            </div>

            {(minion.tool_calls ?? []).map((call, j) => (
              <div key={j} style={{
                borderLeft: '2px solid var(--border)', marginLeft: '12px',
                paddingLeft: '16px', paddingBottom: '4px'
              }}>
                <div style={{
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: '6px', padding: '8px 12px',
                  display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                  <span style={{ color: call.status === 'success' ? 'var(--green)' : 'var(--red)', fontSize: '11px' }}>
                    {call.status === 'success' ? '✓' : '✗'}
                  </span>
                  <code style={{ fontSize: '12px', color: 'var(--purple)' }}>{call.tool}</code>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{call.duration}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {JSON.stringify(call.params ?? {}).slice(0, 50)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in dev — click a session in Sessions tab, tree should load**

```
# With dev server running, click any session row → CorrelationTree view loads
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/CorrelationTree.js
git commit -m "feat(dashboard): wire CorrelationTree to /api/sessions/:corrId/tree"
```

---

### Task 15: Wire LiveDashboard

**Files:**
- Modify: `dashboard/src/components/LiveDashboard.js`

Replace `MOCK_LIVE` and `MOCK_RECENT` with `useStream('/live/stream')` for real-time updates, with `usePoll('/live', 10000)` as fallback.

- [ ] **Step 1: Rewrite LiveDashboard.js**

```javascript
import React from 'react';
import { usePoll } from '../hooks/usePoll';
import { useStream } from '../hooks/useStream';

export default function LiveDashboard() {
  const { data: polled } = usePoll('/live', 30000);
  const { data: streamed } = useStream('/live/stream');

  // Prefer streamed data (lower latency); fall back to polled if SSE fails
  const live = streamed ?? polled;

  const active = live?.active ?? [];
  const recent = live?.recent ?? [];
  const stats  = live?.stats  ?? { active: 0, completed_today: 0, failed_today: 0, avg_duration: '—' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>
          🟢 Active Minions ({active.length})
        </h2>
        {active.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No active minions.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {active.map(m => {
            const [cur, max] = (m.progress ?? '0/0').split('/').map(Number);
            const pct = max > 0 ? (cur / max) * 100 : 0;
            return (
              <div key={m.corr_id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600 }}>{m.minion}</span>
                  <span style={{ fontSize: '12px', color: 'var(--yellow)' }}>🔄 {m.status}</span>
                </div>
                <div style={{ height: '4px', background: 'var(--bg)', borderRadius: '2px', marginBottom: '8px' }}>
                  <div style={{ height: '4px', background: 'var(--blue)', borderRadius: '2px', width: `${pct}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>{m.progress}</span>
                  <span>{m.elapsed}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>📋 Recent Completions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {recent.map((m, i) => (
            <div key={i} style={{
              background: m.status === 'failed' ? '#2d1215' : 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: m.status === 'completed' ? 'var(--green)' : 'var(--red)' }}>
                  {m.status === 'completed' ? '✅' : '❌'}
                </span>
                <span style={{ fontWeight: 500 }}>{m.minion}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.ts}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {[
          { label: 'Active Sessions',  value: stats.active,           color: 'var(--yellow)' },
          { label: 'Completed Today',  value: stats.completed_today,  color: 'var(--green)' },
          { label: 'Failed Today',     value: stats.failed_today,     color: 'var(--red)' },
          { label: 'Avg Duration',     value: stats.avg_duration,     color: 'var(--blue)' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '16px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: stat.color, marginBottom: '4px' }}>{stat.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify Live tab shows "No active minions" in dev (correct — no real sessions)**

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/LiveDashboard.js
git commit -m "feat(dashboard): wire LiveDashboard to /api/live SSE stream"
```

---

### Task 16: Wire CostDashboard

**Files:**
- Modify: `dashboard/src/components/CostDashboard.js`

- [ ] **Step 1: Rewrite CostDashboard.js**

```javascript
import React from 'react';
import { useApi } from '../hooks/useApi';

const barColor = pct => pct > 30 ? 'var(--blue)' : pct > 15 ? 'var(--purple)' : 'var(--green)';

export default function CostDashboard() {
  const { data: cost, loading, error } = useApi('/cost');

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading cost data…</p>;
  if (error)   return <p style={{ color: 'var(--red)', padding: '24px' }}>Error: {error}</p>;
  if (!cost)   return null;

  const maxDay = Math.max(...(cost.daily ?? []).map(d => d.cost), 1);

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '4px' }}>Cost Dashboard</h2>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Estimated compute cost (duration × $0.06/hr) — not actual LLM token cost
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Today',      value: `$${cost.today?.total?.toFixed(2) ?? '0.00'}`,      color: 'var(--green)' },
          { label: 'This Week',  value: `$${cost.this_week?.total?.toFixed(2) ?? '0.00'}`,  color: 'var(--blue)' },
          { label: 'This Month', value: `$${cost.this_month?.total?.toFixed(2) ?? '0.00'}`, color: 'var(--purple)' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '16px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>By Agent (this month)</h3>
          {(cost.by_agent ?? []).map(a => (
            <div key={a.agent} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                <span>{a.agent}</span>
                <span style={{ color: 'var(--text-muted)' }}>${a.cost?.toFixed(2) ?? '0.00'} · {a.calls} calls</span>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: '4px', height: '8px' }}>
                <div style={{ background: barColor(a.percentage), borderRadius: '4px', height: '8px', width: `${a.percentage}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '24px', gridColumn: '1 / -1' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>Daily Cost Trend</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '100px' }}>
            {(cost.daily ?? []).map(d => (
              <div key={d.date} style={{ flex: 1, textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>${d.cost?.toFixed(2) ?? '0.00'}</span>
                <div style={{
                  background: 'var(--blue)', height: `${(d.cost / maxDay) * 80}px`,
                  borderRadius: '4px 4px 0 0', marginTop: '4px', minWidth: '20px'
                }} />
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>{d.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/CostDashboard.js
git commit -m "feat(dashboard): wire CostDashboard to /api/cost"
```

---

### Task 17: Wire ToolCallAnalyzer

**Files:**
- Modify: `dashboard/src/components/ToolCallAnalyzer.js`

- [ ] **Step 1: Rewrite ToolCallAnalyzer.js**

```javascript
import React, { useState } from 'react';
import { useApi } from '../hooks/useApi';

const AGENTS = ['All', 'code-reviewer', 'code-explorer', 'pr-crafter', 'ticket-analyst', 'security-auditor'];

export default function ToolCallAnalyzer() {
  const [agentFilter, setAgentFilter] = useState('All');
  const { data: tools, loading, error } = useApi(
    `/tools?agent=${encodeURIComponent(agentFilter)}`,
    [agentFilter]
  );

  const filtered = tools ?? [];
  const maxCalls = Math.max(...filtered.map(t => t.calls), 1);

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading tool call data…</p>;
  if (error)   return <p style={{ color: 'var(--red)', padding: '24px' }}>Error: {error}</p>;

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Tool Call Analyzer</h2>

      <div style={{ marginBottom: '20px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '12px' }}>Agent:</span>
        {AGENTS.map(a => (
          <button key={a} onClick={() => setAgentFilter(a)} style={{
            background: agentFilter === a ? 'var(--blue)' : 'var(--bg)',
            color: agentFilter === a ? '#fff' : 'var(--text)',
            border: `1px solid ${agentFilter === a ? 'var(--blue)' : 'var(--border)'}`,
            borderRadius: '14px', padding: '3px 12px', fontSize: '12px', cursor: 'pointer', marginRight: '6px'
          }}>{a}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Calls',  value: filtered.reduce((s, t) => s + t.calls, 0),  color: 'var(--blue)' },
          { label: 'Unique Tools', value: filtered.length,                              color: 'var(--purple)' },
          { label: 'Errors',       value: filtered.reduce((s, t) => s + t.errors, 0), color: 'var(--red)' },
          { label: 'Top Tool',     value: filtered[0]?.tool?.split('.')[1] ?? '—',     color: 'var(--green)' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '14px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        {filtered.map(tool => (
          <div key={tool.tool} style={{
            background: 'var(--bg-card)', padding: '12px 16px',
            display: 'grid', gridTemplateColumns: '200px 1fr 120px 80px 80px', alignItems: 'center', gap: '16px'
          }}>
            <div>
              <code style={{ fontSize: '13px', color: 'var(--purple)' }}>{tool.tool}</code>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{tool.agent}</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: '4px', height: '20px', position: 'relative' }}>
              <div style={{
                background: tool.errors > 0 ? 'var(--yellow)' : 'var(--blue)',
                borderRadius: '4px', height: '20px', width: `${(tool.calls / maxCalls) * 100}%`, transition: 'width 0.3s'
              }} />
              <span style={{ position: 'absolute', left: '8px', top: '1px', fontSize: '11px', color: '#fff' }}>
                {tool.calls} calls
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>{tool.avg_duration}</span>
            <span style={{ fontSize: '12px', color: tool.errors > 0 ? 'var(--red)' : 'var(--green)', textAlign: 'center' }}>
              {tool.errors > 0 ? `${tool.errors} err` : '0'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>{tool.last}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/ToolCallAnalyzer.js
git commit -m "feat(dashboard): wire ToolCallAnalyzer to /api/tools"
```

---

### Task 18: Wire PromptManager

**Files:**
- Modify: `dashboard/src/components/PromptManager.js`

The "Prompt Versions" section has no backend source yet (would require a prompt registry, out of scope). Replace it with a note. The allowlist and env sections come from `/api/config`.

- [ ] **Step 1: Rewrite PromptManager.js**

```javascript
import React from 'react';
import { useApi } from '../hooks/useApi';

export default function PromptManager() {
  const { data: config, loading, error } = useApi('/config');

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading config…</p>;
  if (error)   return <p style={{ color: 'var(--red)', padding: '24px' }}>Error: {error}</p>;
  if (!config) return null;

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Prompt &amp; Config Manager</h2>

      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '8px', padding: '16px', marginBottom: '24px',
        fontSize: '13px', color: 'var(--text-muted)'
      }}>
        📝 Prompt version tracking requires a prompt registry service — coming in Phase 2.
        Agent definitions live in <code>.agents/agents/*.md</code>.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Allowlist config */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Tool Allowlists</h3>
          {(config.allowlists ?? []).map(a => (
            <div key={a.agent} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>{a.agent}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {a.tools.map(t => (
                  <code key={t} style={{ marginRight: '8px', color: 'var(--purple)' }}>{t}</code>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Environment config */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Environment</h3>
          {Object.entries(config.env ?? {}).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px', borderBottom: '1px solid var(--border)' }}>
              <code style={{ color: 'var(--green)' }}>{key}</code>
              <span style={{ color: 'var(--text-muted)' }}>{val}</span>
            </div>
          ))}
          {Object.keys(config.env ?? {}).length === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No env vars configured in API_PORT or GOOSE_SERVER_PORT.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/PromptManager.js
git commit -m "feat(dashboard): wire PromptManager to /api/config"
```

---

## Milestone 5 — CI + Docs

### Task 19: CI + documentation

**Files:**
- Modify: `.github/workflows/ci.yml` — add `dashboard-api` job
- Modify: `docs/superpowers/plans/2026-06-17-dashboard-live-data.md` — mark all tasks done

- [ ] **Step 1: Add dashboard-api job to ci.yml**

Add this job after the `node` job:

```yaml
  dashboard-api:
    name: Dashboard API (tests)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: dashboard/package-lock.json
      - name: Install
        run: npm ci
        working-directory: dashboard
      - name: Test API
        run: npm run test:api
        working-directory: dashboard
        env:
          LA_MOCK: 'true'
          NODE_ENV: test
```

Add `dashboard-api` to the `needs` array of the `gate` job.

- [ ] **Step 2: Run API tests locally one final time**

```
cd dashboard && LA_MOCK=true NODE_ENV=test npm run test:api
```

Expected: all tests pass across all 5 route files.

- [ ] **Step 3: Run full dev stack to verify end-to-end**

```
cd dashboard && LA_MOCK=true npm run dev
# Open http://localhost:3000
# Sessions tab: shows mock sessions
# Live tab: shows "No active minions" (correct — goose serve not running)
# Tool Calls tab: shows mock tool call table
# Cost tab: shows estimated cost bars
# Config tab: shows real allowlists from /api/config
```

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add dashboard-api job to CI pipeline"
git push -u origin feature/dashboard-live-data
```

- [ ] **Step 5: Open PR**

```bash
gh pr create \
  --title "feat(dashboard): wire all 6 components to real backend APIs" \
  --body "Replaces all MOCK_* constants with real Log Analytics queries, goose serve WebSocket, and config reflection. Adds Express API server at dashboard/api/. LA_MOCK=true for local dev without Azure access."
```

---

## Future Work (Phase 2)

These items are deliberately out of scope for this plan but noted for backlog:

| Item | Why deferred |
|---|---|
| Actual LLM token cost (Azure Cost Management API) | 24-hour data lag; requires `Microsoft.CostManagement/query` role |
| Prompt version registry | Needs new service + storage; no backend exists yet |
| Intent field in SessionExplorer | Orchestrator (Goose) doesn't log intent to stdout; needs plugin change |
| Dashboard Container App in Terraform | Serve the React SPA + API as a Container App in production |
| Authentication on `/api/*` endpoints | Currently open; add Azure AD token validation before production |

---

## Surprises & Discoveries

- **AuditEntry logs to stdout only** — the Rust toolshed emits JSON lines to stdout (collected by Container Apps → Log Analytics). There is no direct Azure Table Storage write in the current code despite the architecture doc naming `ToolCallLog` as a Table. Log Analytics is the authoritative query target.
- **Cost estimation is approximate** — toolshed logs `duration_ms` per tool call, not LLM token counts. Accurate AI cost requires Azure Cost Management API (24h lag).
- **goose serve ACP protocol** — bots use JSON-RPC 2.0 over WebSocket; `notifications/AgentStatus` carries `{ sessionId, status, agent_type, turns }`. The dashboard proxies this as SSE.
