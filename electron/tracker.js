/**
 * tracker.js
 * Background activity tracker.
 * Uses active-win to detect the current app/window every N seconds.
 * Handles idle detection, privacy rules, and activity block management.
 */

const { powerMonitor } = require('electron');
const db = require('./database');

let trackingInterval = null;
let isTracking = false;
let currentActivity = null;   // The currently open (unfinished) activity block
let privacyRules = [];         // Loaded from DB for fast checking

// Default settings (overridden from DB at runtime)
let intervalSeconds = 5;
let idleTimeoutSeconds = 300; // 5 minutes

/**
 * Load active-win dynamically.
 * active-win is an ESM-only package, so we use dynamic import.
 */
async function getActiveWindow() {
  try {
    const activeWin = await import('active-win');
    return await activeWin.default();
  } catch (err) {
    // active-win may fail on some setups — log and return null
    console.warn('[Tracker] active-win error:', err.message);
    return null;
  }
}

/**
 * Get the system idle time in seconds via Electron's powerMonitor.
 */
function getIdleSeconds() {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch {
    return 0;
  }
}

/**
 * Check whether an app/window matches any privacy exclusion rule.
 * Returns true if the activity should be skipped/excluded.
 */
function isExcluded(appName, windowTitle, domain) {
  for (const rule of privacyRules) {
    if (rule.action !== 'exclude') continue;
    const val = rule.value.toLowerCase();
    if (rule.type === 'app' && appName && appName.toLowerCase().includes(val)) {
      return true;
    }
    if (
      rule.type === 'domain' &&
      domain &&
      domain.toLowerCase().includes(val)
    ) {
      return true;
    }
    if (
      rule.type === 'title' &&
      windowTitle &&
      windowTitle.toLowerCase().includes(val)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check whether title should be hidden (privacy-masked) for a given app.
 */
function shouldMaskTitle(appName) {
  for (const rule of privacyRules) {
    if (rule.action !== 'mask') continue;
    if (rule.type === 'app' && appName && appName.toLowerCase().includes(rule.value.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Close the current activity block in the database.
 */
function closeCurrentActivity(endTime) {
  if (!currentActivity) return;

  const end = endTime || new Date().toISOString();
  const start = new Date(currentActivity.start_time);
  const duration = Math.floor((new Date(end) - start) / 1000);

  // Only save blocks longer than 1 second
  if (duration >= 1) {
    try {
      db.addActivity({
        ...currentActivity,
        end_time: end,
        duration_seconds: duration,
      });
    } catch (err) {
      console.error('[Tracker] Failed to save activity:', err);
    }
  }

  currentActivity = null;
}

/**
 * Core tracking tick — called every N seconds.
 */
async function tick() {
  if (!isTracking) return;

  const idleSeconds = getIdleSeconds();
  const now = new Date().toISOString();

  // ── Idle detection ────────────────────────────────────────────────────
  if (idleSeconds >= idleTimeoutSeconds) {
    // User is idle: close current real activity
    if (currentActivity && !currentActivity.is_idle) {
      closeCurrentActivity();
      // Open an idle block
      currentActivity = {
        app_name: 'Away',
        window_title: 'Idle / Away',
        url: null,
        domain: null,
        start_time: now,
        is_idle: 1,
        is_manual: 0,
      };
    } else if (!currentActivity) {
      currentActivity = {
        app_name: 'Away',
        window_title: 'Idle / Away',
        url: null,
        domain: null,
        start_time: now,
        is_idle: 1,
        is_manual: 0,
      };
    }
    return;
  }

  // User returned from idle
  if (currentActivity && currentActivity.is_idle) {
    closeCurrentActivity(now);
  }

  // ── Active window detection ───────────────────────────────────────────
  const win = await getActiveWindow();

  if (!win) return;

  const appName = win.owner?.name || win.owner?.bundleId || 'Unknown';
  let windowTitle = win.title || '';
  let url = null;
  let domain = null;

  // Try to extract URL/domain from window title (browsers often show domain in title)
  // This is a best-effort approach; a browser extension would be more accurate
  const urlMatch = windowTitle.match(/https?:\/\/([^\s/]+)/);
  if (urlMatch) {
    url = urlMatch[0];
    domain = urlMatch[1];
  } else {
    // Try to infer domain from tab titles like "GitHub - ..." or "Gmail - Google"
    const knownBrowsers = ['chrome', 'firefox', 'safari', 'edge', 'opera', 'brave'];
    const isBrowser = knownBrowsers.some(b => appName.toLowerCase().includes(b));
    if (isBrowser) {
      // Last portion after last dash is often the site name
      const parts = windowTitle.split(' - ');
      if (parts.length > 1) {
        domain = parts[parts.length - 1].trim().toLowerCase().replace(/\s+/g, '');
      }
    }
  }

  // ── Privacy check ─────────────────────────────────────────────────────
  if (isExcluded(appName, windowTitle, domain)) {
    if (currentActivity && currentActivity.app_name !== appName) {
      closeCurrentActivity(now);
    }
    // Don't track excluded apps at all
    currentActivity = null;
    return;
  }

  if (shouldMaskTitle(appName)) {
    windowTitle = '[Hidden by privacy rule]';
    url = null;
    domain = null;
  }

  // ── App/window switch detection ───────────────────────────────────────
  const changed =
    !currentActivity ||
    currentActivity.app_name !== appName ||
    currentActivity.window_title !== windowTitle;

  if (changed) {
    closeCurrentActivity(now);
    currentActivity = {
      app_name: appName,
      window_title: windowTitle,
      url,
      domain,
      start_time: now,
      is_idle: 0,
      is_manual: 0,
    };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

function startTracking(settings) {
  if (isTracking) return { status: 'already_running' };

  // Reload settings and privacy rules from DB
  const s = settings || db.getSettings();
  intervalSeconds = parseInt(s.tracking_interval || '5', 10);
  idleTimeoutSeconds = parseInt(s.idle_timeout || '300', 10);
  privacyRules = db.getPrivacyRules();

  isTracking = true;
  trackingInterval = setInterval(() => tick().catch(console.error), intervalSeconds * 1000);

  console.log(`[Tracker] Started — interval: ${intervalSeconds}s, idle timeout: ${idleTimeoutSeconds}s`);
  return { status: 'started' };
}

function stopTracking() {
  if (!isTracking) return { status: 'not_running' };

  isTracking = false;
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }

  // Close any open activity block
  closeCurrentActivity();

  console.log('[Tracker] Stopped');
  return { status: 'stopped' };
}

function getTrackingStatus() {
  return {
    isTracking,
    intervalSeconds,
    idleTimeoutSeconds,
    currentActivity: currentActivity
      ? {
          app_name: currentActivity.app_name,
          window_title: currentActivity.window_title,
          start_time: currentActivity.start_time,
        }
      : null,
  };
}

/**
 * Reload privacy rules without restarting the tracker.
 */
function reloadPrivacyRules() {
  privacyRules = db.getPrivacyRules();
}

module.exports = {
  startTracking,
  stopTracking,
  getTrackingStatus,
  reloadPrivacyRules,
};