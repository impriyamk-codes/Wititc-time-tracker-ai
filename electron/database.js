/**
 * database.js
 * Handles all SQLite database operations using better-sqlite3.
 * All data stays local — no cloud, no telemetry.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db;

/**
 * Initialize the database. Creates tables if they don't exist.
 * Database file lives in the user's app data directory.
 */
function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'timetracker.db');

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT,
      window_title TEXT,
      url TEXT,
      domain TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_seconds INTEGER DEFAULT 0,
      project_id INTEGER,
      task TEXT,
      category TEXT,
      color TEXT,
      is_idle INTEGER DEFAULT 0,
      is_manual INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#6366f1',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS privacy_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      action TEXT DEFAULT 'exclude',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Insert default settings if not present
  const defaults = [
    ['tracking_interval', '5'],
    ['idle_timeout', '300'],
    ['minimize_to_tray', 'true'],
    ['start_on_login', 'false'],
  ];

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [key, value] of defaults) {
    insertSetting.run(key, value);
  }

  console.log('[DB] Database initialized at:', dbPath);
  return dbPath;
}

// ─── Activities ──────────────────────────────────────────────────────────────

function getActivitiesByDate(date) {
  // date format: YYYY-MM-DD
  return db
    .prepare(
      `SELECT a.*, p.name AS project_name, p.color AS project_color
       FROM activities a
       LEFT JOIN projects p ON a.project_id = p.id
       WHERE date(a.start_time) = ?
       ORDER BY a.start_time ASC`
    )
    .all(date);
}

function addActivity(activity) {
  const stmt = db.prepare(`
    INSERT INTO activities
      (app_name, window_title, url, domain, start_time, end_time,
       duration_seconds, project_id, task, category, color,
       is_idle, is_manual, notes)
    VALUES
      (@app_name, @window_title, @url, @domain, @start_time, @end_time,
       @duration_seconds, @project_id, @task, @category, @color,
       @is_idle, @is_manual, @notes)
  `);
  const result = stmt.run({
    app_name: activity.app_name || null,
    window_title: activity.window_title || null,
    url: activity.url || null,
    domain: activity.domain || null,
    start_time: activity.start_time,
    end_time: activity.end_time || null,
    duration_seconds: activity.duration_seconds || 0,
    project_id: activity.project_id || null,
    task: activity.task || null,
    category: activity.category || null,
    color: activity.color || null,
    is_idle: activity.is_idle ? 1 : 0,
    is_manual: activity.is_manual ? 1 : 0,
    notes: activity.notes || null,
  });
  return { id: result.lastInsertRowid, ...activity };
}

function updateActivity(id, activity) {
  const stmt = db.prepare(`
    UPDATE activities SET
      app_name = @app_name,
      window_title = @window_title,
      url = @url,
      domain = @domain,
      start_time = @start_time,
      end_time = @end_time,
      duration_seconds = @duration_seconds,
      project_id = @project_id,
      task = @task,
      category = @category,
      color = @color,
      is_idle = @is_idle,
      is_manual = @is_manual,
      notes = @notes,
      updated_at = datetime('now')
    WHERE id = @id
  `);
  stmt.run({
    id,
    app_name: activity.app_name || null,
    window_title: activity.window_title || null,
    url: activity.url || null,
    domain: activity.domain || null,
    start_time: activity.start_time,
    end_time: activity.end_time || null,
    duration_seconds: activity.duration_seconds || 0,
    project_id: activity.project_id || null,
    task: activity.task || null,
    category: activity.category || null,
    color: activity.color || null,
    is_idle: activity.is_idle ? 1 : 0,
    is_manual: activity.is_manual ? 1 : 0,
    notes: activity.notes || null,
  });
  return getActivityById(id);
}

function getActivityById(id) {
  return db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
}

function deleteActivity(id) {
  db.prepare('DELETE FROM activities WHERE id = ?').run(id);
  return { success: true };
}

/**
 * Split an activity block at a given time.
 * Creates two new blocks and deletes the original.
 */
function splitActivity(id, splitTime) {
  const activity = getActivityById(id);
  if (!activity) return { error: 'Activity not found' };

  const start = new Date(activity.start_time);
  const split = new Date(splitTime);
  const end = activity.end_time ? new Date(activity.end_time) : new Date();

  if (split <= start || split >= end) {
    return { error: 'Split time must be between start and end time' };
  }

  const firstDuration = Math.floor((split - start) / 1000);
  const secondDuration = Math.floor((end - split) / 1000);

  const first = addActivity({
    ...activity,
    id: undefined,
    start_time: activity.start_time,
    end_time: splitTime,
    duration_seconds: firstDuration,
    is_manual: 1,
  });
  const second = addActivity({
    ...activity,
    id: undefined,
    start_time: splitTime,
    end_time: activity.end_time,
    duration_seconds: secondDuration,
    is_manual: 1,
  });

  deleteActivity(id);
  return { first, second };
}

