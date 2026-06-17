import React, { useState } from 'react';
import { useApi } from '../hooks/useApi';

const INTENTS  = ['All', 'code_review', 'ticket_lookup', 'ticket_fix_pr', 'security_audit', 'code_explore', 'daily_review'];
const CHANNELS = ['All', 'slack', 'teams', 'cron'];
const STATUSES = ['completed', 'active', 'failed'];

export default function SessionExplorer({ onSessionClick }) {
  const [channelFilter, setChannelFilter] = useState('All');
  const [statusFilters, setStatusFilters] = useState(new Set(['completed', 'failed', 'active']));
  const { data: sessions, loading, error } = useApi('/sessions');

  const toggleStatus = s => {
    const next = new Set(statusFilters);
    if (next.has(s)) next.delete(s); else next.add(s);
    setStatusFilters(next);
  };

  const filtered = (sessions ?? []).filter(s =>
    (channelFilter === 'All' || s.channel === channelFilter) &&
    statusFilters.has(s.status)
  );

  const pill = (label, active, onClick) => (
    <button key={label} onClick={onClick} style={{
      background: active ? 'var(--blue)' : 'var(--bg)',
      color: active ? '#fff' : 'var(--text)',
      border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
      borderRadius: '14px', padding: '3px 12px', fontSize: '12px',
      cursor: 'pointer', marginRight: '6px', marginBottom: '6px'
    }}>{label}</button>
  );

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading sessions…</p>;
  if (error)   return <p style={{ color: 'var(--red)', padding: '24px' }}>Error: {error}</p>;

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Sessions</h2>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '12px' }}>Channel:</span>
          {CHANNELS.map(c => pill(c, channelFilter === c, () => setChannelFilter(c)))}
        </div>
        <div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '12px' }}>Status:</span>
          {STATUSES.map(s => pill(s, statusFilters.has(s), () => toggleStatus(s)))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        {filtered.map(session => (
          <div
            key={session.corr_id}
            onClick={() => onSessionClick(session)}
            style={{
              background: session.status === 'failed' ? '#2d1215' : 'var(--bg-card)',
              padding: '14px 18px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = session.status === 'failed' ? '#2d1215' : 'var(--bg-card)'}
          >
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              <code style={{ color: 'var(--blue)', fontSize: '13px', fontFamily: 'monospace' }}>
                {session.corr_id}
              </code>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {session.channel === 'slack' ? '💬' : session.channel === 'teams' ? '📱' : '⏰'} {session.channel}
              </span>
              <span style={{ fontSize: '13px' }}>{session.user}</span>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {session.ts ? new Date(session.ts).toLocaleString() : '—'}
              </span>
              <span style={{
                fontSize: '12px', fontWeight: 600,
                color: session.status === 'completed' ? 'var(--green)' : session.status === 'failed' ? 'var(--red)' : 'var(--yellow)'
              }}>
                {session.status === 'completed' ? '✅' : session.status === 'failed' ? '❌' : '🔄'} {session.status}
              </span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ background: 'var(--bg-card)', padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No sessions match the current filters.
          </div>
        )}
      </div>

      <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
        Showing {filtered.length} of {(sessions ?? []).length} sessions
      </div>
    </div>
  );
}
