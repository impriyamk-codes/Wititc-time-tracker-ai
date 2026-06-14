/**
 * exporter.js
 * Handles CSV export and clipboard copy for timesheet data.
 */

const fs = require('fs');
const path = require('path');
const { dialog, clipboard } = require('electron');
const db = require('./database');

/**
 * Convert seconds to HH:MM:SS string.
 */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Escape a CSV field (wrap in quotes if it contains comma/newline/quote).
 */
function csvField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export timesheet data to a CSV file.
 * Opens a Save dialog for the user to pick the destination.
 */
async function exportCSV(mainWindow, startDate, endDate) {
  const data = db.getTimesheet(startDate, endDate);

  const headers = [
    'Date',
    'Start Time',
    'End Time',
    'Duration',
    'App',
    'Window Title',
    'Domain',
    'Project',
    'Task',
    'Category',
    'Notes',
  ];

  const rows = data.rows.map(row => [
    csvField(row.start_time ? row.start_time.slice(0, 10) : ''),
    csvField(row.start_time ? row.start_time.slice(11, 19) : ''),
    csvField(row.end_time ? row.end_time.slice(11, 19) : ''),
    csvField(formatDuration(row.duration_seconds || 0)),
    csvField(row.app_name),
    csvField(row.window_title),
    csvField(row.domain),
    csvField(row.project_name || 'Unassigned'),
    csvField(row.task),
    csvField(row.category),
    csvField(row.notes),
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Timesheet CSV',
    defaultPath: `timesheet_${startDate}_to_${endDate}.csv`,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
  });

  if (canceled || !filePath) return { canceled: true };

  fs.writeFileSync(filePath, csv, 'utf-8');
  return { success: true, filePath };
}

/**
 * Copy a human-readable timesheet summary to clipboard.
 */
function copyToClipboard(startDate, endDate) {
  const data = db.getTimesheet(startDate, endDate);

  let text = `Time Report: ${startDate} to ${endDate}\n`;
  text += '='.repeat(50) + '\n\n';

  for (const group of data.grouped) {
    text += `📁 ${group.project_name}\n`;
    text += `   Total: ${formatDuration(group.total_seconds)}\n\n`;
  }

  text += '─'.repeat(50) + '\n';
  text += `TOTAL: ${formatDuration(data.total_seconds)}\n`;

  clipboard.writeText(text);
  return { success: true };
}

/**
 * Show a save dialog to backup the database file.
 */
async function backupDatabase(mainWindow) {
  const dbPath = db.getDbPath();

  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Backup Database',
    defaultPath: `timetracker_backup_${new Date().toISOString().slice(0, 10)}.db`,
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
  });

  if (canceled || !filePath) return { canceled: true };

  fs.copyFileSync(dbPath, filePath);
  return { success: true, filePath };
}

/**
 * Show an open dialog to restore the database from a backup.
 * Overwrites the current database file!
 */
async function restoreDatabase(mainWindow) {
  const dbPath = db.getDbPath();

  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'Restore Database from Backup',
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    properties: ['openFile'],
  });

  if (canceled || !filePaths[0]) return { canceled: true };

  // Copy backup file over existing DB
  fs.copyFileSync(filePaths[0], dbPath);
  return { success: true, message: 'Database restored. Please restart the app.' };
}

module.exports = {
  exportCSV,
  copyToClipboard,
  backupDatabase,
  restoreDatabase,
};