/**
 * database.js
 * JSON-based local storage — replaces better-sqlite3.
 *
 * Data lives in:  <userData>/time-tracker-db.json
 *
 * Schema (in-memory object, flushed to disk on every write):
 * {
 *   activities:    Activity[],
 *   projects:      Project[],
 *   settings:      { [key]: string },
 *   privacy_rules: PrivacyRule[],
 *   _seq: { activities: number, projects: number, privacy_rules: number }
 * }
 *
 * All public functions keep the same signatures as the old SQLite version so
 * no other file needs to change.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

// ─── In-memory store ─────────────────────────────────────────────────────────

let dbPath = null;

/** @type {{ activities: any[], projects: any[], settings: Record<string,string>, privacy_rules: any[], _seq: Record<string,number> }} */
let store = null;

// Write-debounce: batch rapid writes into one disk flush
let flushTimer = null;
const FLUSH_DELAY_MS = 200;

const DEFAULT_STORE = () => ({
  activities:    [],
  projects:      [],
  settings: {
    tracking_interval: '5',
    idle_timeout:      '300',
    minimize_to_tray:  'true',
    start_on_login:    'false',
  },
  privacy_rules: [],
  _seq: { activities: 0, projects: 0, privacy_rules: 0 },
});

// ─── Disk I/O ─────────────────────────────────────────────────────────────────

function loadFromDisk() {
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf8');
      const parsed = JSON.parse(raw);
      // Merge with defaults so new keys always exist
      store = Object.assign(DEFAULT_STORE(), parsed);
      // Ensure _seq exists for all collections
      store._seq = Object.assign({ activities: 0, projects: 0, privacy_rules: 0 }, parsed._seq || {});
      // Repair sequences if data was imported without them
      store._seq.activities    = Math.max(store._seq.activities,    maxId(store.activities));
      store._seq.projects      = Math.max(store._seq.projects,      maxId(store.projects));
      store._seq.privacy_rules = Math.max(store._seq.privacy_rules, maxId(store.privacy_rules));
    } else {
      store = DEFAULT_STORE();
    }
  } catch (err) {
    console.error('[DB] Failed to load database, starting fresh:', err.message);
    store = DEFAULT_STORE();
  }
}

function maxId(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((m, r) => Math.max(m, r.id || 0), 0);
}

/** Flush store to disk (debounced). */
function scheduleSave() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushToDisk, FLUSH_DELAY_MS);
}

/** Synchronous flush — called on app quit. */
function flushToDisk() {
  clearTimeout(flushTimer);
  try {
    const tmp = dbPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, dbPath); // atomic on same filesystem
  } catch (err) {
    console.error('[DB] Failed to write database:', err.message);
  }
}

