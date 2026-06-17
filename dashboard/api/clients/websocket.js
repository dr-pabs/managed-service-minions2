const WebSocket = require('ws');

// GOOSE_WS_URL is the base URL (e.g. wss://orchestrator.fqdn or ws://localhost:3284).
// The /acp path and auth token are appended here, matching the bot connection pattern.
const GOOSE_BASE_URL = process.env.GOOSE_WS_URL || 'ws://localhost:3284';
const GOOSE_SECRET = process.env.GOOSE_SERVER__SECRET_KEY || '';

let ws = null;
const subscribers = new Set();

// Active sessions: corr_id → { corr_id, minion, status, progress, elapsed, started }
const activeSessions = new Map();

function connect() {
  const url = `${GOOSE_BASE_URL}/acp?token=${GOOSE_SECRET}`;
  ws = new WebSocket(url);

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

  ws.on('close', () => setTimeout(connect, 5000));
  ws.on('error', () => { /* close fires next, handles reconnect */ });
}

function broadcast(data) {
  for (const fn of subscribers) fn(data);
}

function subscribe(fn) {
  subscribers.add(fn);
  fn({ active: [...activeSessions.values()] });
  return () => subscribers.delete(fn);
}

function getActive() {
  return [...activeSessions.values()];
}

if (process.env.NODE_ENV !== 'test') connect();

module.exports = { subscribe, getActive, connect };
