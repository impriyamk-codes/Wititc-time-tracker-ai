/**
 * tray.js
 * Creates the system tray icon and context menu.
 * Allows starting/stopping tracking and showing/hiding the window from tray.
 */

const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const tracker = require('./tracker');

let tray = null;

/**
 * Create a simple colored circle icon programmatically using raw bytes.
 * This avoids needing bundled icon files during development.
 */
function createTrayIcon(color = 'green') {
  // 16x16 PNG — we use a simple filled circle
  // In a real app, use a proper .ico/.png from assets/
  try {
    const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
    const fs = require('fs');
    if (fs.existsSync(iconPath)) {
      return nativeImage.createFromPath(iconPath);
    }
  } catch {}

  // Fallback: empty image (tray will show text label on macOS)
  return nativeImage.createEmpty();
}

function buildMenu(mainWindow, isTracking) {
  return Menu.buildFromTemplate([
    {
      label: 'Time Tracker AI',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: isTracking ? '⏸ Pause Tracking' : '▶ Start Tracking',
      click: () => {
        if (isTracking) {
          tracker.stopTracking();
        } else {
          tracker.startTracking();
        }
        // Rebuild menu to reflect new state
        updateTray(mainWindow);
        // Notify renderer
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('tracking-status-changed', tracker.getTrackingStatus());
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Hide Window',
      click: () => mainWindow.hide(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tracker.stopTracking();
        app.quit();
      },
    },
  ]);
}

function createTray(mainWindow) {
  if (tray) return tray;

  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Time Tracker AI');

  const status = tracker.getTrackingStatus();
  tray.setContextMenu(buildMenu(mainWindow, status.isTracking));

  // Left-click toggles window visibility
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}

function updateTray(mainWindow) {
  if (!tray) return;
  const status = tracker.getTrackingStatus();
  tray.setContextMenu(buildMenu(mainWindow, status.isTracking));
  tray.setToolTip(
    status.isTracking ? 'Time Tracker AI — Tracking' : 'Time Tracker AI — Paused'
  );
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, updateTray, destroyTray };