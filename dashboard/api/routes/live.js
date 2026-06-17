const { Router } = require('express');
const { query } = require('../clients/loganalytics');
const gooseWs = require('../clients/websocket');

const router = Router();

const RECENT_KQL = `
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where isnotempty(tostring(entry.correlation_id))
| summarize last_ts=max(TimeGenerated), calls=count() by corr_id=tostring(entry.correlation_id), agent=tostring(entry.agent)
| project minion=agent, status='completed', ts=format_datetime(last_ts, 'HH:mm:ss')
| order by ts desc
| take 10
`;

const STATS_KQL = `
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1d)
| where ContainerName_s == "toolshed"
| extend entry = parse_json(Log_s)
| where isnotempty(tostring(entry.correlation_id))
| summarize completed_today=dcount(tostring(entry.correlation_id)),
    failed_today=countif(tostring(entry.result) != "success"),
    avg_duration_ms=avg(toint(entry.duration_ms))
`;

async function getLiveData() {
  const [recent, stats] = await Promise.all([
    query(RECENT_KQL, 'PT1H'),
    query(STATS_KQL,  'P1D'),
  ]);
  const s = stats[0] ?? { completed_today: 0, failed_today: 0, avg_duration_ms: 0 };
  const ms = s.avg_duration_ms ?? 72000;
  const avgFmt = ms >= 60000
    ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
    : `${Math.round(ms / 1000)}s`;

  return {
    active: gooseWs.getActive(),
    recent,
    stats: {
      active:          gooseWs.getActive().length,
      completed_today: s.completed_today ?? 0,
      failed_today:    s.failed_today    ?? 0,
      avg_duration:    avgFmt,
    },
  };
}

router.get('/', async (_req, res) => {
  try { res.json(await getLiveData()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();

  getLiveData().then(d => res.write(`data: ${JSON.stringify(d)}\n\n`));

  const unsubWs = gooseWs.subscribe(() => {
    getLiveData().then(d => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(d)}\n\n`); });
  });

  const poll = setInterval(() => {
    if (res.writableEnded) { clearInterval(poll); return; }
    getLiveData().then(d => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(d)}\n\n`); });
  }, 10000);

  req.on('close', () => { clearInterval(poll); unsubWs(); });
});

module.exports = router;
