const { Router } = require('express');
const { query } = require('../clients/loganalytics');

const router = Router();

const SESSION_LIST_KQL = `
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(7d)
| where ContainerName_s in ("slackbot", "teamsbot")
| extend entry = parse_json(Log_s)
| where tostring(entry.event) in ("session_start", "session_end")
| project event=tostring(entry.event), corr_id=tostring(entry.correlation_id),
    channel=tostring(entry.channel), user=tostring(entry.user),
    status=tostring(entry.status), retries=toint(entry.retries), ts=tostring(entry.ts)
| summarize
    channel=anyif(channel, event=="session_start"),
    user=anyif(user, event=="session_start"),
    ts=anyif(ts, event=="session_start"),
    status=anyif(status, event=="session_end"),
    retries=anyif(retries, event=="session_end")
  by corr_id
| order by ts desc
| take 50
`;

router.get('/', async (_req, res) => {
  try {
    const rows = await query(SESSION_LIST_KQL, 'P7D', MOCK_SESSIONS);
    res.json(rows.map(r => ({
      corr_id:  r.corr_id,
      channel:  r.channel  || 'unknown',
      user:     r.user     || 'unknown',
      status:   r.status   || 'active',
      ts:       r.ts,
      retries:  r.retries ?? 0,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:corrId/tree', async (req, res) => {
  const corrId = req.params.corrId.replace(/['";\n\r]/g, '');
  const kql = `
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(30d)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where tostring(entry.correlation_id) == "${corrId}"
| project ts=tostring(entry.ts), agent=tostring(entry.agent), tool=tostring(entry.tool),
    result=tostring(entry.result), duration_ms=toint(entry.duration_ms), params=tostring(entry.params)
| order by ts asc
`;
  try {
    const rows = await query(kql, 'P30D', MOCK_TREE_ROWS);
    const byAgent = {};
    for (const row of rows) {
      if (!byAgent[row.agent]) {
        byAgent[row.agent] = {
          id: `${corrId}.${Object.keys(byAgent).length + 1}`,
          type: row.agent,
          tool_calls: [],
        };
      }
      byAgent[row.agent].tool_calls.push({
        tool:     row.tool,
        status:   row.result === 'success' ? 'success' : 'error',
        duration: row.duration_ms ? `${row.duration_ms}ms` : 'unknown',
        params:   (() => { try { return JSON.parse(row.params); } catch { return {}; } })(),
      });
    }
    res.json({ correlation_id: corrId, minions: Object.values(byAgent) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const MOCK_SESSIONS = [
  { corr_id: 'corr_a1b2c3d4', channel: 'slack',  user: 'alice', status: 'completed', ts: '2026-06-17T08:42:00.000Z', retries: 0 },
  { corr_id: 'corr_b2c3d4e5', channel: 'teams',  user: 'bob',   status: 'completed', ts: '2026-06-17T08:35:00.000Z', retries: 1 },
  { corr_id: 'corr_c3d4e5f6', channel: 'slack',  user: 'carol', status: 'failed',    ts: '2026-06-17T08:20:00.000Z', retries: 2 },
  { corr_id: 'corr_d4e5f6g7', channel: 'teams',  user: 'dave',  status: 'completed', ts: '2026-06-17T08:10:00.000Z', retries: 0 },
  { corr_id: 'corr_e5f6g7h8', channel: 'cron',   user: 'system',status: 'completed', ts: '2026-06-17T07:00:00.000Z', retries: 0 },
  { corr_id: 'corr_f6g7h8i9', channel: 'slack',  user: 'eve',   status: 'active',    ts: '2026-06-17T10:41:00.000Z', retries: 0 },
];

const MOCK_TREE_ROWS = [
  { ts: '2026-06-17T08:42:01Z', agent: 'ticket-analyst', tool: 'ado.query_work_items',      result: 'success', duration_ms: 600, params: '{"ticket_id":"INC00421"}' },
  { ts: '2026-06-17T08:42:09Z', agent: 'code-explorer',  tool: 'filesystem.read_file',       result: 'success', duration_ms: 200, params: '{"path":"src/auth.js"}' },
  { ts: '2026-06-17T08:42:11Z', agent: 'code-explorer',  tool: 'filesystem.read_file',       result: 'success', duration_ms: 150, params: '{"path":"src/login.js"}' },
  { ts: '2026-06-17T08:42:20Z', agent: 'pr-crafter',     tool: 'github.create_branch',       result: 'success', duration_ms: 400, params: '{"name":"fix/INC00421"}' },
  { ts: '2026-06-17T08:42:24Z', agent: 'pr-crafter',     tool: 'filesystem.write_file',      result: 'success', duration_ms: 300, params: '{"path":"src/auth.js"}' },
  { ts: '2026-06-17T08:42:27Z', agent: 'pr-crafter',     tool: 'github.commit',              result: 'success', duration_ms: 500, params: '{"message":"Fix INC00421"}' },
  { ts: '2026-06-17T08:42:32Z', agent: 'pr-crafter',     tool: 'github.create_pr',           result: 'success', duration_ms: 800, params: '{"title":"Fix INC00421"}' },
  { ts: '2026-06-17T08:42:43Z', agent: 'code-reviewer',  tool: 'github.get_pr_diff',         result: 'success', duration_ms: 500, params: '{"pr_number":342}' },
  { ts: '2026-06-17T08:42:48Z', agent: 'code-reviewer',  tool: 'github.create_review_comment',result: 'success',duration_ms: 300, params: '{}' },
];

module.exports = router;
