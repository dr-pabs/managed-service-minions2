// Allowlist mirrors mcp-servers/toolshed/src/allowlist.rs — keep in sync when Rust changes.
const { Router } = require('express');

const router = Router();

const ALLOWLISTS = {
  'code-reviewer':    ['github.get_pr_diff', 'github.create_review_comment', 'github.get_pr_comments'],
  'code-explorer':    ['filesystem.list_directory', 'filesystem.read_file'],
  'pr-crafter':       ['github.create_branch', 'github.commit', 'github.create_pr', 'filesystem.write_file'],
  'ticket-analyst':   ['ado.query_work_items', 'jira.search_issues'],
  'security-auditor': ['filesystem.read_file', 'github.get_advisories'],
  'code-writer':      ['filesystem.read_file', 'filesystem.list_directory', 'filesystem.write_file', 'shell.execute', 'github.get_file_contents', 'github.search_code'],
  'test-writer':      ['filesystem.read_file', 'filesystem.list_directory', 'filesystem.write_file', 'shell.execute', 'github.get_file_contents'],
};

const SAFE_ENV_KEYS = [
  'GOOSE_PROVIDER', 'GOOSE_SERVER_PORT', 'MAX_TURNS_DEFAULT',
  'RETRY_MAX_ATTEMPTS', 'RETRY_BACKOFF_MS', 'RATE_LIMIT_PER_MINION',
  'LOG_LEVEL', 'CORRELATION_ID_PREFIX', 'API_PORT',
];

router.get('/', (_req, res) => {
  const env = {};
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key];
  }
  res.json({
    allowlists: Object.entries(ALLOWLISTS).map(([agent, tools]) => ({ agent, tools })),
    env,
  });
});

module.exports = router;
