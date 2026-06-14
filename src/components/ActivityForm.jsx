/**
 * ActivityForm.jsx
 * Modal form for adding or editing an activity entry.
 * Handles manual time entries and edits to tracked activities.
 */

import React, { useState, useEffect } from 'react';

// Convert ISO datetime to local datetime-local input value
function isoToLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Convert datetime-local input value back to ISO string
function localToIso(local) {
  if (!local) return null;
  return new Date(local).toISOString();
}

export default function ActivityForm({ activity, projects, onSave, onCancel, onDelete }) {
  const isNew = !activity?.id;

  const [form, setForm] = useState({
    app_name: '',
    window_title: '',
    url: '',
    domain: '',
    start_time: '',
    end_time: '',
    project_id: '',
    task: '',
    category: '',
    notes: '',
    is_manual: true,
    is_idle: false,
    ...activity,
    start_time: isoToLocal(activity?.start_time),
    end_time: isoToLocal(activity?.end_time),
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  async function handleSave() {
    if (!form.start_time) {
      setError('Start time is required.');
      return;
    }

    const startIso = localToIso(form.start_time);
    const endIso = form.end_time ? localToIso(form.end_time) : null;

    if (endIso && new Date(endIso) <= new Date(startIso)) {
      setError('End time must be after start time.');
      return;
    }

    setSaving(true);
    setError('');

    const duration = endIso
      ? Math.floor((new Date(endIso) - new Date(startIso)) / 1000)
      : 0;

    const payload = {
      ...form,
      start_time: startIso,
      end_time: endIso,
      duration_seconds: duration,
      project_id: form.project_id ? parseInt(form.project_id, 10) : null,
      is_manual: 1,
      is_idle: form.is_idle ? 1 : 0,
    };

    await onSave(payload);
    setSaving(false);
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <h2 className="modal-title">
          {isNew ? '+ Add Activity' : 'Edit Activity'}
        </h2>

        {error && (
          <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Start Time *</label>
            <input
              type="datetime-local"
              className="input"
              value={form.start_time}
              onChange={e => set('start_time', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>End Time</label>
            <input
              type="datetime-local"
              className="input"
              value={form.end_time}
              onChange={e => set('end_time', e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label>App Name</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Visual Studio Code"
            value={form.app_name || ''}
            onChange={e => set('app_name', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Window / Tab Title</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. main.js — my-project"
            value={form.window_title || ''}
            onChange={e => set('window_title', e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Project</label>
            <select
              className="select"
              value={form.project_id || ''}
              onChange={e => set('project_id', e.target.value)}
            >
              <option value="">— None —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Task</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Code review"
              value={form.task || ''}
              onChange={e => set('task', e.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Category</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Development"
              value={form.category || ''}
              onChange={e => set('category', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Domain / URL</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. github.com"
              value={form.domain || form.url || ''}
              onChange={e => set('domain', e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea
            className="textarea"
            placeholder="Optional notes…"
            value={form.notes || ''}
            onChange={e => set('notes', e.target.value)}
          />
        </div>

        <div className="form-group flex items-center gap-2">
          <input
            type="checkbox"
            id="is_idle"
            checked={!!form.is_idle}
            onChange={e => set('is_idle', e.target.checked)}
            style={{ accentColor: '#6366f1', width: 14, height: 14 }}
          />
          <label htmlFor="is_idle" style={{ marginBottom: 0, cursor: 'pointer' }}>
            Mark as idle / away block
          </label>
        </div>

        <div className="modal-footer">
          {!isNew && onDelete && (
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(activity.id)}>
              Delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (isNew ? 'Add Activity' : 'Save Changes')}
          </button>
        </div>
      </div>
    </div>
  );
}