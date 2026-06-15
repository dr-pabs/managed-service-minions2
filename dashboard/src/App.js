import React, { useState } from 'react';
import NavBar from './components/NavBar';
import SessionExplorer from './components/SessionExplorer';
import CorrelationTree from './components/CorrelationTree';
import LiveDashboard from './components/LiveDashboard';
import ToolCallAnalyzer from './components/ToolCallAnalyzer';
import CostDashboard from './components/CostDashboard';
import PromptManager from './components/PromptManager';

const VIEWS = {
  sessions: SessionExplorer,
  live: LiveDashboard,
  tools: ToolCallAnalyzer,
  cost: CostDashboard,
  prompts: PromptManager,
  config: PromptManager,
};

export default function App() {
  const [activeView, setActiveView] = useState('sessions');
  const [corrId, setCorrId] = useState('');
  const [treeSession, setTreeSession] = useState(null);

  const handleSessionClick = (session) => {
    setTreeSession(session);
    setActiveView('tree');
  };

  const handleCorrSearch = (e) => {
    e.preventDefault();
    if (corrId.trim()) {
      setTreeSession({ correlation_id: corrId.trim() });
      setActiveView('tree');
    }
  };

  const ActiveComponent = activeView === 'tree' ? CorrelationTree : (VIEWS[activeView] || SessionExplorer);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--blue)' }}>
          Goose Agent Framework
        </h1>

        {/* Correlation ID search */}
        <form onSubmit={handleCorrSearch} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="corr_..."
            value={corrId}
            onChange={(e) => setCorrId(e.target.value)}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text)',
              padding: '6px 12px',
              fontSize: '13px',
              width: '280px'
            }}
          />
          <button type="submit" style={{
            background: 'var(--blue)',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 14px',
            fontSize: '13px',
            cursor: 'pointer'
          }}>
            View
          </button>
        </form>
      </header>

      {/* Nav tabs */}
      {activeView !== 'tree' && (
        <NavBar active={activeView} onSelect={setActiveView} />
      )}

      {/* Active view */}
      <main style={{ flex: 1, padding: '20px 24px', overflow: 'auto' }}>
        <ActiveComponent session={treeSession} onBack={() => setActiveView('sessions')} onSessionClick={handleSessionClick} />
      </main>

      {/* Footer */}
      <footer style={{
        background: 'var(--bg-card)',
        borderTop: '1px solid var(--border)',
        padding: '8px 24px',
        fontSize: '12px',
        color: 'var(--text-muted)',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>Goose Agent Framework v0.1.0</span>
        <span>Connected: goose serve — localhost:3284</span>
      </footer>
    </div>
  );
}
