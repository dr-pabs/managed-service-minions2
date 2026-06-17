import React, { useState } from 'react';
import { useApi } from '../hooks/useApi';

const AGENTS = ['All', 'code-reviewer', 'code-explorer', 'pr-crafter', 'ticket-analyst', 'security-auditor'];

export default function ToolCallAnalyzer() {
  const [agentFilter, setAgentFilter] = useState('All');
  const { data: tools, loading, error } = useApi(
    `/tools?agent=${encodeURIComponent(agentFilter)}`,
    [agentFilter]
  );

  const filtered = tools ?? [];
  const maxCalls = Math.max(...filtered.map(t => t.calls), 1);

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading tool call data…</p>;
  if (error)   return <p style={{ color: 'var(--red)', padding: '24px' }}>Error: {error}</p>;

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Tool Call Analyzer</h2>

      <div style={{ marginBottom: '20px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '12px' }}>Agent:</span>
        {AGENTS.map(a => (
          <button key={a} onClick={() => setAgentFilter(a)} style={{
            background: agentFilter === a ? 'var(--blue)' : 'var(--bg)',
            color: agentFilter === a ? '#fff' : 'var(--text)',
            border: `1px solid ${agentFilter === a ? 'var(--blue)' : 'var(--border)'}`,
            borderRadius: '14px', padding: '3px 12px', fontSize: '12px', cursor: 'pointer', marginRight: '6px'
          }}>{a}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Calls',  value: filtered.reduce((s, t) => s + t.calls, 0),  color: 'var(--blue)'   },
          { label: 'Unique Tools', value: filtered.length,                              color: 'var(--purple)' },
          { label: 'Errors',       value: filtered.reduce((s, t) => s + t.errors, 0), color: 'var(--red)'    },
          { label: 'Top Tool',     value: filtered[0]?.tool?.split('.')[1] ?? '—',     color: 'var(--green)'  },
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
                borderRadius: '4px', height: '20px', width: `${(tool.calls / maxCalls) * 100}%`,
                transition: 'width 0.3s'
              }} />
              <span style={{ position: 'absolute', left: '8px', top: '1px', fontSize: '11px', color: '#fff' }}>
                {tool.calls} calls
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>{tool.avg_duration}</span>
            <span style={{ fontSize: '12px', color: tool.errors > 0 ? 'var(--red)' : 'var(--green)', textAlign: 'center' }}>
              {tool.errors > 0 ? `${tool.errors} err` : '0'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>{tool.last}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
