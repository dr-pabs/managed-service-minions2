import React from 'react';

const TABS = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'live', label: 'Live' },
  { key: 'tools', label: 'Tool Calls' },
  { key: 'cost', label: 'Cost' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'config', label: 'Config' },
];

export default function NavBar({ active, onSelect }) {
  return (
    <nav style={{
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      padding: '0 24px',
      display: 'flex',
      gap: '0'
    }}>
      {TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => onSelect(tab.key)}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: active === tab.key ? '2px solid var(--blue)' : '2px solid transparent',
            color: active === tab.key ? 'var(--text)' : 'var(--text-muted)',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: active === tab.key ? 600 : 400,
            cursor: 'pointer',
            transition: 'color 0.15s, border-color 0.15s'
          }}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
