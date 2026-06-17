const { LogsQueryClient } = require('@azure/monitor-query');
const { DefaultAzureCredential } = require('@azure/identity');

let _client = null;

function getClient() {
  if (!_client) {
    _client = new LogsQueryClient(new DefaultAzureCredential());
  }
  return _client;
}

const WORKSPACE_ID = process.env.LOG_ANALYTICS_WORKSPACE_ID || '';

async function query(kql, timespan) {
  if (!WORKSPACE_ID) return [];
  const result = await getClient().queryWorkspace(WORKSPACE_ID, kql, { duration: timespan });
  if (result.status !== 'Success' || !result.tables?.length) return [];
  const table = result.tables[0];
  return table.rows.map(row =>
    Object.fromEntries(table.columns.map((col, i) => [col.name, row[i]]))
  );
}

module.exports = { query };
