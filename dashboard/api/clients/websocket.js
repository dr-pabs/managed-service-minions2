const WebSocket = require('ws');

const GOOSE_URL = process.env.GOOSE_WS_URL || 'ws://localhost:3284';

let ws = null;
const subscribers = new Set();

// Active sessions: corr_id → { corr_id, minion, status, progress, elapsed, started }
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
