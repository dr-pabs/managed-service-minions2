import React from 'react';
import { usePoll } from '../hooks/usePoll';
import { useStream } from '../hooks/useStream';

export default function LiveDashboard() {
  const { data: polled }   = usePoll('/live', 30000);
  const { data: streamed } = useStream('/live/stream');

  const live   = streamed ?? polled;
  const active = live?.active ?? [];
  const recent = live?.recent ?? [];
  const stats  = live?.stats  ?? { active: 0, completed_today: 0, failed_today: 0, avg_duration: '—' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>
          🟢 Active Minions ({active.length})
        </h2>
        {active.length === 0 ? (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '24px', textAlign: 'center',
            color: 'var(--text-muted)', fontSize: '13px'
          }}>
            No active minions — system idle.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {active.map(m => {
              const [cur, max] = (m.progress ?? '0/0').split('/').map(Number);
              const pct = max > 0 ? (cur / max) * 100 : 0;
              return (
                <div key={m.corr_id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '14px 16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600 }}>{m.minion}</span>
                    <span style={{ fontSize: '12px', color: 'var(--yellow)' }}>🔄 {m.status}</span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--bg)', borderRadius: '2px', marginBottom: '8px' }}>
                    <div style={{ height: '4px', background: 'var(--blue)', borderRadius: '2px', width: `${pct}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span>{m.progress}</span>
                    <span>{m.elapsed}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>📋 Recent Completions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {recent.map((m, i) => (
            <div key={i} style={{
              background: m.status === 'failed' ? '#2d1215' : 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: m.status === 'completed' ? 'var(--green)' : 'var(--red)' }}>
                  {m.status === 'completed' ? '✅' : '❌'}
                </span>
                <span style={{ fontWeight: 500 }}>{m.minion}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.ts}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {[
          { label: 'Active Sessions',  value: stats.active,          color: 'var(--yellow)' },
          { label: 'Completed Today',  value: stats.completed_today, color: 'var(--green)'  },
          { label: 'Failed Today',     value: stats.failed_today,    color: 'var(--red)'    },
          { label: 'Avg Duration',     value: stats.avg_duration,    color: 'var(--blue)'   },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '16px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: stat.color, marginBottom: '4px' }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
