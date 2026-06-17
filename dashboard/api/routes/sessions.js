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
    const rows = await query(SESSION_LIST_KQL, 'P7D');
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
    const rows = await query(kql, 'P30D');
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

module.exports = router;
