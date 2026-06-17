import React from 'react';
import { useApi } from '../hooks/useApi';

const barColor = pct => pct > 30 ? 'var(--blue)' : pct > 15 ? 'var(--purple)' : 'var(--green)';

export default function CostDashboard() {
  const { data: cost, loading, error } = useApi('/cost');

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading cost data…</p>;
  if (error)   return <p style={{ color: 'var(--red)', padding: '24px' }}>Error: {error}</p>;
  if (!cost)   return null;

  const maxDay = Math.max(...(cost.daily ?? []).map(d => d.cost), 1);

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '4px' }}>Cost Dashboard</h2>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Estimated compute cost (duration × $0.06/hr) — not actual LLM token cost
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Today',      value: `$${cost.today?.total?.toFixed(2) ?? '0.00'}`,      color: 'var(--green)'  },
          { label: 'This Week',  value: `$${cost.this_week?.total?.toFixed(2) ?? '0.00'}`,  color: 'var(--blue)'   },
          { label: 'This Month', value: `$${cost.this_month?.total?.toFixed(2) ?? '0.00'}`, color: 'var(--purple)' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '16px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>By Agent (this month)</h3>
          {(cost.by_agent ?? []).map(a => (
            <div key={a.agent} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                <span>{a.agent}</span>
                <span style={{ color: 'var(--text-muted)' }}>${a.cost?.toFixed(2) ?? '0.00'} · {a.calls} calls</span>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: '4px', height: '8px' }}>
                <div style={{ background: barColor(a.percentage), borderRadius: '4px', height: '8px', width: `${a.percentage}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
        </div>

        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>Daily Cost Trend</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '100px' }}>
            {(cost.daily ?? []).map(d => (
              <div key={d.date} style={{ flex: 1, textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>${d.cost?.toFixed(2) ?? '0.00'}</span>
                <div style={{
                  background: 'var(--blue)', height: `${(d.cost / maxDay) * 80}px`,
                  borderRadius: '4px 4px 0 0', marginTop: '4px', minWidth: '20px'
                }} />
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>{d.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
