/**
 * preload.js
 * Secure bridge between Electron main process and React renderer.
 * Uses contextBridge to expose only the needed APIs.
 * nodeIntegration is OFF — all Node access goes through this bridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Helper: wraps ipcRenderer.invoke for cleaner calls
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('timeTracker', {
  // ── Activities ──────────────────────────────────────────────────────────
  getActivitiesByDate: (date) => invoke('getActivitiesByDate', date),
  addActivity: (activity) => invoke('addActivity', activity),
  updateActivity: (id, activity) => invoke('updateActivity', id, activity),
  deleteActivity: (id) => invoke('deleteActivity', id),
  splitActivity: (id, splitTime) => invoke('splitActivity', id, splitTime),
  mergeActivities: (ids) => invoke('mergeActivities', ids),

  // ── Projects ────────────────────────────────────────────────────────────
  getProjects: () => invoke('getProjects'),
  addProject: (project) => invoke('addProject', project),
  updateProject: (id, project) => invoke('updateProject', id, project),
  deleteProject: (id) => invoke('deleteProject', id),

  // ── Timesheet & Export ──────────────────────────────────────────────────
  getTimesheet: (startDate, endDate) => invoke('getTimesheet', startDate, endDate),
  exportCSV: (startDate, endDate) => invoke('exportCSV', startDate, endDate),
  copyToClipboard: (startDate, endDate) => invoke('copyToClipboard', startDate, endDate),
  backupDatabase: () => invoke('backupDatabase'),
  restoreDatabase: () => invoke('restoreDatabase'),

  // ── Settings ────────────────────────────────────────────────────────────
  getSettings: () => invoke('getSettings'),
  updateSetting: (key, value) => invoke('updateSetting', key, value),

  // ── Privacy Rules ───────────────────────────────────────────────────────
  getPrivacyRules: () => invoke('getPrivacyRules'),
  addPrivacyRule: (rule) => invoke('addPrivacyRule', rule),
  deletePrivacyRule: (id) => invoke('deletePrivacyRule', id),

  // ── Tracker Control ─────────────────────────────────────────────────────
  startTracking: () => invoke('startTracking'),
  stopTracking: () => invoke('stopTracking'),
  getTrackingStatus: () => invoke('getTrackingStatus'),

  // ── Event listener (one-way from main → renderer) ───────────────────────
  onTrackingStatusChanged: (callback) => {
    ipcRenderer.on('tracking-status-changed', (_event, data) => callback(data));
  },
  removeTrackingStatusListener: () => {
    ipcRenderer.removeAllListeners('tracking-status-changed');
  },
});