'use strict';

// bot.test.js — unit tests for the Slack bot ACP client.
// Uses jest fake timers for the timeout test and Promise.resolve().then()
// for mock responses (microtasks are NOT affected by fake timers).

const bot = require('./bot');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockWs() {
  return { send: jest.fn(), on: jest.fn() };
}

/** Simulate an incoming WebSocket message from the ACP server. */
function deliver(data) {
  bot.processWsMessage(typeof data === 'string' ? data : JSON.stringify(data));
}

/**
 * Wire a mock WS to respond to a specific method with a fixed result.
 * Uses Promise.resolve().then() so the response arrives as a microtask
 * and is not blocked by jest fake timers.
 */
function autoRespond(mockWs, methodToMatch, result) {
  mockWs.send.mockImplementation((raw) => {
    const msg = JSON.parse(raw);
    if (msg.method === methodToMatch) {
      Promise.resolve().then(() =>
        deliver({ jsonrpc: '2.0', id: msg.id, result })
      );
    }
  });
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  bot._reset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ── processWsMessage ──────────────────────────────────────────────────────────

describe('processWsMessage', () => {
  test('routes JSON-RPC responses to the matching pending callback', () => {
    const resolve = jest.fn();
    bot.pending.set(7, resolve);
    deliver({ jsonrpc: '2.0', id: 7, result: { sessionId: 'abc' } });
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ result: { sessionId: 'abc' } }));
    expect(bot.pending.has(7)).toBe(false);
  });

  test('accumulates AgentMessageChunk events and resolves on last=true', () => {
    const resolve = jest.fn();
    bot.streamingBuffers.set('sid_1', { chunks: [], resolve, reject: jest.fn() });

    deliver({ method: 'notifications/AgentMessageChunk', params: { sessionId: 'sid_1', chunk: { text: 'hello ' }, last: false } });
    deliver({ method: 'notifications/AgentMessageChunk', params: { sessionId: 'sid_1', chunk: { text: 'world' }, last: true } });

    expect(resolve).toHaveBeenCalledWith('hello world');
    expect(bot.streamingBuffers.has('sid_1')).toBe(false);
  });

  test('resolves streaming buffer on AgentStatus done (fallback)', () => {
    const resolve = jest.fn();
    bot.streamingBuffers.set('sid_2', { chunks: ['partial '], resolve, reject: jest.fn() });

    deliver({ method: 'notifications/AgentStatus', params: { sessionId: 'sid_2', status: 'done' } });

    expect(resolve).toHaveBeenCalledWith('partial ');
    expect(bot.streamingBuffers.has('sid_2')).toBe(false);
  });

  test('ignores AgentMessageChunk for an unknown session id', () => {
    expect(() => deliver({
      method: 'notifications/AgentMessageChunk',
      params: { sessionId: 'no-such', chunk: { text: 'x' }, last: true }
    })).not.toThrow();
  });

  test('ignores AgentStatus done for an unknown session id', () => {
    expect(() => deliver({
      method: 'notifications/AgentStatus',
      params: { sessionId: 'no-such', status: 'done' }
    })).not.toThrow();
  });

  test('does not throw on unknown message methods', () => {
    expect(() => deliver({ method: 'notifications/Unknown', params: {} })).not.toThrow();
  });

  test('handles malformed JSON without throwing', () => {
    expect(() => bot.processWsMessage('not-valid-json')).not.toThrow();
  });
});

// ── ensureSession ─────────────────────────────────────────────────────────────

describe('ensureSession', () => {
  test('creates a new goose session for a first-time user', async () => {
    const mockWs = makeMockWs();
    bot._setWs(mockWs);
    autoRespond(mockWs, 'session/new', { sessionId: 'sess-abc' });

    const sid = await bot.ensureSession('user_1');

    expect(sid).toBe('sess-abc');
    expect(bot.sessions.get('user_1')).toBe('sess-abc');
  });

  test('reuses the cached session for a returning user', async () => {
    const mockWs = makeMockWs();
    bot._setWs(mockWs);
    bot.sessions.set('user_2', 'existing-sess');

    const sid = await bot.ensureSession('user_2');

    expect(sid).toBe('existing-sess');
    expect(mockWs.send).not.toHaveBeenCalled();
  });
});

// ── sendToGoose ───────────────────────────────────────────────────────────────

describe('sendToGoose', () => {
  test('streams chunks and resolves with the concatenated response', async () => {
    const mockWs = makeMockWs();
    bot._setWs(mockWs);
    bot.sessions.set('user_3', 'sess-xyz');

    mockWs.send.mockImplementation((raw) => {
      const msg = JSON.parse(raw);
      if (msg.method === 'session/prompt') {
        Promise.resolve().then(() => {
          deliver({ jsonrpc: '2.0', id: msg.id, result: {} });
          deliver({ method: 'notifications/AgentMessageChunk', params: { sessionId: 'sess-xyz', chunk: { text: 'great ' }, last: false } });
          deliver({ method: 'notifications/AgentMessageChunk', params: { sessionId: 'sess-xyz', chunk: { text: 'answer' }, last: true } });
        });
      }
    });

    const result = await bot.sendToGoose('hello', 'user_3');
    expect(result).toBe('great answer');
  });

  test('rejects after 120 seconds without a response', async () => {
    const mockWs = makeMockWs();
    bot._setWs(mockWs);
    bot.sessions.set('user_4', 'sess-timeout');

    // Ack the prompt but never send a streaming response
    mockWs.send.mockImplementation((raw) => {
      const msg = JSON.parse(raw);
      if (msg.method === 'session/prompt') {
        Promise.resolve().then(() => deliver({ jsonrpc: '2.0', id: msg.id, result: {} }));
      }
    });

    const promise = bot.sendToGoose('hello', 'user_4');

    // Two microtask flushes let the async chain run:
    //   flush 1: ensureSession resolves → sendToGoose resumes, sets 120s timer, calls sendACP
    //   flush 2: ack arrives → sendACP resolves; pending entry deleted before timer fires
    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(121000);

    await expect(promise).rejects.toThrow('Response timeout after 120s');
    expect(bot.streamingBuffers.has('sess-timeout')).toBe(false);
  });
});
