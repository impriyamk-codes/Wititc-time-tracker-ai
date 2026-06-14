import React from 'react';

const NAV_ITEMS = [
  { key: 'timeline',  label: 'Timeline',  icon: '⏱' },
  { key: 'timesheet', label: 'Timesheet', icon: '📊' },
  { key: 'projects',  label: 'Projects',  icon: '📁' },
  { key: 'settings',  label: 'Settings',  icon: '⚙️' },
];

export default function Sidebar({ page, setPage, isTracking, onToggleTracking }) {
  return (
    <aside style={styles.sidebar}>
      {/* Logo */}
      <div style={styles.logo}>
        <div style={styles.logoIcon}>⏰</div>
        <div>
          <div style={styles.logoName}>Time Tracker</div>
          <div style={styles.logoSub}>AI</div>
        </div>
      </div>

      {/* Tracking status pill */}
      <button
        onClick={onToggleTracking}
        style={{
          ...styles.trackingBtn,
          background: isTracking ? 'rgba(34,197,94,0.12)' : 'rgba(99,102,241,0.12)',
          borderColor: isTracking ? 'rgba(34,197,94,0.35)' : 'rgba(99,102,241,0.35)',
          color: isTracking ? '#22c55e' : '#6366f1',
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isTracking ? '#22c55e' : '#6366f1',
          display: 'inline-block',
          boxShadow: isTracking ? '0 0 6px #22c55e' : 'none',
          animation: isTracking ? 'pulse 2s infinite' : 'none',
        }} />
        {isTracking ? 'Tracking' : 'Paused'}
      </button>

      {/* Nav */}
      <nav style={styles.nav}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            onClick={() => setPage(item.key)}
            style={{
              ...styles.navItem,
              background: page === item.key ? 'rgba(99,102,241,0.12)' : 'transparent',
              color: page === item.key ? '#6366f1' : '#94a3b8',
              borderLeft: page === item.key ? '3px solid #6366f1' : '3px solid transparent',
            }}
          >
            <span style={styles.navIcon}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={{ fontSize: 11, color: '#4b5563' }}>v1.0.0 · Local only</div>
        <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>No cloud sync</div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: 210,
    minWidth: 210,
    background: '#1a1d27',
    borderRight: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 0',
    gap: 4,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 18px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    marginBottom: 12,
  },
  logoIcon: { fontSize: 26 },
  logoName: { fontSize: 15, fontWeight: 700, color: '#e2e8f0', lineHeight: 1 },
  logoSub:  { fontSize: 11, color: '#6366f1', fontWeight: 600, letterSpacing: 2 },
  trackingBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    margin: '0 14px 16px',
    padding: '7px 12px',
    borderRadius: 8,
    border: '1px solid',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    transition: 'all 0.18s',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    padding: '0 10px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    transition: 'all 0.15s',
    textAlign: 'left',
    width: '100%',
  },
  navIcon: { fontSize: 16, lineHeight: 1 },
  footer: {
    padding: '16px 18px 4px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    marginTop: 'auto',
  },
};