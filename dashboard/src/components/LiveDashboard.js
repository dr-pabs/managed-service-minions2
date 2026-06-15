import React from 'react';

const MOCK_LIVE = [
  { corr_id: 'corr_active_1', minion: 'code-reviewer', status: 'running', progress: '2/20 turns', elapsed: '15s', started: '10:42:05' },
  { corr_id: 'corr_active_2', minion: 'pr-crafter', status: 'running', progress: '8/30 turns', elapsed: '45s', started: '10:41:35' },
  { corr_id: 'corr_active_3', minion: 'ticket-analyst', status: 'running', progress: '1/10 turns', elapsed: '3s', started: '10:42:17' },
];

const MOCK_RECENT = [
  { minion: 'code-reviewer', status: 'completed', duration: '1m 12s', ts: '10:40:50' },
  { minion: 'security-auditor', status: 'completed', duration: '2m 05s', ts: '10:38:00' },
  { minion: 'code-explorer', status: 'failed', duration: '18s', ts: '10:37:42' },
  { minion: 'ticket-analyst', status: 'completed', duration: '8s', ts: '10:35:20' },
];

export default function LiveDashboard() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      {/* Active minions */}
      <div>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>
          🟢 Active Minions ({MOCK_LIVE.length})
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {MOCK_LIVE.map(m => (
            <div key={m.corr_id} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '14px 16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600 }}>{m.minion}</span>
                <span style={{ fontSize: '12px', color: 'var(--yellow)' }}>🔄 {m.status}</span>
              </div>
              <div style={{
                height: '4px',
                background: 'var(--bg)',
                borderRadius: '2px',
                marginBottom: '8px'
              }}>
                <div style={{
                  height: '4px',
                  background: 'var(--blue)',
                  borderRadius: '2px',
                  width: `${(parseInt(m.progress) / parseInt(m.progress.split('/')[1])) * 100}%`
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span>{m.progress}</span>
                <span>{m.elapsed}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent completions */}
      <div>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>
          📋 Recent Completions
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {MOCK_RECENT.map((m, i) => (
            <div key={i} style={{
              background: m.status === 'failed' ? '#2d1215' : 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: m.status === 'completed' ? 'var(--green)' : 'var(--red)' }}>
                  {m.status === 'completed' ? '✅' : '❌'}
                </span>
                <span style={{ fontWeight: 500 }}>{m.minion}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.ts}</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.duration}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div style={{
        gridColumn: '1 / -1',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px'
      }}>
        {[
          { label: 'Active Sessions', value: '3', color: 'var(--yellow)' },
          { label: 'Completed Today', value: '127', color: 'var(--green)' },
          { label: 'Failed Today', value: '2', color: 'var(--red)' },
          { label: 'Avg Duration', value: '1m 12s', color: 'var(--blue)' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '16px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: stat.color, marginBottom: '4px' }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
