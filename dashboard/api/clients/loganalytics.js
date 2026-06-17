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
const MOCK = process.env.LA_MOCK === 'true';

/**
 * Run a KQL query and return rows as plain objects.
 * Falls back to `fallback` when LA_MOCK=true or no workspace ID is configured.
 */
async function query(kql, timespan, fallback = []) {
  if (MOCK || !WORKSPACE_ID) return fallback;
  const result = await getClient().queryWorkspace(WORKSPACE_ID, kql, { duration: timespan });
  if (result.status !== 'Success' || !result.tables?.length) return fallback;
  const table = result.tables[0];
  return table.rows.map(row =>
    Object.fromEntries(table.columns.map((col, i) => [col.name, row[i]]))
  );
}

module.exports = { query };
