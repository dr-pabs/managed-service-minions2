import React from 'react';
import { useApi } from '../hooks/useApi';

const statusColor = s =>
  s === 'completed' ? 'var(--green)' : s === 'failed' ? 'var(--red)' : 'var(--yellow)';

export default function CorrelationTree({ session, onBack }) {
  const corrId = session?.corr_id ?? session?.correlation_id ?? '';
  const { data: tree, loading, error } = useApi(
    `/sessions/${encodeURIComponent(corrId)}/tree`,
    [corrId]
  );

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading correlation tree…</p>;
  if (error)   return <p style={{ color: 'var(--red)', padding: '24px' }}>Error: {error}</p>;
  if (!tree)   return null;

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
        {session?.channel} · {session?.user}
        {session?.ts ? ` · ${new Date(session.ts).toLocaleString()}` : ''}
      </p>

      <div style={{ borderLeft: '2px solid var(--blue)', paddingLeft: '20px', marginBottom: '0' }}>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '12px 16px', marginBottom: '12px', display: 'inline-block'
        }}>
          <span style={{ fontWeight: 600 }}>📋 Orchestrator</span>
          <span style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
            {tree.minions.length} minions · completed
          </span>
        </div>

        {(tree.minions ?? []).map((minion, i) => (
          <div key={minion.id} style={{
            borderLeft: i < tree.minions.length - 1 ? '2px solid var(--border)' : 'none',
            paddingLeft: '24px', paddingBottom: '8px'
          }}>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '10px 14px', marginBottom: '6px',
              display: 'flex', alignItems: 'center', gap: '12px'
            }}>
              <span style={{ color: statusColor(minion.status ?? 'completed'), fontWeight: 600 }}>
                {(minion.status ?? 'completed') === 'completed' ? '✅' : (minion.status === 'failed' ? '❌' : '🔄')}
              </span>
              <code style={{ color: 'var(--blue)', fontSize: '12px' }}>{minion.id}</code>
              <span style={{ fontSize: '13px', fontWeight: 500 }}>{minion.type}</span>
            </div>

            {(minion.tool_calls ?? []).map((call, j) => (
              <div key={j} style={{
                borderLeft: '2px solid var(--border)', marginLeft: '12px',
                paddingLeft: '16px', paddingBottom: '4px'
              }}>
                <div style={{
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: '6px', padding: '8px 12px',
                  display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                  <span style={{ color: call.status === 'success' ? 'var(--green)' : 'var(--red)', fontSize: '11px' }}>
                    {call.status === 'success' ? '✓' : '✗'}
                  </span>
                  <code style={{ fontSize: '12px', color: 'var(--purple)' }}>{call.tool}</code>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{call.duration}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {JSON.stringify(call.params ?? {}).slice(0, 50)}
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
