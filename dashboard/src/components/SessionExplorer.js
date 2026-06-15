import React, { useState } from 'react';

// Mock data matching the design spec wireframe
const MOCK_SESSIONS = [
  { corr_id: 'corr_a1b2c3d4', channel: 'teams', user: 'alice', intent: 'ticket_fix_pr', status: 'completed', minions: 4, duration: '52s', ts: '2026-06-06 08:42', retries: 0 },
  { corr_id: 'corr_f7e8d9e0', channel: 'slack', user: 'bob', intent: 'ticket_lookup', status: 'completed', minions: 1, duration: '2s', ts: '2026-06-06 09:15', retries: 0 },
  { corr_id: 'corr_k9m0n1o2', channel: 'cron', user: '—', intent: 'daily_review', status: 'completed', minions: 6, duration: '3m 12s', ts: '2026-06-06 08:00', retries: 0 },
  { corr_id: 'corr_x1y2z3w4', channel: 'teams', user: 'charlie', intent: 'code_review', status: 'failed', minions: 1, duration: '18s', ts: '2026-06-06 10:30', retries: 2 },
  { corr_id: 'corr_p5q6r7s8', channel: 'slack', user: 'diana', intent: 'security_audit', status: 'completed', minions: 1, duration: '1m 45s', ts: '2026-06-06 11:00', retries: 0 },
  { corr_id: 'corr_t9u0v1w2', channel: 'slack', user: 'eric', intent: 'code_explore', status: 'completed', minions: 1, duration: '12s', ts: '2026-06-06 14:20', retries: 0 },
];

const INTENTS = ['All', 'code_review', 'ticket_lookup', 'ticket_fix_pr', 'security_audit', 'code_explore', 'daily_review'];
const CHANNELS = ['All', 'slack', 'teams', 'cron'];
const STATUSES = ['completed', 'active', 'failed'];

export default function SessionExplorer({ onSessionClick }) {
  const [channelFilter, setChannelFilter] = useState('All');
  const [intentFilter, setIntentFilter] = useState('All');
  const [statusFilters, setStatusFilters] = useState(new Set(['completed', 'failed']));

  const toggleStatus = (s) => {
    const next = new Set(statusFilters);
    if (next.has(s)) next.delete(s); else next.add(s);
    setStatusFilters(next);
  };

  const filtered = MOCK_SESSIONS.filter(s => {
    if (channelFilter !== 'All' && s.channel !== channelFilter) return false;
    if (intentFilter !== 'All' && s.intent !== intentFilter) return false;
    if (!statusFilters.has(s.status)) return false;
    return true;
  });

  const pill = (label, active, onClick) => (
    <button key={label} onClick={onClick} style={{
      background: active ? 'var(--blue)' : 'var(--bg)',
      color: active ? '#fff' : 'var(--text)',
      border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
      borderRadius: '14px',
      padding: '3px 12px',
      fontSize: '12px',
      cursor: 'pointer',
      marginRight: '6px',
      marginBottom: '6px'
    }}>{label}</button>
  );

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Sessions</h2>

      {/* Filters */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '12px' }}>Channel:</span>
          {CHANNELS.map(c => pill(c, channelFilter === c, () => setChannelFilter(c)))}
        </div>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '12px' }}>Intent:</span>
          {INTENTS.map(i => pill(i, intentFilter === i, () => setIntentFilter(i)))}
        </div>
        <div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '12px' }}>Status:</span>
          {STATUSES.map(s => pill(s, statusFilters.has(s), () => toggleStatus(s)))}
        </div>
      </div>

      {/* Session list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        {filtered.map(session => (
          <div
            key={session.corr_id}
            onClick={() => onSessionClick(session)}
            style={{
              background: session.status === 'failed' ? '#2d1215' : 'var(--bg-card)',
              padding: '14px 18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = session.status === 'failed' ? '#2d1215' : 'var(--bg-card)'}
          >
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              <code style={{ color: 'var(--blue)', fontSize: '13px', fontFamily: 'monospace' }}>
                {session.corr_id.slice(0, 14)}...
              </code>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {session.channel === 'slack' ? '💬' : session.channel === 'teams' ? '📱' : session.channel === 'cron' ? '⏰' : '•'} {session.channel}
              </span>
              <span style={{ fontSize: '13px' }}>{session.user}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{session.intent}</span>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{session.minions} minions, {session.duration}</span>
              <span style={{
                fontSize: '12px',
                fontWeight: 600,
                color: session.status === 'completed' ? 'var(--green)' : session.status === 'failed' ? 'var(--red)' : 'var(--yellow)'
              }}>
                {session.status === 'completed' ? '✅' : session.status === 'failed' ? '❌' : '🔄'} {session.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
        Showing {filtered.length} of {MOCK_SESSIONS.length} sessions
      </div>
    </div>
  );
}
