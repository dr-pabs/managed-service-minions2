'use strict';

// LA_MOCK=true is set by the test runner — all routes return hardcoded mock data.
process.env.LA_MOCK = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../server');

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('GET /api/sessions', () => {
  it('returns an array of sessions', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('each session has required fields', async () => {
    const res = await request(app).get('/api/sessions');
    for (const s of res.body) {
      expect(s).toHaveProperty('corr_id');
      expect(s).toHaveProperty('channel');
      expect(s).toHaveProperty('user');
      expect(s).toHaveProperty('status');
      expect(s).toHaveProperty('ts');
    }
  });
});

describe('GET /api/sessions/:corrId/tree', () => {
  it('returns a correlation tree', async () => {
    const res = await request(app).get('/api/sessions/corr_a1b2c3d4/tree');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('correlation_id', 'corr_a1b2c3d4');
    expect(Array.isArray(res.body.minions)).toBe(true);
    expect(res.body.minions.length).toBeGreaterThan(0);
  });

  it('each minion has id, type, and tool_calls', async () => {
    const res = await request(app).get('/api/sessions/corr_a1b2c3d4/tree');
    for (const m of res.body.minions) {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('type');
      expect(Array.isArray(m.tool_calls)).toBe(true);
    }
  });

  it('strips injection characters from corrId', async () => {
    const res = await request(app).get("/api/sessions/corr_x1';DROP/tree");
    expect(res.status).toBe(200);
    expect(res.body.correlation_id).not.toMatch(/['"]/);
  });
});

describe('GET /api/live', () => {
  it('returns active, recent, and stats', async () => {
    const res = await request(app).get('/api/live');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('active');
    expect(res.body).toHaveProperty('recent');
    expect(res.body).toHaveProperty('stats');
  });

  it('stats has required counters', async () => {
    const res = await request(app).get('/api/live');
    const { stats } = res.body;
    expect(stats).toHaveProperty('active');
    expect(stats).toHaveProperty('completed_today');
    expect(stats).toHaveProperty('failed_today');
    expect(stats).toHaveProperty('avg_duration');
  });

  it('recent entries have minion and status', async () => {
    const res = await request(app).get('/api/live');
    for (const r of res.body.recent) {
      expect(r).toHaveProperty('minion');
      expect(r).toHaveProperty('status');
    }
  });
});

describe('GET /api/cost', () => {
  it('returns today, this_week, this_month, by_agent, daily', async () => {
    const res = await request(app).get('/api/cost');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('today');
    expect(res.body).toHaveProperty('this_week');
    expect(res.body).toHaveProperty('this_month');
    expect(Array.isArray(res.body.by_agent)).toBe(true);
    expect(Array.isArray(res.body.daily)).toBe(true);
  });

  it('cost totals have a numeric total field', async () => {
    const res = await request(app).get('/api/cost');
    expect(typeof res.body.today.total).toBe('number');
    expect(typeof res.body.this_week.total).toBe('number');
    expect(typeof res.body.this_month.total).toBe('number');
  });

  it('by_agent entries have agent, cost, calls, percentage', async () => {
    const res = await request(app).get('/api/cost');
    for (const a of res.body.by_agent) {
      expect(a).toHaveProperty('agent');
      expect(typeof a.cost).toBe('number');
      expect(typeof a.calls).toBe('number');
      expect(typeof a.percentage).toBe('number');
    }
  });
});

describe('GET /api/tools', () => {
  it('returns all tools when no agent filter', async () => {
    const res = await request(app).get('/api/tools');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('each tool has required fields', async () => {
    const res = await request(app).get('/api/tools');
    for (const t of res.body) {
      expect(t).toHaveProperty('tool');
      expect(t).toHaveProperty('agent');
      expect(typeof t.calls).toBe('number');
      expect(typeof t.errors).toBe('number');
    }
  });

  it('filters by agent query param', async () => {
    const res = await request(app).get('/api/tools?agent=code-reviewer');
    expect(res.status).toBe(200);
    for (const t of res.body) {
      expect(t.agent).toBe('code-reviewer');
    }
  });

  it('returns empty array for unknown agent', async () => {
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

  it('allowlists cover all 7 agent types', async () => {
    const res = await request(app).get('/api/config');
    const agents = res.body.allowlists.map(a => a.agent);
    expect(agents).toContain('code-reviewer');
    expect(agents).toContain('code-explorer');
    expect(agents).toContain('pr-crafter');
    expect(agents).toContain('ticket-analyst');
    expect(agents).toContain('security-auditor');
    expect(agents).toContain('code-writer');
    expect(agents).toContain('test-writer');
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
