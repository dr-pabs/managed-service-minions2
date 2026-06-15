import React, { useState } from 'react';

const MOCK_TOOLS = [
  { tool: 'github.get_pr_diff', agent: 'code-reviewer', calls: 89, avg_duration: '450ms', errors: 0, last: '10:42:05' },
  { tool: 'github.create_review_comment', agent: 'code-reviewer', calls: 34, avg_duration: '300ms', errors: 0, last: '10:40:50' },
  { tool: 'github.create_pr', agent: 'pr-crafter', calls: 12, avg_duration: '800ms', errors: 1, last: '10:41:35' },
  { tool: 'filesystem.read_file', agent: 'code-explorer', calls: 156, avg_duration: '120ms', errors: 0, last: '10:42:17' },
  { tool: 'filesystem.write_file', agent: 'pr-crafter', calls: 28, avg_duration: '250ms', errors: 0, last: '10:41:35' },
  { tool: 'ado.query_work_items', agent: 'ticket-analyst', calls: 45, avg_duration: '600ms', errors: 3, last: '10:38:20' },
  { tool: 'github.commit', agent: 'pr-crafter', calls: 12, avg_duration: '500ms', errors: 0, last: '10:41:35' },
  { tool: 'github.get_advisories', agent: 'security-auditor', calls: 5, avg_duration: '2s', errors: 0, last: '10:35:00' },
];

const AGENTS = ['All', 'code-reviewer', 'code-explorer', 'pr-crafter', 'ticket-analyst', 'security-auditor'];

const barWidth = (calls, max) => `${(calls / max) * 100}%`;

export default function ToolCallAnalyzer() {
  const [agentFilter, setAgentFilter] = useState('All');
  const maxCalls = Math.max(...MOCK_TOOLS.map(t => t.calls));

  const filtered = MOCK_TOOLS.filter(t => agentFilter === 'All' || t.agent === agentFilter);

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Tool Call Analyzer</h2>

      {/* Agent filter */}
      <div style={{ marginBottom: '20px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '12px' }}>Agent:</span>
        {AGENTS.map(a => (
          <button key={a} onClick={() => setAgentFilter(a)} style={{
            background: agentFilter === a ? 'var(--blue)' : 'var(--bg)',
            color: agentFilter === a ? '#fff' : 'var(--text)',
            border: `1px solid ${agentFilter === a ? 'var(--blue)' : 'var(--border)'}`,
            borderRadius: '14px',
            padding: '3px 12px',
            fontSize: '12px',
            cursor: 'pointer',
            marginRight: '6px'
          }}>{a}</button>
        ))}
      </div>

      {/* Summary stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px'
      }}>
        {[
          { label: 'Total Calls', value: filtered.reduce((s, t) => s + t.calls, 0), color: 'var(--blue)' },
          { label: 'Unique Tools', value: filtered.length, color: 'var(--purple)' },
          { label: 'Errors', value: filtered.reduce((s, t) => s + t.errors, 0), color: 'var(--red)' },
          { label: 'P50 Latency', value: '320ms', color: 'var(--green)' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '14px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tool list with bar chart */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        {filtered.map(tool => (
          <div key={tool.tool} style={{
            background: 'var(--bg-card)', padding: '12px 16px',
            display: 'grid', gridTemplateColumns: '200px 1fr 120px 80px 80px', alignItems: 'center', gap: '16px'
          }}>
            <div>
              <code style={{ fontSize: '13px', color: 'var(--purple)' }}>{tool.tool}</code>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{tool.agent}</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: '4px', height: '20px', position: 'relative' }}>
              <div style={{
                background: tool.errors > 0 ? 'var(--yellow)' : 'var(--blue)',
                borderRadius: '4px', height: '20px', width: barWidth(tool.calls, maxCalls),
                transition: 'width 0.3s'
              }} />
              <span style={{ position: 'absolute', left: '8px', top: '1px', fontSize: '11px', color: '#fff' }}>
                {tool.calls} calls
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>{tool.avg_duration}</span>
            <span style={{
              fontSize: '12px', color: tool.errors > 0 ? 'var(--red)' : 'var(--green)', textAlign: 'center'
            }}>
              {tool.errors > 0 ? `${tool.errors} err` : '0'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>{tool.last}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