/** Next auto-increment id for a collection. */
function nextId(collection) {
  store._seq[collection] = (store._seq[collection] || 0) + 1;
  return store._seq[collection];
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function initDatabase() {
  const userDataPath = app.getPath('userData');
  // Create userData directory if it doesn't exist (first run)
  if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
  dbPath = path.join(userDataPath, 'time-tracker-db.json');
  loadFromDisk();
  console.log('[DB] JSON database ready at:', dbPath);
  return dbPath;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract YYYY-MM-DD from an ISO datetime string (handles both UTC 'Z' and local). */
function isoDate(isoStr) {
  if (!isoStr) return null;
  return isoStr.slice(0, 10);
}

/** Join activity with its project fields. */
function joinProject(activity) {
  const project = activity.project_id
    ? store.projects.find(p => p.id === activity.project_id) || null
    : null;
  return {
    ...activity,
    project_name:  project ? project.name  : null,
    project_color: project ? project.color : null,
  };
}

// ─── Activities ───────────────────────────────────────────────────────────────

function getActivitiesByDate(date) {
  return store.activities
    .filter(a => isoDate(a.start_time) === date)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map(joinProject);
}

function addActivity(activity) {
  const now = new Date().toISOString();
  const record = {
    id:               nextId('activities'),
    app_name:         activity.app_name         || null,
    window_title:     activity.window_title      || null,
    url:              activity.url               || null,
    domain:           activity.domain            || null,
    start_time:       activity.start_time,
    end_time:         activity.end_time          || null,
    duration_seconds: activity.duration_seconds  || 0,
    project_id:       activity.project_id        || null,
    task:             activity.task              || null,
    category:         activity.category          || null,
    color:            activity.color             || null,
    is_idle:          activity.is_idle  ? 1 : 0,
    is_manual:        activity.is_manual ? 1 : 0,
    notes:            activity.notes             || null,
    created_at:       now,
    updated_at:       now,
  };
  store.activities.push(record);
  scheduleSave();
  return record;
}

function getActivityById(id) {
  return store.activities.find(a => a.id === id) || null;
}

function updateActivity(id, activity) {
  const idx = store.activities.findIndex(a => a.id === id);
  if (idx === -1) return null;
  const existing = store.activities[idx];
  store.activities[idx] = {
    ...existing,
    app_name:         activity.app_name         !== undefined ? activity.app_name         : existing.app_name,
    window_title:     activity.window_title      !== undefined ? activity.window_title      : existing.window_title,
    url:              activity.url               !== undefined ? activity.url               : existing.url,
    domain:           activity.domain            !== undefined ? activity.domain            : existing.domain,
    start_time:       activity.start_time        !== undefined ? activity.start_time        : existing.start_time,
    end_time:         activity.end_time          !== undefined ? activity.end_time          : existing.end_time,
    duration_seconds: activity.duration_seconds  !== undefined ? activity.duration_seconds  : existing.duration_seconds,
    project_id:       activity.project_id        !== undefined ? (activity.project_id || null) : existing.project_id,
    task:             activity.task              !== undefined ? activity.task              : existing.task,
    category:         activity.category          !== undefined ? activity.category          : existing.category,
    color:            activity.color             !== undefined ? activity.color             : existing.color,
    is_idle:          activity.is_idle           !== undefined ? (activity.is_idle  ? 1 : 0) : existing.is_idle,
    is_manual:        activity.is_manual         !== undefined ? (activity.is_manual ? 1 : 0) : existing.is_manual,
    notes:            activity.notes             !== undefined ? activity.notes             : existing.notes,
    updated_at:       new Date().toISOString(),
  };
  scheduleSave();
  return store.activities[idx];
}

function deleteActivity(id) {
  const before = store.activities.length;
  store.activities = store.activities.filter(a => a.id !== id);
  if (store.activities.length !== before) scheduleSave();
  return { success: true };
}

function splitActivity(id, splitTime) {
  const activity = getActivityById(id);
  if (!activity) return { error: 'Activity not found' };

  const start = new Date(activity.start_time);
  const split = new Date(splitTime);
  const end   = activity.end_time ? new Date(activity.end_time) : new Date();

  if (split <= start || split >= end) {
    return { error: 'Split time must be between start and end time' };
  }

  const firstDuration  = Math.floor((split - start) / 1000);
  const secondDuration = Math.floor((end   - split) / 1000);

  const first = addActivity({
    ...activity,
    id: undefined,
    start_time:       activity.start_time,
    end_time:         splitTime,
    duration_seconds: firstDuration,
    is_manual:        1,
  });
  const second = addActivity({
    ...activity,
    id: undefined,
    start_time:       splitTime,
    end_time:         activity.end_time,
    duration_seconds: secondDuration,
    is_manual:        1,
  });

  deleteActivity(id);
  return { first, second };
}

function mergeActivities(ids) {
  if (!ids || ids.length < 2) return { error: 'Need at least 2 activities to merge' };

  const acts = ids
    .map(id => getActivityById(id))
    .filter(Boolean)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  if (acts.length < 2) return { error: 'Could not find activities' };

  const first = acts[0];
  const last  = acts[acts.length - 1];
  const start = new Date(first.start_time);
  const end   = last.end_time ? new Date(last.end_time) : new Date();
  const duration = Math.floor((end - start) / 1000);

  const merged = addActivity({
    ...first,
    id: undefined,
    end_time:         last.end_time,
    duration_seconds: duration,
    is_manual:        1,
    notes:            `Merged from ${ids.length} activities`,
  });

  for (const id of ids) deleteActivity(id);
  return merged;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

function getProjects() {
  return [...store.projects].sort((a, b) => a.name.localeCompare(b.name));
}

function addProject(project) {
  // Guard against duplicate names
  if (store.projects.find(p => p.name === project.name)) {
    return { error: 'A project with that name already exists' };
  }
  const record = {
    id:         nextId('projects'),
    name:       project.name,
    color:      project.color || '#6366f1',
    created_at: new Date().toISOString(),
  };
  store.projects.push(record);
  scheduleSave();
  return record;
}

function updateProject(id, project) {
  const idx = store.projects.findIndex(p => p.id === id);
  if (idx === -1) return null;
  store.projects[idx] = {
    ...store.projects[idx],
    name:  project.name  || store.projects[idx].name,
    color: project.color || store.projects[idx].color,
  };
  scheduleSave();
  return store.projects[idx];
}

function deleteProject(id) {
  // Unlink activities that reference this project
  store.activities = store.activities.map(a =>
    a.project_id === id ? { ...a, project_id: null } : a
  );
  store.projects = store.projects.filter(p => p.id !== id);
  scheduleSave();
  return { success: true };
}

// ─── Timesheet ────────────────────────────────────────────────────────────────

function getTimesheet(startDate, endDate) {
  const rows = store.activities
    .filter(a => {
      const d = isoDate(a.start_time);
      return d >= startDate && d <= endDate && a.end_time != null;
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map(joinProject);

  const grouped = {};
  for (const row of rows) {
    const key = row.project_name || 'Unassigned';
    if (!grouped[key]) {
      grouped[key] = {
        project_name:  key,
        project_color: row.project_color || '#94a3b8',
        total_seconds: 0,
        activities:    [],
      };
    }
    grouped[key].total_seconds += row.duration_seconds || 0;
    grouped[key].activities.push(row);
  }

  return {
    rows,
    grouped:       Object.values(grouped),
    total_seconds: rows.reduce((s, r) => s + (r.duration_seconds || 0), 0),
  };
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function getSettings() {
  // Return a shallow copy so callers can't mutate the store directly
  return { ...store.settings };
}

function updateSetting(key, value) {
  store.settings[key] = String(value);
  scheduleSave();
  return { key, value };
}

// ─── Privacy Rules ────────────────────────────────────────────────────────────

function getPrivacyRules() {
  return [...store.privacy_rules].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

function addPrivacyRule(rule) {
  const record = {
    id:         nextId('privacy_rules'),
    type:       rule.type,
    value:      rule.value,
    action:     rule.action || 'exclude',
    created_at: new Date().toISOString(),
  };
  store.privacy_rules.push(record);
  scheduleSave();
  return record;
}

function deletePrivacyRule(id) {
  store.privacy_rules = store.privacy_rules.filter(r => r.id !== id);
  scheduleSave();
  return { success: true };
}

// ─── Backup / Restore ─────────────────────────────────────────────────────────

/** Returns the path to the JSON database file (used by exporter for backup). */
function getDbPath() {
  return dbPath;
}

/** Flush synchronously and release (called on app quit). */
function closeDatabase() {
  flushToDisk();
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  initDatabase,
  getActivitiesByDate,
  addActivity,
  updateActivity,
  deleteActivity,
  splitActivity,
  mergeActivities,
  getProjects,
  addProject,
  updateProject,
  deleteProject,
  getTimesheet,
  getSettings,
  updateSetting,
  getPrivacyRules,
  addPrivacyRule,
  deletePrivacyRule,
  getDbPath,
  closeDatabase,
};