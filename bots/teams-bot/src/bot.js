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

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      } catch (_) {}
    });

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

let sessionId = null;

async function ensureSession() {
  if (sessionId) return sessionId;
  const result = await sendACP('session/new', {
    sessionId: null,
    cwd: '/tmp',
    mcpServers: []
  });
  sessionId = result.result.sessionId;
  console.log(`[teams-bot] Session created: ${sessionId}`);
  return sessionId;
}

async function sendToGoose(userMessage) {
  const sid = await ensureSession();
  return sendACP('session/prompt', {
    sessionId: sid,
    prompt: [{ type: 'user', text: userMessage }]
  });
}

// ── Teams Bot ──────────────────────────────────────────────────────────────

class GooseTeamsBot extends ActivityHandler {
  constructor() {
    super();

    this.onMessage(async (context, next) => {
      const text = context.activity.text;

      // Typing indicator
      await context.sendActivity({ type: 'typing' });

      try {
        const response = await sendToGoose(text, context.activity.from.id);
        const reply = extractResponse(response);

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
                  text: reply,
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

function extractResponse(response) {
  try {
    if (response?.result?.text) return response.result.text;
    return JSON.stringify(response, null, 2).slice(0, 3000);
  } catch (_) {
    return '(unable to parse response)';
  }
}

// ── Startup ────────────────────────────────────────────────────────────────

(async () => {
  console.log('[teams-bot] Starting...');
  await connectACP();

  const adapter = new BotFrameworkAdapter({
    appId: process.env.AZURE_AD_CLIENT_ID,
    appPassword: process.env.AZURE_AD_CLIENT_SECRET
  });

  const bot = new GooseTeamsBot();

  // Listen on port 3978 (Teams default) or PORT env var
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
