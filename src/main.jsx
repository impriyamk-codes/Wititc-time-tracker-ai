/**
 * main.js
 * Electron main process entry point.
 * Sets up the BrowserWindow, IPC handlers, tray, and database.
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  session,
} = require('electron');
const path = require('path');

const db = require('./database');
const tracker = require('./tracker');
const exporter = require('./exporter');
const tray = require('./tray');

// Keep a global reference to mainWindow to prevent garbage collection
let mainWindow;

const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Time Tracker AI',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,      // Security: no direct Node in renderer
      contextIsolation: true,      // Security: isolate renderer context
      sandbox: false,              // Needed for preload scripts
    },
  });

  // Load app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    const settings = db.getSettings();
    if (settings.minimize_to_tray === 'true') {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Initialize database first
  db.initDatabase();

  createWindow();

  // Create system tray after window is ready
  tray.createTray(mainWindow);

  // Auto-start tracking
  const settings = db.getSettings();
  tracker.startTracking(settings);

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS, keep app running in tray even with no windows
  if (process.platform !== 'darwin') {
    tracker.stopTracking();
    app.quit();
  }
});

app.on('before-quit', () => {
  tracker.stopTracking();
  db.closeDatabase();
  tray.destroyTray();
});

// ─── IPC Handlers ────────────────────────────────────────────────────────────
// All IPC channels use ipcMain.handle (request/response pattern)

// Activities
ipcMain.handle('getActivitiesByDate', (_, date) => db.getActivitiesByDate(date));
ipcMain.handle('addActivity', (_, activity) => db.addActivity(activity));
ipcMain.handle('updateActivity', (_, id, activity) => db.updateActivity(id, activity));
ipcMain.handle('deleteActivity', (_, id) => db.deleteActivity(id));
ipcMain.handle('splitActivity', (_, id, splitTime) => db.splitActivity(id, splitTime));
ipcMain.handle('mergeActivities', (_, ids) => db.mergeActivities(ids));

// Projects
ipcMain.handle('getProjects', () => db.getProjects());
ipcMain.handle('addProject', (_, project) => db.addProject(project));
ipcMain.handle('updateProject', (_, id, project) => db.updateProject(id, project));
ipcMain.handle('deleteProject', (_, id) => db.deleteProject(id));

// Timesheet & export
ipcMain.handle('getTimesheet', (_, startDate, endDate) =>
  db.getTimesheet(startDate, endDate)
);
ipcMain.handle('exportCSV', async (_, startDate, endDate) =>
  exporter.exportCSV(mainWindow, startDate, endDate)
);
ipcMain.handle('copyToClipboard', (_, startDate, endDate) =>
  exporter.copyToClipboard(startDate, endDate)
);
ipcMain.handle('backupDatabase', async () =>
  exporter.backupDatabase(mainWindow)
);
ipcMain.handle('restoreDatabase', async () =>
  exporter.restoreDatabase(mainWindow)
);

// Settings
ipcMain.handle('getSettings', () => db.getSettings());
ipcMain.handle('updateSetting', (_, key, value) => {
  const result = db.updateSetting(key, value);
  // If interval changed, restart tracker
  if (key === 'tracking_interval' || key === 'idle_timeout') {
    const status = tracker.getTrackingStatus();
    if (status.isTracking) {
      tracker.stopTracking();
      tracker.startTracking(db.getSettings());
    }
  }
  return result;
});

// Privacy rules
ipcMain.handle('getPrivacyRules', () => db.getPrivacyRules());
ipcMain.handle('addPrivacyRule', (_, rule) => {
  const result = db.addPrivacyRule(rule);
  tracker.reloadPrivacyRules();
  return result;
});
ipcMain.handle('deletePrivacyRule', (_, id) => {
  const result = db.deletePrivacyRule(id);
  tracker.reloadPrivacyRules();
  return result;
});

// Tracker control
ipcMain.handle('startTracking', () => {
  const settings = db.getSettings();
  const result = tracker.startTracking(settings);
  tray.updateTray(mainWindow);
  return result;
});
ipcMain.handle('stopTracking', () => {
  const result = tracker.stopTracking();
  tray.updateTray(mainWindow);
  return result;
});
ipcMain.handle('getTrackingStatus', () => tracker.getTrackingStatus());