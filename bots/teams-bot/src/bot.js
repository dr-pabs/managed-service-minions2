// Teams Bot ACP Client
// Bridges Microsoft Teams messages to goose serve via ACP WebSocket.
//
// Prerequisites:
//   GOOSE_SERVE_URL          — e.g. http://localhost:3284
//   GOOSE_SERVER__SECRET_KEY  — goose serve secret key
//   AZURE_AD_CLIENT_ID       — Azure AD app registration client ID
//   AZURE_AD_TENANT_ID       — Azure AD tenant ID
//   AZURE_AD_CLIENT_SECRET   — Azure AD client secret

const { ActivityHandler, BotFrameworkAdapter } = require('botbuilder');
const WebSocket = require('ws');

const GOOSE_URL = process.env.GOOSE_SERVE_URL || 'http://localhost:3284';
const GOOSE_SECRET = process.env.GOOSE_SERVER__SECRET_KEY || '';

// ACP WebSocket connection (same pattern as Slack bot)
let ws = null;
let msgId = 0;
const pending = new Map();

// Per-user session isolation: each Teams user gets their own goose session.
const sessions = new Map();

// Per-session streaming buffers: accumulate AgentMessageChunk events and
// resolve the promise that sendToGoose is waiting on when the final chunk arrives.
const streamingBuffers = new Map();

// ── Incoming WebSocket message handler (extracted for testability) ──────────

function processWsMessage(data) {
  try {
    const msg = JSON.parse(data.toString());

    // JSON-RPC response to a sendACP call (has an id)
    if (msg.id != null && pending.has(msg.id)) {
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
  } catch (_) {}
}

// ── ACP Client ─────────────────────────────────────────────────────────────

function connectACP() {
  return new Promise((resolve, reject) => {
    const url = `${GOOSE_URL.replace('http', 'ws')}/acp?token=${GOOSE_SECRET}`;
    ws = new WebSocket(url);

    ws.on('open', () => {
      console.log(`[teams-bot] Connected to goose serve: ${GOOSE_URL}`);
      sendACP('initialize', {
        protocolVersion: '1.0',
        clientCapabilities: { tools: [] },
        clientInfo: { name: 'goose-teams-bot', version: '0.1.0' }
      }).then(resolve).catch(reject);
    });

    ws.on('message', processWsMessage);

    ws.on('close', () => {
      console.log('[teams-bot] ACP disconnected. Reconnecting in 5s...');
      setTimeout(connectACP, 5000);
    });

    ws.on('error', (err) => {
      console.error('[teams-bot] ACP error:', err.message);
      reject(err);
    });
  });
}

function sendACP(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    pending.set(id, resolve);
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
  console.log(`[teams-bot] Session created for user ${userId}: ${sid}`);
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

// ── Teams Bot ──────────────────────────────────────────────────────────────

class GooseTeamsBot extends ActivityHandler {
  constructor() {
    super();

    this.onMessage(async (context, next) => {
      const text = context.activity.text;
      const userId = context.activity.from.id;

      // Typing indicator
      await context.sendActivity({ type: 'typing' });

      try {
        // Send to goose — keyed on the Teams user ID for session isolation
        const reply = await sendToGoose(text, userId);

        // Send Adaptive Card response
        await context.sendActivity({
          type: 'message',
          text: reply,
          attachments: [{
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              type: 'AdaptiveCard',
              version: '1.4',
              body: [
                {
                  type: 'TextBlock',
                  text: reply || '(no response)',
                  wrap: true
                }
              ]
            }
          }]
        });
      } catch (err) {
        console.error('[teams-bot] Error:', err.message);
        await context.sendActivity(`Sorry, I ran into an error: ${err.message}`);
      }

      await next();
    });
  }
}

// ── Test Exports ───────────────────────────────────────────────────────────
// Internal state and functions exported for unit tests only.
module.exports = {
  sessions,
  streamingBuffers,
  pending,
  processWsMessage,
  ensureSession,
  sendToGoose,
  /** Inject a mock WebSocket for testing. Resets msgId and pending state. */
  _setWs(mockWs) { ws = mockWs; msgId = 0; pending.clear(); },
  /** Reset all module-level state between tests. */
  _reset() { sessions.clear(); streamingBuffers.clear(); pending.clear(); msgId = 0; ws = null; },
};

// ── Startup ────────────────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    console.log('[teams-bot] Starting...');
    await connectACP();

    const adapter = new BotFrameworkAdapter({
      appId: process.env.AZURE_AD_CLIENT_ID,
      appPassword: process.env.AZURE_AD_CLIENT_SECRET
    });

    const bot = new GooseTeamsBot();

    const port = process.env.PORT || 3978;

    const restify = require('restify');
    const server = restify.createServer();
    server.post('/api/messages', (req, res) => {
      adapter.processActivity(req, res, async (context) => {
        await bot.run(context);
      });
    });

    server.listen(port, () => {
      console.log(`[teams-bot] Teams bot listening on port ${port}`);
    });
  })();
}