/**
 * Merge multiple activity blocks into one.
 * Uses the earliest start_time and latest end_time.
 */
function mergeActivities(ids) {
  if (!ids || ids.length < 2) return { error: 'Need at least 2 activities to merge' };

  const placeholders = ids.map(() => '?').join(',');
  const acts = db
    .prepare(`SELECT * FROM activities WHERE id IN (${placeholders}) ORDER BY start_time ASC`)
    .all(...ids);

  if (acts.length < 2) return { error: 'Could not find activities' };

  const first = acts[0];
  const last = acts[acts.length - 1];
  const start = new Date(first.start_time);
  const end = last.end_time ? new Date(last.end_time) : new Date();
  const duration = Math.floor((end - start) / 1000);

  const merged = addActivity({
    ...first,
    id: undefined,
    end_time: last.end_time,
    duration_seconds: duration,
    is_manual: 1,
    notes: `Merged from ${ids.length} activities`,
  });

  for (const id of ids) deleteActivity(id);
  return merged;
}

// ─── Projects ────────────────────────────────────────────────────────────────

function getProjects() {
  return db.prepare('SELECT * FROM projects ORDER BY name ASC').all();
}

function addProject(project) {
  const stmt = db.prepare(
    'INSERT INTO projects (name, color) VALUES (@name, @color)'
  );
  const result = stmt.run({
    name: project.name,
    color: project.color || '#6366f1',
  });
  return { id: result.lastInsertRowid, ...project };
}

function updateProject(id, project) {
  db.prepare(
    'UPDATE projects SET name = @name, color = @color WHERE id = @id'
  ).run({ id, name: project.name, color: project.color });
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function deleteProject(id) {
  // Unlink activities first
  db.prepare('UPDATE activities SET project_id = NULL WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return { success: true };
}

// ─── Timesheet ───────────────────────────────────────────────────────────────

function getTimesheet(startDate, endDate) {
  const rows = db
    .prepare(
      `SELECT
         a.id,
         a.app_name,
         a.window_title,
         a.start_time,
         a.end_time,
         a.duration_seconds,
         a.is_idle,
         a.category,
         a.task,
         a.notes,
         p.name AS project_name,
         p.color AS project_color
       FROM activities a
       LEFT JOIN projects p ON a.project_id = p.id
       WHERE date(a.start_time) BETWEEN ? AND ?
         AND a.end_time IS NOT NULL
       ORDER BY a.start_time ASC`
    )
    .all(startDate, endDate);

  // Group by project
  const grouped = {};
  for (const row of rows) {
    const key = row.project_name || 'Unassigned';
    if (!grouped[key]) {
      grouped[key] = {
        project_name: key,
        project_color: row.project_color || '#94a3b8',
        total_seconds: 0,
        activities: [],
      };
    }
    grouped[key].total_seconds += row.duration_seconds || 0;
    grouped[key].activities.push(row);
  }

  return {
    rows,
    grouped: Object.values(grouped),
    total_seconds: rows.reduce((s, r) => s + (r.duration_seconds || 0), 0),
  };
}

// ─── Settings ────────────────────────────────────────────────────────────────

function getSettings() {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

function updateSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    key,
    String(value)
  );
  return { key, value };
}

// ─── Privacy Rules ───────────────────────────────────────────────────────────

function getPrivacyRules() {
  return db.prepare('SELECT * FROM privacy_rules ORDER BY created_at DESC').all();
}

function addPrivacyRule(rule) {
  const stmt = db.prepare(
    'INSERT INTO privacy_rules (type, value, action) VALUES (@type, @value, @action)'
  );
  const result = stmt.run({
    type: rule.type,
    value: rule.value,
    action: rule.action || 'exclude',
  });
  return { id: result.lastInsertRowid, ...rule };
}

function deletePrivacyRule(id) {
  db.prepare('DELETE FROM privacy_rules WHERE id = ?').run(id);
  return { success: true };
}

// ─── Backup / Restore ────────────────────────────────────────────────────────

function getDbPath() {
  return db.name;
}

function closeDatabase() {
  if (db) db.close();
}

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