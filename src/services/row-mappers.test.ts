import { describe, expect, it } from 'vitest';
import type {
  Tracker,
  TrackerOption,
  TrackingLog,
  UserSettings
} from '../domain/models';
import {
  logFromRow,
  logToRow,
  optionToRow,
  settingsFromRow,
  settingsToRow,
  trackerFromRows,
  trackerToRow
} from './row-mappers';

const NOW = '2026-07-21T00:00:00.000Z';

describe('row mappers', () => {
  it('maps nullable tracker columns to domain defaults', () => {
    expect(trackerFromRows({
      id: 'tracker-1',
      user_id: 'user-1',
      name: 'Water',
      input_type: 'unit',
      unit: 'glass',
      icon: '💧',
      color: '#2563eb',
      daily_goal: null,
      quick_values: null,
      is_active: true,
      sort_order: null,
      created_at: NOW
    }, [])).toEqual({
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
      createdAt: NOW
    });
  });

  it('maps option tracker rows into ordered nested options', () => {
    expect(trackerFromRows({
      id: 'tracker-1',
      user_id: 'user-1',
      name: 'Wake quality',
      input_type: 'option',
      unit: null,
      icon: '☀️',
      color: '#c2410c',
      daily_goal: null,
      quick_values: null,
      is_active: true,
      sort_order: 1,
      created_at: NOW
    }, [
      {
        id: 'tired-id',
        user_id: 'user-1',
        tracker_id: 'tracker-1',
        label: 'Tired',
        sort_order: 1,
        created_at: '2026-07-21T00:02:00.000Z'
      },
      {
        id: 'rested-id',
        user_id: 'user-1',
        tracker_id: 'tracker-1',
        label: 'Rested',
        sort_order: 0,
        created_at: '2026-07-21T00:01:00.000Z'
      }
    ])).toEqual({
      id: 'tracker-1',
      name: 'Wake quality',
      inputType: 'option',
      unit: null,
      icon: '☀️',
      color: '#c2410c',
      goal: null,
      presets: [],
      options: [
        {
          id: 'rested-id',
          label: 'Rested',
          sortOrder: 0,
          createdAt: '2026-07-21T00:01:00.000Z'
        },
        {
          id: 'tired-id',
          label: 'Tired',
          sortOrder: 1,
          createdAt: '2026-07-21T00:02:00.000Z'
        }
      ],
      active: true,
      sortOrder: 1,
      createdAt: NOW
    });
  });

  it('rejects tracker rows whose nested options do not match their input type', () => {
    const unitRow = {
      id: 'tracker-1', user_id: 'user-1', name: 'Water', input_type: 'unit' as const,
      unit: 'glass', icon: '💧', color: '#2563eb', daily_goal: null,
      quick_values: [1], is_active: true, sort_order: 0, created_at: NOW
    };
    const optionRow = {
      id: 'option-1', user_id: 'user-1', tracker_id: 'tracker-1', label: 'Rested',
      sort_order: 0, created_at: NOW
    };

    expect(() => trackerFromRows(unitRow, [optionRow])).toThrow();
    expect(() => trackerFromRows({
      ...unitRow,
      input_type: 'option',
      unit: null,
      daily_goal: null,
      quick_values: null
    }, [])).toThrow();
  });

  it('rejects option tracker rows carrying unit-only fields', () => {
    const row = {
      id: 'tracker-1', user_id: 'user-1', name: 'Wake quality', input_type: 'option' as const,
      unit: 'count', icon: '☀️', color: '#c2410c', daily_goal: 1,
      quick_values: [1], is_active: true, sort_order: 0, created_at: NOW
    };
    const option = {
      id: 'rested-id', user_id: 'user-1', tracker_id: 'tracker-1', label: 'Rested',
      sort_order: 0, created_at: NOW
    };

    expect(() => trackerFromRows(row, [option])).toThrow();
  });

  it('maps nullable log and settings columns to domain defaults', () => {
    expect(logFromRow({
      id: 'log-1',
      user_id: 'user-1',
      tracker_id: 'tracker-1',
      value: 2,
      option_id: null,
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

  it('maps option logs by option identity', () => {
    expect(logFromRow({
      id: 'log-1',
      user_id: 'user-1',
      tracker_id: 'tracker-1',
      value: null,
      option_id: 'wake-id',
      occurred_at: NOW,
      note: null,
      source: 'website',
      client_id: 'log-1'
    })).toEqual({
      id: 'log-1',
      trackerId: 'tracker-1',
      recordType: 'option',
      value: null,
      optionId: 'wake-id',
      occurredAt: NOW,
      note: '',
      source: 'website'
    });
  });

  it('rejects log rows without exactly one value or option identity', () => {
    const row = {
      id: 'log-1', user_id: 'user-1', tracker_id: 'tracker-1', occurred_at: NOW,
      note: null, source: 'website', client_id: 'log-1'
    };

    expect(() => logFromRow({ ...row, value: 1, option_id: 'wake-id' })).toThrow();
    expect(() => logFromRow({ ...row, value: null, option_id: null })).toThrow();
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
      input_type: 'unit',
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
      option_id: null,
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

  it('maps option tracker and log writes to nullable database fields', () => {
    const option: TrackerOption = {
      id: 'rested-id',
      label: 'Rested',
      sortOrder: 0,
      createdAt: NOW
    };
    const tracker: Tracker = {
      id: 'tracker-1', name: 'Wake quality', inputType: 'option', unit: null,
      icon: '☀️', color: '#c2410c', goal: null, presets: [], options: [option],
      active: true, sortOrder: 1, createdAt: NOW
    };
    const log: TrackingLog = {
      id: 'log-1', trackerId: 'tracker-1', recordType: 'option', value: null,
      optionId: 'rested-id', occurredAt: NOW, note: '', source: 'website'
    };
    expect(trackerToRow(tracker, 'user-1')).toEqual({
      id: 'tracker-1',
      user_id: 'user-1',
      name: 'Wake quality',
      input_type: 'option',
      unit: null,
      icon: '☀️',
      color: '#c2410c',
      daily_goal: null,
      quick_values: null,
      is_active: true,
      sort_order: 1
    });
    expect(optionToRow(option, 'tracker-1', 'user-1')).toEqual({
      id: 'rested-id',
      user_id: 'user-1',
      tracker_id: 'tracker-1',
      label: 'Rested',
      sort_order: 0,
      created_at: NOW
    });
    expect(logToRow(log, 'user-1')).toEqual({
      id: 'log-1',
      user_id: 'user-1',
      tracker_id: 'tracker-1',
      value: null,
      option_id: 'rested-id',
      occurred_at: NOW,
      note: null,
      source: 'website',
      client_id: 'log-1'
    });
  });
});
