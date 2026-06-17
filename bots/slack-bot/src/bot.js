// Slack Bot ACP Client
// Bridges Slack messages to goose serve via ACP WebSocket.
//
// Prerequisites:
//   GOOSE_SERVE_URL        — e.g. http://localhost:3284
//   SLACK_BOT_TOKEN        — Slack bot token (xoxb-...)
//   SLACK_SIGNING_SECRET   — Slack signing secret
//   SLACK_APP_TOKEN        — Slack app-level token (xapp-...)
//   GOOSE_SERVER__SECRET_KEY — goose serve secret key

const { App } = require('@slack/bolt');
const WebSocket = require('ws');

const GOOSE_URL = process.env.GOOSE_SERVE_URL || 'http://localhost:3284';
const GOOSE_SECRET = process.env.GOOSE_SERVER__SECRET_KEY || '';

// ACP WebSocket connection to goose serve
let ws = null;
let msgId = 0;
const pending = new Map();

// Per-user session isolation: each Slack user gets their own goose session.
const sessions = new Map();

// Per-session streaming buffers: accumulate AgentMessageChunk events and
// resolve the promise that sendToGoose is waiting on when the final chunk arrives.
const streamingBuffers = new Map();

function connectACP() {
  return new Promise((resolve, reject) => {
    const url = `${GOOSE_URL.replace('http', 'ws')}/acp?token=${GOOSE_SECRET}`;
    ws = new WebSocket(url);

    ws.on('open', () => {
      console.log(`[slack-bot] Connected to goose serve: ${GOOSE_URL}`);

      // Initialize ACP connection
      sendACP('initialize', {
        protocolVersion: '1.0',
        clientCapabilities: { tools: [] },
        clientInfo: { name: 'goose-slack-bot', version: '0.1.0' }
      }).then(resolve).catch(reject);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // JSON-RPC response to a sendACP call (has an id)
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
          return;
        }

        // Streaming chunk from the agent — accumulate until last=true
        if (msg.method === 'notifications/AgentMessageChunk') {
          const sid = msg.params?.sessionId;
          const buf = streamingBuffers.get(sid);
          if (!buf) return;

          buf.chunks.push(msg.params?.chunk?.text || '');

          if (msg.params?.last === true) {
            streamingBuffers.delete(sid);
            buf.resolve(buf.chunks.join(''));
          }
          return;
        }

        // Fallback completion signal
        if (msg.method === 'notifications/AgentStatus' && msg.params?.status === 'done') {
          const sid = msg.params?.sessionId;
          const buf = streamingBuffers.get(sid);
          if (buf) {
            streamingBuffers.delete(sid);
            buf.resolve(buf.chunks.join(''));
          }
        }
      } catch (err) {
        console.error('[slack-bot] ACP message parse error:', err.message);
      }
    });

    ws.on('close', () => {
      console.log('[slack-bot] ACP disconnected. Reconnecting in 5s...');
      setTimeout(connectACP, 5000);
    });

    ws.on('error', (err) => {
      console.error('[slack-bot] ACP error:', err.message);
      reject(err);
    });
  });
}

function sendACP(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const payload = { jsonrpc: '2.0', id, method, params };
    pending.set(id, resolve);
    ws.send(JSON.stringify(payload));
    // Timeout after 60s
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`ACP timeout: ${method}`));
      }
    }, 60000);
  });
}

async function ensureSession(userId) {
  if (sessions.has(userId)) return sessions.get(userId);
  const result = await sendACP('session/new', {
    sessionId: null,
    cwd: '/tmp',
    mcpServers: []
  });
  const sid = result.result.sessionId;
  sessions.set(userId, sid);
  console.log(`[slack-bot] Session created for user ${userId}: ${sid}`);
  return sid;
}

async function sendToGoose(userMessage, userId) {
  const sid = await ensureSession(userId);

  // Register a streaming buffer before sending the prompt so no chunks are missed.
  const responsePromise = new Promise((resolve, reject) => {
    streamingBuffers.set(sid, { chunks: [], resolve, reject });
    setTimeout(() => {
      if (streamingBuffers.has(sid)) {
        streamingBuffers.delete(sid);
        reject(new Error('Response timeout after 120s'));
      }
    }, 120000);
  });

  // Send the prompt (returns an acknowledgement, not the final answer)
  await sendACP('session/prompt', {
    sessionId: sid,
    prompt: [{ type: 'user', text: userMessage }]
  });

  // Wait for streaming chunks to complete
  return responsePromise;
}

// ── Slack Bot ──────────────────────────────────────────────────────────────

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Channel allowlist — if set, only respond in these channels
const ALLOWED_CHANNELS = (process.env.SLACK_ALLOWED_CHANNELS || '')
  .split(',').map(c => c.trim()).filter(Boolean);

app.event('message', async ({ event, say }) => {
  // Ignore bot messages and non-text
  if (event.subtype || !event.text) return;

  // Channel allowlist
  if (ALLOWED_CHANNELS.length > 0 && !ALLOWED_CHANNELS.includes(event.channel)) {
    return;
  }

  // Add thinking reaction
  try {
    await app.client.reactions.add({
      token: process.env.SLACK_BOT_TOKEN,
      channel: event.channel,
      name: 'thinking_face',
      timestamp: event.ts
    });
  } catch (_) {}

  try {
    // Send to goose — keyed on the Slack user ID for session isolation
    const response = await sendToGoose(event.text, event.user);

    // Reply in thread
    await say({
      text: response || '(no response)',
      thread_ts: event.ts
    });

    // Remove thinking reaction
    try {
      await app.client.reactions.remove({
        token: process.env.SLACK_BOT_TOKEN,
        channel: event.channel,
        name: 'thinking_face',
        timestamp: event.ts
      });
    } catch (_) {}

  } catch (err) {
    console.error('[slack-bot] Error processing message:', err.message);
    await say({
      text: `Sorry, I ran into an error: ${err.message}`,
      thread_ts: event.ts
    });
  }
});

// ── Startup ────────────────────────────────────────────────────────────────

(async () => {
  console.log('[slack-bot] Starting...');
  await connectACP();
  await app.start();
  console.log('[slack-bot] Slack bot is running');
})();
