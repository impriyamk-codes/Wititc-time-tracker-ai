import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Timeline from './components/Timeline.jsx';
import Timesheet from './components/Timesheet.jsx';
import Projects from './components/Projects.jsx';
import Settings from './components/Settings.jsx';

// ── Toast context ─────────────────────────────────────────────────────────────
export const ToastContext = React.createContext(null);

function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}

// ── API availability check ────────────────────────────────────────────────────
// In dev (browser), window.timeTracker doesn't exist. Provide a mock so the UI loads.
function ensureApi() {
  if (window.timeTracker) return;
  console.warn('[App] Running outside Electron — using mock API');
  window.timeTracker = {
    getActivitiesByDate: async () => [],
    addActivity: async (a) => ({ id: Date.now(), ...a }),
    updateActivity: async (id, a) => ({ id, ...a }),
    deleteActivity: async () => ({ success: true }),
    splitActivity: async () => ({}),
    mergeActivities: async () => ({}),
    getProjects: async () => [],
    addProject: async (p) => ({ id: Date.now(), ...p }),
    updateProject: async (id, p) => ({ id, ...p }),
    deleteProject: async () => ({ success: true }),
    getTimesheet: async () => ({ rows: [], grouped: [], total_seconds: 0 }),
    exportCSV: async () => ({ canceled: true }),
    copyToClipboard: async () => ({ success: true }),
    backupDatabase: async () => ({ canceled: true }),
    restoreDatabase: async () => ({ canceled: true }),
    getSettings: async () => ({ tracking_interval: '5', idle_timeout: '300', minimize_to_tray: 'true' }),
    updateSetting: async (k, v) => ({ key: k, value: v }),
    getPrivacyRules: async () => [],
    addPrivacyRule: async (r) => ({ id: Date.now(), ...r }),
    deletePrivacyRule: async () => ({ success: true }),
    startTracking: async () => ({ status: 'started' }),
    stopTracking: async () => ({ status: 'stopped' }),
    getTrackingStatus: async () => ({ isTracking: false }),
    onTrackingStatusChanged: () => {},
    removeTrackingStatusListener: () => {},
  };
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  ensureApi();

  const [page, setPage] = useState('timeline');
  const [toasts, setToasts] = useState([]);
  const [trackingStatus, setTrackingStatus] = useState({ isTracking: false });
  const [projects, setProjects] = useState([]);

  // ── Toast helper ──────────────────────────────────────────────────────
  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────
  useEffect(() => {
    window.timeTracker.getTrackingStatus().then(setTrackingStatus).catch(console.error);
    window.timeTracker.getProjects().then(setProjects).catch(console.error);

    // Listen for tracking status changes pushed from tray/main
    window.timeTracker.onTrackingStatusChanged((status) => {
      setTrackingStatus(status);
    });

    return () => window.timeTracker.removeTrackingStatusListener();
  }, []);

  // ── Tracking toggle ───────────────────────────────────────────────────
  const toggleTracking = useCallback(async () => {
    try {
      if (trackingStatus.isTracking) {
        await window.timeTracker.stopTracking();
        setTrackingStatus(prev => ({ ...prev, isTracking: false }));
        showToast('Tracking paused', 'info');
      } else {
        await window.timeTracker.startTracking();
        setTrackingStatus(prev => ({ ...prev, isTracking: true }));
        showToast('Tracking started', 'success');
      }
    } catch (err) {
      showToast('Failed to toggle tracking: ' + err.message, 'error');
    }
  }, [trackingStatus.isTracking, showToast]);

  // ── Project reload helper ─────────────────────────────────────────────
  const reloadProjects = useCallback(async () => {
    const p = await window.timeTracker.getProjects();
    setProjects(p);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <ToastContext.Provider value={showToast}>
      <div className="app-layout">
        <Sidebar
          page={page}
          setPage={setPage}
          isTracking={trackingStatus.isTracking}
          onToggleTracking={toggleTracking}
        />

        <main className="main-content">
          {page === 'timeline' && (
            <Timeline
              projects={projects}
              isTracking={trackingStatus.isTracking}
              onToggleTracking={toggleTracking}
              showToast={showToast}
            />
          )}
          {page === 'timesheet' && (
            <Timesheet projects={projects} showToast={showToast} />
          )}
          {page === 'projects' && (
            <Projects
              projects={projects}
              onReload={reloadProjects}
              showToast={showToast}
            />
          )}
          {page === 'settings' && (
            <Settings showToast={showToast} />
          )}
        </main>
      </div>

      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}