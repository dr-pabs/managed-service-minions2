import React from 'react';

const MOCK_TREE = {
  correlation_id: 'corr_a1b2c3d4',
  session: { channel: 'teams', user: 'alice', intent: 'ticket_fix_pr', status: 'completed', ts: '2026-06-06 08:42' },
  minions: [
    {
      id: 'corr_a1b2c3d4.1',
      type: 'ticket-analyst',
      status: 'completed',
      duration: '8s',
      tool_calls: [
        { tool: 'ado.query_work_items', status: 'success', duration: '600ms', params: { ticket_id: 'INC00421' } },
      ]
    },
    {
      id: 'corr_a1b2c3d4.2',
      type: 'code-explorer',
      status: 'completed',
      duration: '12s',
      tool_calls: [
        { tool: 'filesystem.read_file', status: 'success', duration: '200ms', params: { path: 'src/auth.js' } },
        { tool: 'filesystem.read_file', status: 'success', duration: '150ms', params: { path: 'src/login.js' } },
      ]
    },
    {
      id: 'corr_a1b2c3d4.3',
      type: 'pr-crafter',
      status: 'completed',
      duration: '21s',
      tool_calls: [
        { tool: 'github.create_branch', status: 'success', duration: '400ms', params: { name: 'fix/INC00421' } },
        { tool: 'filesystem.write_file', status: 'success', duration: '300ms', params: { path: 'src/auth.js' } },
        { tool: 'github.commit', status: 'success', duration: '500ms', params: { message: 'Fix INC00421' } },
        { tool: 'github.create_pr', status: 'success', duration: '800ms', params: { title: 'Fix INC00421' } },
      ]
    },
    {
      id: 'corr_a1b2c3d4.4',
      type: 'code-reviewer',
      status: 'completed',
      duration: '11s',
      tool_calls: [
        { tool: 'github.get_pr_diff', status: 'success', duration: '500ms', params: { pr_number: 342 } },
        { tool: 'github.create_review_comment', status: 'success', duration: '300ms', params: {} },
      ]
    },
  ]
};

const statusColor = (s) => s === 'completed' ? 'var(--green)' : s === 'failed' ? 'var(--red)' : 'var(--yellow)';

export default function CorrelationTree({ session, onBack }) {
  const tree = session?.correlation_id?.includes('mock') || !session?.correlation_id
    ? MOCK_TREE
    : { ...MOCK_TREE, correlation_id: session.correlation_id };

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer',
        fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px'
      }}>
        ← Back to Sessions
      </button>

      <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>
        Correlation Tree: <code style={{ color: 'var(--blue)' }}>{tree.correlation_id}</code>
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
        {tree.session.channel} · {tree.session.user} · {tree.session.intent} · {tree.session.ts}
      </p>

      {/* Root node */}
      <div style={{
        borderLeft: '2px solid var(--blue)',
        paddingLeft: '20px',
        marginBottom: '0'
      }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '12px',
          display: 'inline-block'
        }}>
          <span style={{ fontWeight: 600 }}>📋 Orchestrator</span>
          <span style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
            intent: {tree.session.intent} · {tree.minions.length} minions · {tree.session.status}
          </span>
        </div>

        {/* Minion nodes — indented tree */}
        {tree.minions.map((minion, i) => (
          <div key={minion.id} style={{
            borderLeft: i < tree.minions.length - 1 ? '2px solid var(--border)' : 'none',
            paddingLeft: '24px',
            paddingBottom: '8px'
          }}>
            {/* Minion header */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ color: statusColor(minion.status), fontWeight: 600 }}>
                {minion.status === 'completed' ? '✅' : minion.status === 'failed' ? '❌' : '🔄'}
              </span>
              <code style={{ color: 'var(--blue)', fontSize: '12px' }}>{minion.id}</code>
              <span style={{ fontSize: '13px', fontWeight: 500 }}>{minion.type}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{minion.duration}</span>
            </div>

            {/* Tool calls */}
            {minion.tool_calls.map((call, j) => (
              <div key={j} style={{
                borderLeft: '2px solid var(--border)',
                marginLeft: '12px',
                paddingLeft: '16px',
                paddingBottom: '4px'
              }}>
                <div style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <span style={{ color: call.status === 'success' ? 'var(--green)' : 'var(--red)', fontSize: '11px' }}>
                    {call.status === 'success' ? '✓' : '✗'}
                  </span>
                  <code style={{ fontSize: '12px', color: 'var(--purple)' }}>{call.tool}</code>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{call.duration}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {JSON.stringify(call.params).slice(0, 50)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
