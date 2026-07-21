import { describe, expect, it } from 'vitest';
import type { Tracker, TrackingLog, UserSettings } from '../domain/models';
import {
  logFromRow,
  logToRow,
  settingsFromRow,
  settingsToRow,
  trackerFromRow,
  trackerToRow
} from './row-mappers';

describe('row mappers', () => {
  it('maps nullable tracker columns to domain defaults', () => {
    expect(trackerFromRow({
      id: 'tracker-1',
      user_id: 'user-1',
      name: 'Water',
      unit: 'glass',
      icon: '💧',
      color: '#2563eb',
      daily_goal: null,
      quick_values: null,
      is_active: true,
      sort_order: null,
      created_at: '2026-07-21T00:00:00.000Z'
    })).toEqual({
      id: 'tracker-1',
      name: 'Water',
      unit: 'glass',
      icon: '💧',
      color: '#2563eb',
      goal: null,
      presets: [1],
      inputType: 'unit',
      options: [],
      active: true,
      sortOrder: 0,
      createdAt: '2026-07-21T00:00:00.000Z'
    });
  });

  it('maps nullable log and settings columns to domain defaults', () => {
    expect(logFromRow({
      id: 'log-1',
      user_id: 'user-1',
      tracker_id: 'tracker-1',
      value: 2,
      occurred_at: '2026-07-21T01:00:00.000Z',
      note: null,
      source: null,
      client_id: null
    })).toEqual({
      id: 'log-1',
      trackerId: 'tracker-1',
      value: 2,
      recordType: 'unit',
      optionId: null,
      occurredAt: '2026-07-21T01:00:00.000Z',
      note: '',
      source: 'website'
    });

    expect(settingsFromRow({
      user_id: 'user-1',
      theme: null,
      preferences: null,
      dashboard_layout: null
    })).toEqual({ theme: 'system', confirmDelete: true });
  });

  it('maps domain values to snake-case rows scoped to the authenticated user', () => {
    const tracker: Tracker = {
      id: 'tracker-1',
      name: 'Water',
      unit: 'glass',
      icon: '💧',
      color: '#2563eb',
      goal: 8,
      presets: [1, 2],
      inputType: 'unit',
      options: [],
      active: true,
      sortOrder: 3,
      createdAt: '2026-07-21T00:00:00.000Z'
    };
    const log: TrackingLog = {
      id: 'log-1',
      trackerId: 'tracker-1',
      value: 2,
      recordType: 'unit',
      optionId: null,
      occurredAt: '2026-07-21T01:00:00.000Z',
      note: '',
      source: ''
    };
    const settings: UserSettings = { theme: 'dark', confirmDelete: false };

    expect(trackerToRow(tracker, 'user-1')).toEqual({
      id: 'tracker-1',
      user_id: 'user-1',
      name: 'Water',
      unit: 'glass',
      icon: '💧',
      color: '#2563eb',
      daily_goal: 8,
      quick_values: [1, 2],
      is_active: true,
      sort_order: 3
    });
    expect(logToRow(log, 'user-1')).toEqual({
      id: 'log-1',
      user_id: 'user-1',
      tracker_id: 'tracker-1',
      value: 2,
      occurred_at: '2026-07-21T01:00:00.000Z',
      note: null,
      source: 'website',
      client_id: 'log-1'
    });
    expect(settingsToRow(settings, 'user-1')).toEqual({
      user_id: 'user-1',
      theme: 'dark',
      preferences: { confirmDelete: false },
      dashboard_layout: {}
    });
  });
});
