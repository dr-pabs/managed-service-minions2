'use strict';

// Skip WebSocket connection to goose serve during tests.
process.env.NODE_ENV = 'test';

// Mock Log Analytics at the module boundary so no real Azure credentials are
// needed. Each test supplies its own resolved value via mockResolvedValueOnce.
jest.mock('../clients/loganalytics');
const { query } = require('../clients/loganalytics');

const request = require('supertest');
const app = require('../server');

beforeEach(() => {
  query.mockReset();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION_ROWS = [
  { corr_id: 'corr_a1b2c3', channel: 'slack', user: 'alice', status: 'completed', ts: '2026-06-17T08:42:00Z', retries: 0 },
  { corr_id: 'corr_b2c3d4', channel: 'teams', user: 'bob',   status: 'failed',    ts: '2026-06-17T08:00:00Z', retries: 1 },
];

const TREE_ROWS = [
  { ts: '2026-06-17T08:42:01Z', agent: 'ticket-analyst', tool: 'ado.query_work_items', result: 'success', duration_ms: 600, params: '{}' },
  { ts: '2026-06-17T08:42:09Z', agent: 'code-explorer',  tool: 'filesystem.read_file',  result: 'success', duration_ms: 200, params: '{}' },
];

const RECENT_ROWS = [
  { minion: 'code-reviewer', status: 'completed', ts: '10:40:50' },
  { minion: 'code-explorer', status: 'failed',    ts: '10:37:42' },
];

const STATS_ROWS  = [{ completed_today: 127, failed_today: 2, avg_duration_ms: 72000 }];

const DAILY_ROWS = [
  { date: '2026-06-16T00:00:00.000Z', daily_cost: 8.23 },
  { date: '2026-06-17T00:00:00.000Z', daily_cost: 4.23 },
];

const BY_AGENT_ROWS = [
  { agent: 'code-reviewer', cost: 12.45, calls: 89 },
  { agent: 'pr-crafter',    cost:  8.92, calls: 52 },
];

const TOOLS_ROWS = [
  { tool: 'github.get_pr_diff',  agent: 'code-reviewer', calls: 89,  avg_ms: 450, errors: 0, last_ts: '2026-06-17T10:42:05Z' },
  { tool: 'filesystem.read_file',agent: 'code-explorer',  calls: 156, avg_ms: 120, errors: 0, last_ts: '2026-06-17T10:42:17Z' },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('GET /api/sessions', () => {
  it('returns an array of sessions', async () => {
    query.mockResolvedValueOnce(SESSION_ROWS);
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  it('each session has required fields', async () => {
    query.mockResolvedValueOnce(SESSION_ROWS);
    const res = await request(app).get('/api/sessions');
    for (const s of res.body) {
      expect(s).toHaveProperty('corr_id');
      expect(s).toHaveProperty('channel');
      expect(s).toHaveProperty('user');
      expect(s).toHaveProperty('status');
      expect(s).toHaveProperty('ts');
      expect(s).toHaveProperty('retries');
    }
  });

  it('returns empty array when Log Analytics has no data', async () => {
    query.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/sessions/:corrId/tree', () => {
  it('returns a correlation tree', async () => {
    query.mockResolvedValueOnce(TREE_ROWS);
    const res = await request(app).get('/api/sessions/corr_a1b2c3/tree');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('correlation_id', 'corr_a1b2c3');
    expect(Array.isArray(res.body.minions)).toBe(true);
    expect(res.body.minions.length).toBeGreaterThan(0);
  });

  it('each minion has id, type, and tool_calls', async () => {
    query.mockResolvedValueOnce(TREE_ROWS);
    const res = await request(app).get('/api/sessions/corr_a1b2c3/tree');
    for (const m of res.body.minions) {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('type');
      expect(Array.isArray(m.tool_calls)).toBe(true);
    }
  });

  it('strips injection characters from corrId', async () => {
    query.mockResolvedValueOnce([]);
    const res = await request(app).get("/api/sessions/corr_x1';DROP/tree");
    expect(res.status).toBe(200);
    expect(res.body.correlation_id).not.toMatch(/['"]/);
  });
});

describe('GET /api/live', () => {
  it('returns active, recent, and stats', async () => {
    query.mockResolvedValueOnce(RECENT_ROWS);
    query.mockResolvedValueOnce(STATS_ROWS);
    const res = await request(app).get('/api/live');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('active');
    expect(res.body).toHaveProperty('recent');
    expect(res.body).toHaveProperty('stats');
  });

  it('stats has required counters', async () => {
    query.mockResolvedValueOnce(RECENT_ROWS);
    query.mockResolvedValueOnce(STATS_ROWS);
    const res = await request(app).get('/api/live');
    const { stats } = res.body;
    expect(stats).toHaveProperty('active');
    expect(stats).toHaveProperty('completed_today');
    expect(stats).toHaveProperty('failed_today');
    expect(stats).toHaveProperty('avg_duration');
  });

  it('recent entries have minion and status', async () => {
    query.mockResolvedValueOnce(RECENT_ROWS);
    query.mockResolvedValueOnce(STATS_ROWS);
    const res = await request(app).get('/api/live');
    expect(res.body.recent).toHaveLength(2);
    for (const r of res.body.recent) {
      expect(r).toHaveProperty('minion');
      expect(r).toHaveProperty('status');
    }
  });

  it('stats default to zero when Log Analytics has no data', async () => {
    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/live');
    expect(res.status).toBe(200);
    expect(res.body.stats.completed_today).toBe(0);
    expect(res.body.stats.failed_today).toBe(0);
  });
});

describe('GET /api/cost', () => {
  it('returns today, this_week, this_month, by_agent, daily', async () => {
    query.mockResolvedValueOnce(DAILY_ROWS);
    query.mockResolvedValueOnce(BY_AGENT_ROWS);
    const res = await request(app).get('/api/cost');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('today');
    expect(res.body).toHaveProperty('this_week');
    expect(res.body).toHaveProperty('this_month');
    expect(Array.isArray(res.body.by_agent)).toBe(true);
    expect(Array.isArray(res.body.daily)).toBe(true);
  });

  it('cost totals have a numeric total field', async () => {
    query.mockResolvedValueOnce(DAILY_ROWS);
    query.mockResolvedValueOnce(BY_AGENT_ROWS);
    const res = await request(app).get('/api/cost');
    expect(typeof res.body.today.total).toBe('number');
    expect(typeof res.body.this_week.total).toBe('number');
    expect(typeof res.body.this_month.total).toBe('number');
  });

  it('by_agent entries have agent, cost, calls, percentage', async () => {
    query.mockResolvedValueOnce(DAILY_ROWS);
    query.mockResolvedValueOnce(BY_AGENT_ROWS);
    const res = await request(app).get('/api/cost');
    for (const a of res.body.by_agent) {
      expect(a).toHaveProperty('agent');
      expect(typeof a.cost).toBe('number');
      expect(typeof a.calls).toBe('number');
      expect(typeof a.percentage).toBe('number');
    }
  });

  it('returns zero totals when Log Analytics has no data', async () => {
    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/cost');
    expect(res.status).toBe(200);
    expect(res.body.today.total).toBe(0);
    expect(res.body.this_month.total).toBe(0);
    expect(res.body.by_agent).toEqual([]);
    expect(res.body.daily).toEqual([]);
  });
});

describe('GET /api/tools', () => {
  it('returns all tools when no agent filter', async () => {
    query.mockResolvedValueOnce(TOOLS_ROWS);
    const res = await request(app).get('/api/tools');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  it('each tool has required fields', async () => {
    query.mockResolvedValueOnce(TOOLS_ROWS);
    const res = await request(app).get('/api/tools');
    for (const t of res.body) {
      expect(t).toHaveProperty('tool');
      expect(t).toHaveProperty('agent');
      expect(typeof t.calls).toBe('number');
      expect(typeof t.errors).toBe('number');
    }
  });

  it('filters by agent query param', async () => {
    query.mockResolvedValueOnce(TOOLS_ROWS);
    const res = await request(app).get('/api/tools?agent=code-reviewer');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].agent).toBe('code-reviewer');
  });

  it('returns empty array for unknown agent', async () => {
    query.mockResolvedValueOnce(TOOLS_ROWS);
    const res = await request(app).get('/api/tools?agent=nonexistent');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/config', () => {
  it('returns allowlists and env', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.allowlists)).toBe(true);
    expect(typeof res.body.env).toBe('object');
  });

  it('allowlists cover all 5 agent types', async () => {
    const res = await request(app).get('/api/config');
    const agents = res.body.allowlists.map(a => a.agent);
    expect(agents).toContain('code-reviewer');
    expect(agents).toContain('code-explorer');
    expect(agents).toContain('pr-crafter');
    expect(agents).toContain('ticket-analyst');
    expect(agents).toContain('security-auditor');
  });

  it('each allowlist entry has agent and non-empty tools array', async () => {
    const res = await request(app).get('/api/config');
    for (const a of res.body.allowlists) {
      expect(a).toHaveProperty('agent');
      expect(Array.isArray(a.tools)).toBe(true);
      expect(a.tools.length).toBeGreaterThan(0);
    }
  });
});
