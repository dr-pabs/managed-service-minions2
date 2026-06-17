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
    let rows = await query(TOOLS_KQL, 'P1D');
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

module.exports = router;
