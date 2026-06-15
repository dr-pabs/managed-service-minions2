import React from 'react';

const MOCK_COST = {
  today: { total: 4.23, currency: 'USD' },
  this_week: { total: 28.50, currency: 'USD' },
  this_month: { total: 134.72, currency: 'USD' },
  by_agent: [
    { agent: 'code-reviewer', cost: 12.45, tokens: 245000, percentage: 35 },
    { agent: 'pr-crafter', cost: 8.92, tokens: 178000, percentage: 25 },
    { agent: 'ticket-analyst', cost: 5.67, tokens: 112000, percentage: 16 },
    { agent: 'code-explorer', cost: 4.10, tokens: 82000, percentage: 12 },
    { agent: 'security-auditor', cost: 3.58, tokens: 71000, percentage: 10 },
  ],
  by_model: [
    { model: 'claude-sonnet-4-6', cost: 18.92, tokens: 378000, percentage: 53 },
    { model: 'gpt-4o', cost: 12.45, tokens: 249000, percentage: 35 },
    { model: 'gpt-4o-mini', cost: 3.35, tokens: 67000, percentage: 12 },
  ],
  daily: [
    { date: 'Jun 09', cost: 5.12 },
    { date: 'Jun 10', cost: 7.89 },
    { date: 'Jun 11', cost: 6.45 },
    { date: 'Jun 12', cost: 3.21 },
    { date: 'Jun 13', cost: 10.55 },
    { date: 'Jun 14', cost: 8.23 },
    { date: 'Jun 15', cost: 4.23 },
  ],
};

const barColor = (pct) => pct > 30 ? 'var(--blue)' : pct > 15 ? 'var(--purple)' : 'var(--green)';

export default function CostDashboard() {
  const maxDay = Math.max(...MOCK_COST.daily.map(d => d.cost));

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Cost Dashboard</h2>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Today', value: `$${MOCK_COST.today.total.toFixed(2)}`, color: 'var(--green)' },
          { label: 'This Week', value: `$${MOCK_COST.this_week.total.toFixed(2)}`, color: 'var(--blue)' },
          { label: 'This Month', value: `$${MOCK_COST.this_month.total.toFixed(2)}`, color: 'var(--purple)' },
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
        {/* Cost by Agent */}
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>By Agent (this month)</h3>
          {MOCK_COST.by_agent.map(a => (
            <div key={a.agent} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                <span>{a.agent}</span>
                <span style={{ color: 'var(--text-muted)' }}>${a.cost.toFixed(2)} · {Math.round(a.tokens / 1000)}k tokens</span>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: '4px', height: '8px' }}>
                <div style={{ background: barColor(a.percentage), borderRadius: '4px', height: '8px', width: `${a.percentage}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Cost by Model */}
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>By Model (this month)</h3>
          {MOCK_COST.by_model.map(m => (
            <div key={m.model} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                <span>{m.model}</span>
                <span style={{ color: 'var(--text-muted)' }}>${m.cost.toFixed(2)} · {Math.round(m.tokens / 1000)}k tokens</span>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: '4px', height: '8px' }}>
                <div style={{ background: barColor(m.percentage), borderRadius: '4px', height: '8px', width: `${m.percentage}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily trend */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>Daily Cost Trend</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '100px' }}>
          {MOCK_COST.daily.map(d => (
            <div key={d.date} style={{ flex: 1, textAlign: 'center' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>${d.cost.toFixed(2)}</span>
              <div style={{
                background: 'var(--blue)',
                height: `${(d.cost / maxDay) * 80}px`,
                borderRadius: '4px 4px 0 0',
                marginTop: '4px',
                minWidth: '20px'
              }} />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>{d.date}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
