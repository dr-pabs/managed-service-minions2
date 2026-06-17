const { Router } = require('express');
const { query } = require('../clients/loganalytics');

const router = Router();

const TOOLS_KQL = `
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1d)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where isnotempty(tostring(entry.tool))
| summarize
    calls=count(), avg_ms=round(avg(toint(entry.duration_ms)), 0),
    errors=countif(tostring(entry.result) != "success"), last_ts=max(TimeGenerated)
  by tool=tostring(entry.tool), agent=tostring(entry.agent)
| order by calls desc
`;

router.get('/', async (req, res) => {
  const { agent } = req.query;
  try {
    let rows = await query(TOOLS_KQL, 'P1D', MOCK_TOOLS);
    if (agent && agent !== 'All') rows = rows.filter(r => r.agent === agent);
    res.json(rows.map(r => ({
      tool:         r.tool,
      agent:        r.agent,
      calls:        r.calls   ?? 0,
      avg_duration: r.avg_ms  ? `${r.avg_ms}ms` : 'unknown',
      errors:       r.errors  ?? 0,
      last: r.last_ts
        ? new Date(r.last_ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—',
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const MOCK_TOOLS = [
  { tool: 'github.get_pr_diff',          agent: 'code-reviewer',    calls: 89,  avg_ms: 450,  errors: 0, last_ts: '2026-06-17T10:42:05Z' },
  { tool: 'github.create_review_comment',agent: 'code-reviewer',    calls: 34,  avg_ms: 300,  errors: 0, last_ts: '2026-06-17T10:40:50Z' },
  { tool: 'github.create_pr',            agent: 'pr-crafter',       calls: 12,  avg_ms: 800,  errors: 1, last_ts: '2026-06-17T10:41:35Z' },
  { tool: 'filesystem.read_file',        agent: 'code-explorer',    calls: 156, avg_ms: 120,  errors: 0, last_ts: '2026-06-17T10:42:17Z' },
  { tool: 'filesystem.write_file',       agent: 'pr-crafter',       calls: 28,  avg_ms: 250,  errors: 0, last_ts: '2026-06-17T10:41:35Z' },
  { tool: 'ado.query_work_items',        agent: 'ticket-analyst',   calls: 45,  avg_ms: 600,  errors: 3, last_ts: '2026-06-17T10:38:20Z' },
  { tool: 'github.commit',               agent: 'pr-crafter',       calls: 12,  avg_ms: 500,  errors: 0, last_ts: '2026-06-17T10:41:35Z' },
  { tool: 'github.get_advisories',       agent: 'security-auditor', calls: 5,   avg_ms: 2000, errors: 0, last_ts: '2026-06-17T10:35:00Z' },
];

module.exports = router;
