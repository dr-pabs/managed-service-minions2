import React from 'react';

const MOCK_PROMPTS = [
  {
    id: 'prompt-001',
    name: 'code-reviewer-v2',
    agent: 'code-reviewer',
    status: 'active',
    version: '2.1.0',
    deployed: '2026-06-12',
    canary: '10%',
    metrics: { accuracy: '94%', latency: '1.2s', cost_per_review: '$0.08' }
  },
  {
    id: 'prompt-002',
    name: 'orchestrator-classifier',
    agent: 'orchestrator',
    status: 'active',
    version: '1.0.0',
    deployed: '2026-06-14',
    canary: '100%',
    metrics: { accuracy: '98%', latency: '0.3s', cost_per_classification: '$0.002' }
  },
  {
    id: 'prompt-003',
    name: 'code-reviewer-v3',
    agent: 'code-reviewer',
    status: 'canary',
    version: '3.0.0-rc1',
    deployed: '2026-06-15',
    canary: '10%',
    metrics: { accuracy: '96%', latency: '1.0s', cost_per_review: '$0.06' }
  },
];

export default function PromptManager() {
  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Prompt & Config Manager</h2>

      {/* Prompt versions */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>
          Prompt Versions
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          {MOCK_PROMPTS.map(p => (
            <div key={p.id} style={{
              background: 'var(--bg-card)', padding: '14px 16px',
              display: 'grid', gridTemplateColumns: '200px 100px 80px 100px 1fr', gap: '16px', alignItems: 'center'
            }}>
              <div>
                <code style={{ fontSize: '13px', color: 'var(--blue)' }}>{p.name}</code>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>v{p.version}</div>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.agent}</span>
              <span style={{
                fontSize: '12px',
                color: p.status === 'active' ? 'var(--green)' : 'var(--yellow)',
                fontWeight: 600
              }}>
                {p.status === 'active' ? '✅ active' : '🔄 canary'}
              </span>
              <div>
                <div style={{ fontSize: '12px' }}>{p.canary} traffic</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>deployed {p.deployed}</div>
              </div>
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', fontSize: '11px', color: 'var(--text-muted)' }}>
                <span>🎯 {p.metrics.accuracy}</span>
                <span>⏱ {p.metrics.latency}</span>
                <span>💰 {p.metrics.cost_per_review}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Config sections */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Allowlist config */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '16px'
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Tool Allowlists</h3>
          {[
            { agent: 'code-reviewer', tools: ['github.get_pr_diff', 'github.create_review_comment'] },
            { agent: 'code-explorer', tools: ['filesystem.list_dir', 'filesystem.read_file'] },
            { agent: 'pr-crafter', tools: ['github.create_branch', 'github.commit', 'github.create_pr'] },
            { agent: 'ticket-analyst', tools: ['ado.query_work_items'] },
            { agent: 'security-auditor', tools: ['filesystem.read_file', 'github.get_advisories'] },
          ].map(a => (
            <div key={a.agent} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>{a.agent}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {a.tools.map(t => <code key={t} style={{ marginRight: '8px', color: 'var(--purple)' }}>{t}</code>)}
              </div>
            </div>
          ))}
        </div>

        {/* Environment config */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '16px'
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Environment</h3>
          {[
            { key: 'GOOSE_PROVIDER', value: 'azure_openai' },
            { key: 'GOOSE_SERVER_PORT', value: '3284' },
            { key: 'MAX_TURNS_DEFAULT', value: '20' },
            { key: 'RETRY_MAX_ATTEMPTS', value: '3' },
            { key: 'RETRY_BACKOFF_MS', value: '2000,4000,8000' },
            { key: 'RATE_LIMIT_PER_MINION', value: '10/min' },
            { key: 'LOG_LEVEL', value: 'info' },
            { key: 'CORRELATION_ID_PREFIX', value: 'corr_dev' },
          ].map(env => (
            <div key={env.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px', borderBottom: '1px solid var(--border)' }}>
              <code style={{ color: 'var(--green)' }}>{env.key}</code>
              <span style={{ color: 'var(--text-muted)' }}>{env.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
