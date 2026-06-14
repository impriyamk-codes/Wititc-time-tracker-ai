/**
 * time.js
 * Utility functions for formatting and working with time values.
 */

/**
 * Format seconds into HH:MM:SS string.
 */
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Format seconds into a human-readable string like "2h 30m".
 */
export function formatDurationHuman(seconds) {
  if (!seconds || seconds < 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Get today's date as YYYY-MM-DD string.
 */
export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get date N days ago as YYYY-MM-DD string.
 */
export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Get the ISO string for the start of a week (Monday) containing the given date.
 */
export function weekStart(dateString) {
  const d = new Date(dateString);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Get the ISO string for the end of a week (Sunday) containing the given date.
 */
export function weekEnd(dateString) {
  const start = weekStart(dateString);
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

/**
 * Format a time string (ISO or HH:MM:SS) to HH:MM.
 */
export function formatTime(timeStr) {
  if (!timeStr) return '--:--';
  // Handle ISO datetime strings
  const t = timeStr.includes('T') ? timeStr.slice(11, 16) : timeStr.slice(0, 5);
  return t;
}

/**
 * Parse HH:MM:SS or HH:MM into total seconds.
 */
export function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return 0;
}

/**
 * Calculate duration in seconds between two ISO datetime strings.
 */
export function calcDuration(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  return Math.max(0, Math.floor((new Date(endTime) - new Date(startTime)) / 1000));
}

/**
 * Get position percentage of a time within a day (for timeline rendering).
 * Returns a number between 0 and 100.
 */
export function timeToPercent(timeStr, dayStart = '00:00', dayEnd = '24:00') {
  const toMinutes = (t) => {
    const [h, m] = t.slice(0, 5).split(':').map(Number);
    return h * 60 + m;
  };
  const timeStr5 = timeStr.includes('T') ? timeStr.slice(11, 16) : timeStr.slice(0, 5);
  const mins = toMinutes(timeStr5);
  const startMins = toMinutes(dayStart);
  const endMins = toMinutes(dayEnd);
  return Math.min(100, Math.max(0, ((mins - startMins) / (endMins - startMins)) * 100));
}

/**
 * Format a date string (YYYY-MM-DD) to a human-readable format.
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Check if a YYYY-MM-DD string is today.
 */
export function isToday(dateStr) {
  return dateStr === todayString();
}

/**
 * Generate an array of YYYY-MM-DD strings for a week starting at `startDate`.
 */
export function weekDates(startDate) {
  const dates = [];
  const d = new Date(startDate + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}