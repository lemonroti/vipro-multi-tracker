import { describe, expect, it } from 'vitest';
import {
  blankState,
  normalizeState,
  offlineOperationSchema,
  trackingLogSchema
} from './schemas';
import { makeDefaultTrackers } from './defaults';

describe('makeDefaultTrackers', () => {
  it('creates the complete default tracker set with supplied IDs and timestamp', () => {
    const ids = ['id-1', 'id-2'];
    let idIndex = 0;
    const createId = () => ids[idIndex++] ?? 'unexpected-id';
    const now = () => '2026-07-21T00:00:00.000Z';

    expect(makeDefaultTrackers(createId, now)).toEqual([
      {
        id: 'id-1',
        name: 'Smoking',
        unit: 'cigarette',
        icon: '🚬',
        color: '#334155',
        goal: 8,
        presets: [1],
        active: true,
        sortOrder: 0,
        createdAt: '2026-07-21T00:00:00.000Z'
      },
      {
        id: 'id-2',
        name: '觀世音菩薩聖號',
        unit: 'minute',
        icon: '🙏',
        color: '#6d4aff',
        goal: 30,
        presets: [5, 10, 15],
        active: true,
        sortOrder: 1,
        createdAt: '2026-07-21T00:00:00.000Z'
      }
    ]);
  });
});

describe('normalizeState', () => {
  it('returns the version 3 blank state for an empty object', () => {
    expect(normalizeState({})).toEqual(blankState());
  });

  it('normalizes a valid tracker and removes non-positive logs', () => {
    const state = normalizeState({
      trackers: [{ id: 'tracker-1', name: 'Water', unit: 'ml', presets: [250] }],
      logs: [
        { id: 'log-1', trackerId: 'tracker-1', value: 250 },
        { id: 'log-2', trackerId: 'tracker-1', value: 0 }
      ]
    });

    expect(state.trackers[0]).toMatchObject({ name: 'Water', active: true, presets: [250] });
    expect(state.logs).toHaveLength(1);
    expect(state.settings).toEqual({ theme: 'system', confirmDelete: true });
  });

  it('applies legacy defaults before stringifying falsy primitive fields', () => {
    const state = normalizeState({
      trackers: [{ id: 0, name: 0, createdAt: false }],
      logs: [{
        id: 0,
        trackerId: 'tracker-1',
        value: 1,
        occurredAt: false,
        source: 0
      }]
    });
    const tracker = state.trackers[0];
    const log = state.logs[0];

    expect(tracker).toBeDefined();
    expect(tracker?.id).not.toBe('0');
    expect(tracker?.id).not.toHaveLength(0);
    expect(tracker?.name).toBe('Untitled');
    expect(Date.parse(tracker?.createdAt ?? '')).not.toBeNaN();
    expect(log).toBeDefined();
    expect(log?.id).not.toBe('0');
    expect(log?.id).not.toHaveLength(0);
    expect(Date.parse(log?.occurredAt ?? '')).not.toBeNaN();
    expect(log?.source).toBe('website');
  });

  it('uses the indexed legacy palette for invalid tracker colors', () => {
    const state = normalizeState({
      trackers: [
        { id: 'tracker-1', color: 'red' },
        { id: 'tracker-2', color: '#123' }
      ]
    });

    expect(state.trackers.map(tracker => tracker.color)).toEqual(['#334155', '#6d4aff']);
  });

  it('keeps at most eight positive finite presets', () => {
    const state = normalizeState({
      trackers: [{
        id: 'tracker-1',
        presets: [-1, 0, '1', 2, 3, 4, 5, 6, 7, 8, 9, 'invalid']
      }]
    });

    expect(state.trackers[0]?.presets).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('uses tracker array indexes as normalized sort order', () => {
    const state = normalizeState({
      trackers: [
        { id: 'tracker-1', sortOrder: 99 },
        { id: 'tracker-2', sortOrder: -5 }
      ]
    });

    expect(state.trackers.map(tracker => tracker.sortOrder)).toEqual([0, 1]);
  });

  it('filters malformed and non-positive logs including missing tracker IDs', () => {
    const state = normalizeState({
      logs: [
        { id: 'valid', trackerId: 'tracker-1', value: '5' },
        { id: 'missing-tracker', value: 5 },
        { id: 'empty-tracker', trackerId: '', value: 5 },
        { id: 'zero', trackerId: 'tracker-1', value: 0 },
        { id: 'negative', trackerId: 'tracker-1', value: -1 },
        { id: 'invalid', trackerId: 'tracker-1', value: 'not-a-number' }
      ]
    });

    expect(state.logs.map(log => log.id)).toEqual(['valid']);
  });

  it('rejects data that is not an object', () => {
    expect(() => normalizeState('invalid')).toThrow('Invalid tracker state');
  });
});

describe('trackingLogSchema', () => {
  it('rejects an empty tracker ID', () => {
    expect(trackingLogSchema.safeParse({
      id: 'log-1',
      trackerId: '',
      value: 1,
      occurredAt: '2026-07-21T00:00:00.000Z',
      note: '',
      source: 'website'
    }).success).toBe(false);
  });
});

describe('offlineOperationSchema', () => {
  it('accepts all five offline operation variants', () => {
    const tracker = {
      id: 'tracker-1',
      name: 'Water',
      unit: 'ml',
      icon: '💧',
      color: '#2563eb',
      goal: 2000,
      presets: [250],
      active: true,
      sortOrder: 0,
      createdAt: '2026-07-21T00:00:00.000Z'
    };
    const log = {
      id: 'log-1',
      trackerId: 'tracker-1',
      value: 250,
      occurredAt: '2026-07-21T01:00:00.000Z',
      note: '',
      source: 'website'
    };
    const common = {
      id: 'operation-1',
      createdAt: '2026-07-21T02:00:00.000Z',
      retryCount: 0
    };
    const operations = [
      { ...common, type: 'upsertTracker', payload: tracker },
      { ...common, type: 'deleteTracker', payload: { id: 'tracker-1' } },
      { ...common, type: 'upsertLog', payload: log },
      { ...common, type: 'deleteLog', payload: { id: 'log-1' } },
      { ...common, type: 'saveSettings', payload: { theme: 'system', confirmDelete: true } }
    ];

    expect(operations.map(operation => offlineOperationSchema.safeParse(operation).success))
      .toEqual([true, true, true, true, true]);
  });
});
