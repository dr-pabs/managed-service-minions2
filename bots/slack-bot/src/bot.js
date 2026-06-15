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
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        } else if (msg.method === 'notifications/AgentMessageChunk') {
          // Streaming response — accumulate
          const sid = msg.params?.sessionId;
          // Store for later collection
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

let sessionId = null;

async function ensureSession() {
  if (sessionId) return sessionId;
  const result = await sendACP('session/new', {
    sessionId: null,
    cwd: '/tmp',
    mcpServers: []
  });
  sessionId = result.result.sessionId;
  console.log(`[slack-bot] Session created: ${sessionId}`);
  return sessionId;
}

async function sendToGoose(userMessage, userId) {
  const sid = await ensureSession();
  return sendACP('session/prompt', {
    sessionId: sid,
    prompt: [{ type: 'user', text: userMessage }]
  });
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
    // Send to goose
    const response = await sendToGoose(event.text, event.user);

    // Extract response text
    const text = extractResponse(response);

    // Reply in thread
    await say({
      text: text || '(no response)',
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

function extractResponse(response) {
  try {
    // ACP streaming response — last AgentMessageChunk contains the full text
    if (response?.result?.text) return response.result.text;
    return JSON.stringify(response, null, 2).slice(0, 3000);
  } catch (_) {
    return '(unable to parse response)';
  }
}

// ── Startup ────────────────────────────────────────────────────────────────

(async () => {
  console.log('[slack-bot] Starting...');
  await connectACP();
  await app.start();
  console.log('[slack-bot] Slack bot is running');
})();
