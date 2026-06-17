import React from 'react';
import { useApi } from '../hooks/useApi';

export default function PromptManager() {
  const { data: config, loading, error } = useApi('/config');

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading config…</p>;
  if (error)   return <p style={{ color: 'var(--red)', padding: '24px' }}>Error: {error}</p>;
  if (!config) return null;

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Prompt &amp; Config Manager</h2>

      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '8px', padding: '16px', marginBottom: '24px',
        fontSize: '13px', color: 'var(--text-muted)'
      }}>
        📝 Prompt version tracking requires a prompt registry service — coming in Phase 2.
        Agent definitions live in <code>.agents/agents/*.md</code>.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Tool Allowlists</h3>
          {(config.allowlists ?? []).map(a => (
            <div key={a.agent} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>{a.agent}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {a.tools.map(t => (
                  <code key={t} style={{ marginRight: '8px', color: 'var(--purple)' }}>{t}</code>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Environment</h3>
          {Object.entries(config.env ?? {}).length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              No env vars set. Configure via <code>.env</code> file or Container App env.
            </p>
          ) : (
            Object.entries(config.env).map(([key, val]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px', borderBottom: '1px solid var(--border)' }}>
                <code style={{ color: 'var(--green)' }}>{key}</code>
                <span style={{ color: 'var(--text-muted)' }}>{val}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
