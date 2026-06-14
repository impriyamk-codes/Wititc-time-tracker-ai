/**
 * Timeline.jsx
 * Shows all activities for a selected day in a visual timeline.
 * Supports clicking activities to edit them, and adding manual entries.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ActivityForm from './ActivityForm.jsx';
import { formatDurationHuman, formatTime, todayString, formatDate, calcDuration } from '../utils/time.js';

// App icon emoji based on common app names
function appIcon(appName) {
  if (!appName) return '🖥';
  const a = appName.toLowerCase();
  if (a.includes('chrome') || a.includes('firefox') || a.includes('safari') || a.includes('edge') || a.includes('brave')) return '🌐';
  if (a.includes('code') || a.includes('vscode') || a.includes('visual studio')) return '💻';
  if (a.includes('slack')) return '💬';
  if (a.includes('teams')) return '👥';
  if (a.includes('zoom')) return '📹';
  if (a.includes('excel') || a.includes('sheets')) return '📊';
  if (a.includes('word') || a.includes('docs')) return '📝';
  if (a.includes('outlook') || a.includes('mail') || a.includes('gmail')) return '✉️';
  if (a.includes('terminal') || a.includes('iterm') || a.includes('bash')) return '⌨️';
  if (a.includes('figma') || a.includes('sketch')) return '🎨';
  if (a.includes('spotify') || a.includes('music')) return '🎵';
  if (a.includes('away') || a.includes('idle')) return '💤';
  return '🖥';
}

// Compute where a block sits on the timeline (as a % from top)
function computeBlockStyle(activity, dayStartHour = 0, dayEndHour = 24) {
  const totalMins = (dayEndHour - dayStartHour) * 60;
  const start = new Date(activity.start_time);
  const end = activity.end_time ? new Date(activity.end_time) : new Date();

  const startMins = start.getHours() * 60 + start.getMinutes() - dayStartHour * 60;
  const endMins = end.getHours() * 60 + end.getMinutes() - dayStartHour * 60;
  const durationMins = Math.max(1, endMins - startMins);

  const top = Math.max(0, (startMins / totalMins) * 100);
  const height = Math.min(100 - top, (durationMins / totalMins) * 100);

  return { top: `${top}%`, height: `${Math.max(0.3, height)}%` };
}

// Hour labels for the timeline ruler
function HourLabels({ startHour, endHour }) {
  const hours = [];
  for (let h = startHour; h <= endHour; h++) {
    hours.push(h);
  }
  return (
    <div style={styles.hourLabels}>
      {hours.map(h => (
        <div key={h} style={styles.hourLabel}>
          {String(h % 24).padStart(2, '0')}:00
        </div>
      ))}
    </div>
  );
}

export default function Timeline({ projects, isTracking, onToggleTracking, showToast }) {
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editActivity, setEditActivity] = useState(null); // null = closed, {} = new, {id,...} = edit
  const [selectedIds, setSelectedIds] = useState([]);
  const [splitTarget, setSplitTarget] = useState(null);
  const [splitTime, setSplitTime] = useState('');
  const refreshRef = useRef(null);

  // ── Load activities ─────────────────────────────────────────────────
  const loadActivities = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.timeTracker.getActivitiesByDate(selectedDate);
      setActivities(data || []);
    } catch (err) {
      showToast('Failed to load activities: ' + err.message, 'error');
    }
    setLoading(false);
  }, [selectedDate, showToast]);

  useEffect(() => {
    loadActivities();
    setSelectedIds([]);
    // Auto-refresh every 10 seconds when viewing today
    clearInterval(refreshRef.current);
    if (selectedDate === todayString()) {
      refreshRef.current = setInterval(loadActivities, 10000);
    }
    return () => clearInterval(refreshRef.current);
  }, [selectedDate, loadActivities]);

  // ── Date navigation ─────────────────────────────────────────────────
  const shiftDate = (days) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  // ── Save (add or update) ────────────────────────────────────────────
  const handleSave = async (payload) => {
    try {
      if (payload.id) {
        await window.timeTracker.updateActivity(payload.id, payload);
        showToast('Activity updated', 'success');
      } else {
        await window.timeTracker.addActivity(payload);
        showToast('Activity added', 'success');
      }
      setEditActivity(null);
      loadActivities();
    } catch (err) {
      showToast('Error saving: ' + err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this activity?')) return;
    await window.timeTracker.deleteActivity(id);
    showToast('Activity deleted');
    setEditActivity(null);
    loadActivities();
  };

  // ── Merge ─────────────────────────────────────────────────────────
  const handleMerge = async () => {
    if (selectedIds.length < 2) { showToast('Select 2+ activities to merge', 'info'); return; }
    if (!confirm(`Merge ${selectedIds.length} activities into one?`)) return;
    await window.timeTracker.mergeActivities(selectedIds);
    setSelectedIds([]);
    showToast('Activities merged', 'success');
    loadActivities();
  };

  // ── Split ──────────────────────────────────────────────────────────
  const handleSplitOpen = (activity) => {
    setSplitTarget(activity);
    // Default split time = midpoint
    const start = new Date(activity.start_time);
    const end = activity.end_time ? new Date(activity.end_time) : new Date();
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    setSplitTime(mid.toTimeString().slice(0, 5));
  };

  const handleSplitConfirm = async () => {
    const date = selectedDate;
    const fullTime = `${date}T${splitTime}:00`;
    const result = await window.timeTracker.splitActivity(splitTarget.id, new Date(fullTime).toISOString());
    if (result.error) { showToast(result.error, 'error'); return; }
    setSplitTarget(null);
    showToast('Activity split', 'success');
    loadActivities();
  };

  // ── Toggle multi-select ────────────────────────────────────────────
  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // ── Timeline bounds ────────────────────────────────────────────────
  const dayStartHour = 0;
  const dayEndHour = 24;
  const totalSeconds = activities
    .filter(a => !a.is_idle)
    .reduce((s, a) => s + (a.duration_seconds || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">Timeline</div>
          <div className="page-subtitle">
            {formatDate(selectedDate)} · {formatDurationHuman(totalSeconds)} tracked
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {selectedIds.length > 1 && (
            <button className="btn btn-secondary btn-sm" onClick={handleMerge}>
              Merge {selectedIds.length} blocks
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setEditActivity({})}>
            + Add Manual
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: isTracking ? 'rgba(34,197,94,0.12)' : 'rgba(99,102,241,0.12)',
              color: isTracking ? '#22c55e' : '#6366f1',
              border: `1px solid ${isTracking ? 'rgba(34,197,94,0.35)' : 'rgba(99,102,241,0.35)'}`,
            }}
            onClick={onToggleTracking}
          >
            {isTracking ? '⏸ Pause' : '▶ Resume'}
          </button>
        </div>
      </div>

      {/* ── Date nav ── */}
      <div className="flex items-center gap-2" style={{ padding: '12px 24px' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => shiftDate(-1)}>← Prev</button>
        <input
          type="date"
          className="input"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          style={{ width: 150 }}
        />
        <button className="btn btn-ghost btn-sm" onClick={() => shiftDate(1)}>Next →</button>
        {selectedDate !== todayString() && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(todayString())}>
            Today
          </button>
        )}
      </div>

      {/* ── Timeline canvas ── */}
      <div style={styles.timelineWrapper}>
        <HourLabels startHour={dayStartHour} endHour={dayEndHour} />

        <div style={styles.timelineCanvas}>
          {/* Hour grid lines */}
          {Array.from({ length: dayEndHour - dayStartHour + 1 }, (_, i) => (
            <div
              key={i}
              style={{
                ...styles.gridLine,
                top: `${(i / (dayEndHour - dayStartHour)) * 100}%`,
              }}
            />
          ))}

          {/* Activity blocks */}
          {loading ? (
            <div style={styles.loadingOverlay}>Loading…</div>
          ) : activities.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ fontSize: 36, opacity: 0.3 }}>⏱</div>
              <div style={{ color: '#94a3b8', marginTop: 8 }}>No activities recorded for this day</div>
              {isTracking && <div style={{ color: '#64748b', fontSize: 12 }}>Tracking is active — activities will appear here</div>}
            </div>
          ) : (
            activities.map(activity => {
              const pos = computeBlockStyle(activity, dayStartHour, dayEndHour);
              const isSelected = selectedIds.includes(activity.id);
              const color = activity.project_color || (activity.is_idle ? '#4b5563' : '#6366f1');
              const duration = activity.duration_seconds || calcDuration(activity.start_time, activity.end_time);

              return (
                <div
                  key={activity.id}
                  onClick={() => setEditActivity(activity)}
                  style={{
                    ...styles.activityBlock,
                    top: pos.top,
                    height: pos.height,
                    background: activity.is_idle
                      ? 'rgba(75,85,99,0.25)'
                      : `${color}22`,
                    borderLeft: `3px solid ${color}`,
                    borderColor: isSelected ? '#fff' : color,
                    outline: isSelected ? `2px solid ${color}` : 'none',
                    opacity: activity.is_idle ? 0.6 : 1,
                  }}
                >
                  <div className="flex items-center gap-1" style={{ overflow: 'hidden' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={e => toggleSelect(activity.id, e)}
                      onChange={() => {}}
                      style={{ accentColor: color, cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 13 }}>{appIcon(activity.app_name)}</span>
                    <span style={styles.blockApp}>{activity.app_name || 'Unknown'}</span>
                    {activity.project_name && (
                      <span className="badge" style={{ background: `${color}25`, color, fontSize: 10 }}>
                        {activity.project_name}
                      </span>
                    )}
                  </div>
                  <div style={styles.blockTitle} className="truncate">
                    {activity.window_title || activity.category || ''}
                  </div>
                  <div style={styles.blockMeta}>
                    {formatTime(activity.start_time)} – {formatTime(activity.end_time)}
                    &nbsp;·&nbsp;{formatDurationHuman(duration)}
                    {activity.domain && <>&nbsp;·&nbsp;{activity.domain}</>}
                  </div>

                  {/* Split button (on hover via :hover is tricky in inline — use small button always) */}
                  {duration > 120 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 11, padding: '2px 6px', opacity: 0.5 }}
                      onClick={e => { e.stopPropagation(); handleSplitOpen(activity); }}
                      title="Split block"
                    >
                      ✂️
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Edit modal ── */}
      {editActivity !== null && (
        <ActivityForm
          activity={editActivity}
          projects={projects}
          onSave={handleSave}
          onCancel={() => setEditActivity(null)}
          onDelete={handleDelete}
        />
      )}

      {/* ── Split modal ── */}
      {splitTarget && (
        <div className="modal-backdrop" onClick={() => setSplitTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
            <h2 className="modal-title">Split Activity</h2>
            <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
              {splitTarget.app_name} · {formatTime(splitTarget.start_time)} – {formatTime(splitTarget.end_time)}
            </p>
            <div className="form-group">
              <label>Split at time</label>
              <input
                type="time"
                className="input"
                value={splitTime}
                onChange={e => setSplitTime(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSplitTarget(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSplitConfirm}>Split</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  timelineWrapper: {
    display: 'flex',
    flex: 1,
    overflow: 'auto',
    padding: '0 24px 24px',
    gap: 0,
    minHeight: 0,
  },
  hourLabels: {
    width: 52,
    flexShrink: 0,
    position: 'relative',
    paddingTop: 0,
  },
  hourLabel: {
    height: `${100/24}%`,
    display: 'flex',
    alignItems: 'flex-start',
    paddingTop: 2,
    fontSize: 10,
    color: '#4b5563',
    fontFamily: 'JetBrains Mono, monospace',
    userSelect: 'none',
  },
  timelineCanvas: {
    flex: 1,
    position: 'relative',
    background: 'rgba(255,255,255,0.015)',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
    minHeight: 1200,
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0, right: 0,
    height: 1,
    background: 'rgba(255,255,255,0.04)',
  },
  activityBlock: {
    position: 'absolute',
    left: 4,
    right: 4,
    borderRadius: 6,
    padding: '4px 32px 4px 8px',
    cursor: 'pointer',
    minHeight: 24,
    overflow: 'hidden',
    transition: 'opacity 0.15s',
  },
  blockApp: {
    fontSize: 12,
    fontWeight: 600,
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  blockTitle: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  blockMeta: {
    fontSize: 10,
    color: '#64748b',
    fontFamily: 'JetBrains Mono, monospace',
    marginTop: 2,
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
    fontSize: 13,
  },
  emptyState: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    textAlign: 'center',
  },
};