const { Router } = require('express');
const { query } = require('../clients/loganalytics');

const router = Router();

const COST_PER_HOUR = 0.06;

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

const round2 = n => Math.round(n * 100) / 100;

router.get('/', async (_req, res) => {
  try {
    const [daily, byAgent] = await Promise.all([
      query(DAILY_KQL,    'P7D',  MOCK_DAILY),
      query(BY_AGENT_KQL, 'P30D', MOCK_BY_AGENT),
    ]);

    const today     = daily.at(-1)?.daily_cost ?? 0;
    const totalWeek = daily.slice(-7).reduce((s, r) => s + (r.daily_cost ?? 0), 0);
    const totalMonth= byAgent.reduce((s, r) => s + (r.cost ?? 0), 0);
    const totalForPct = totalMonth || 1;

    res.json({
      today:      { total: round2(today),      currency: 'USD', note: 'estimated compute cost' },
      this_week:  { total: round2(totalWeek),  currency: 'USD', note: 'estimated compute cost' },
      this_month: { total: round2(totalMonth), currency: 'USD', note: 'estimated compute cost' },
      by_agent: byAgent.map(r => ({
        agent:      r.agent,
        cost:       round2(r.cost  ?? 0),
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
  { agent: 'code-reviewer',    cost: 12.45, calls: 89  },
  { agent: 'pr-crafter',       cost:  8.92, calls: 52  },
  { agent: 'ticket-analyst',   cost:  5.67, calls: 45  },
  { agent: 'code-explorer',    cost:  4.10, calls: 156 },
  { agent: 'security-auditor', cost:  3.58, calls: 5   },
];

module.exports = router;
