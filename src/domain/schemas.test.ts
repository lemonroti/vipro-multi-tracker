import { describe, expect, it } from 'vitest';
import {
  blankState,
  normalizeState,
  offlineOperationSchema,
  trackerSchema,
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
        inputType: 'unit',
        options: [],
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
        inputType: 'unit',
        options: [],
        active: true,
        sortOrder: 1,
        createdAt: '2026-07-21T00:00:00.000Z'
      }
    ]);
  });
});

describe('normalizeState', () => {
  it('returns the version 4 blank state for an empty object', () => {
    expect(normalizeState({})).toEqual(blankState());
  });

  it('normalizes legacy version 3 trackers and logs as Unit data', () => {
    const now = '2026-07-21T00:00:00.000Z';
    const legacy = normalizeState({
      version: 3,
      trackers: [{
        id: 'tracker-1', name: 'Smoking', unit: 'cigarette', icon: '🚬',
        color: '#334155', goal: 8, presets: [1], active: true,
        sortOrder: 0, createdAt: now
      }],
      logs: [{
        id: 'log-1', trackerId: 'tracker-1', value: 1,
        occurredAt: now, note: '', source: 'website'
      }],
      settings: { theme: 'system', confirmDelete: true }
    });

    expect(legacy.version).toBe(4);
    expect(legacy.trackers[0]).toMatchObject({ inputType: 'unit', options: [] });
    expect(legacy.logs[0]).toMatchObject({ recordType: 'unit', optionId: null });
  });

  it('preserves current version 4 Option data', () => {
    const now = '2026-07-21T00:00:00.000Z';
    const current = normalizeState({
      version: 4,
      trackers: [{
        id: 'tracker-1', name: 'Routine', inputType: 'option', unit: null,
        icon: '✦', color: '#334155', goal: null, presets: [], active: true,
        sortOrder: 0, createdAt: now,
        options: [{ id: 'option-1', label: 'Sleep', sortOrder: 0, createdAt: now }]
      }],
      logs: [{
        id: 'log-1', trackerId: 'tracker-1', recordType: 'option', value: null,
        optionId: 'option-1', occurredAt: now, note: '', source: 'website'
      }],
      settings: { theme: 'system', confirmDelete: true }
    });

    expect(current.trackers[0]).toMatchObject({
      inputType: 'option',
      unit: null,
      options: [{ id: 'option-1', label: 'Sleep' }]
    });
    expect(current.logs[0]).toMatchObject({
      recordType: 'option',
      value: null,
      optionId: 'option-1'
    });
  });

  it('trims Option labels and rejects normalized case-insensitive duplicates', () => {
    const now = '2026-07-21T00:00:00.000Z';
    const optionState = (labels: string[]) => ({
      version: 4,
      trackers: [{
        id: 'tracker-1', name: 'Routine', inputType: 'option', unit: null,
        icon: '✦', color: '#334155', goal: null, presets: [], active: true,
        sortOrder: 0, createdAt: now,
        options: labels.map((label, sortOrder) => ({
          id: `option-${sortOrder}`, label, sortOrder, createdAt: now
        }))
      }],
      logs: [],
      settings: { theme: 'system', confirmDelete: true }
    });

    expect(normalizeState(optionState(['  Sleep  '])).trackers[0]?.options[0]?.label)
      .toBe('Sleep');
    expect(() => normalizeState(optionState(['Sleep', ' sleep '])))
      .toThrow();
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

describe('trackerSchema', () => {
  it('accepts Unit and Option tracker variants', () => {
    const common = {
      id: 'tracker-1',
      name: 'Tracker',
      icon: '✦',
      color: '#334155',
      active: true,
      sortOrder: 0,
      createdAt: '2026-07-21T00:00:00.000Z'
    };

    expect(trackerSchema.safeParse({
      ...common,
      inputType: 'unit',
      unit: 'count',
      goal: null,
      presets: [1],
      options: []
    }).success).toBe(true);
    expect(trackerSchema.safeParse({
      ...common,
      inputType: 'option',
      unit: null,
      goal: null,
      presets: [],
      options: [{
        id: 'option-1', label: 'Sleep', sortOrder: 0,
        createdAt: '2026-07-21T00:00:00.000Z'
      }]
    }).success).toBe(true);
  });

  it('trims persisted Option labels', () => {
    const result = trackerSchema.parse({
      id: 'tracker-1', name: 'Routine', inputType: 'option', unit: null,
      icon: '✦', color: '#334155', goal: null, presets: [], active: true,
      sortOrder: 0, createdAt: '2026-07-21T00:00:00.000Z',
      options: [{
        id: 'option-1', label: '  Sleep  ', sortOrder: 0,
        createdAt: '2026-07-21T00:00:00.000Z'
      }]
    });

    expect(result.options[0]?.label).toBe('Sleep');
  });

  it('rejects empty, oversized, and case-insensitively duplicate Option labels', () => {
    const optionTracker = {
      id: 'tracker-1', name: 'Routine', inputType: 'option' as const, unit: null,
      icon: '✦', color: '#334155', goal: null, presets: [] as [], active: true,
      sortOrder: 0, createdAt: '2026-07-21T00:00:00.000Z'
    };
    const option = (id: string, label: string, sortOrder: number) => ({
      id, label, sortOrder, createdAt: '2026-07-21T00:00:00.000Z'
    });

    expect(trackerSchema.safeParse({
      ...optionTracker,
      options: [option('empty', '   ', 0)]
    }).success).toBe(false);
    expect(trackerSchema.safeParse({
      ...optionTracker,
      options: [option('long', ` ${'a'.repeat(81)} `, 0)]
    }).success).toBe(false);
    expect(trackerSchema.safeParse({
      ...optionTracker,
      options: [option('one', 'Sleep', 0), option('two', ' sleep ', 1)]
    }).success).toBe(false);
  });
});

describe('trackingLogSchema', () => {
  it('rejects an empty tracker ID', () => {
    expect(trackingLogSchema.safeParse({
      id: 'log-1',
      trackerId: '',
      value: 1,
      recordType: 'unit',
      optionId: null,
      occurredAt: '2026-07-21T00:00:00.000Z',
      note: '',
      source: 'website'
    }).success).toBe(false);
  });

  it('accepts Unit and Option log variants', () => {
    const common = {
      id: 'log-1',
      trackerId: 'tracker-1',
      occurredAt: '2026-07-21T00:00:00.000Z',
      note: '',
      source: 'website'
    };

    expect(trackingLogSchema.safeParse({
      ...common,
      recordType: 'unit',
      value: 1,
      optionId: null
    }).success).toBe(true);
    expect(trackingLogSchema.safeParse({
      ...common,
      recordType: 'option',
      value: null,
      optionId: 'option-1'
    }).success).toBe(true);
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
      inputType: 'unit',
      options: [],
      active: true,
      sortOrder: 0,
      createdAt: '2026-07-21T00:00:00.000Z'
    };
    const log = {
      id: 'log-1',
      trackerId: 'tracker-1',
      value: 250,
      recordType: 'unit',
      optionId: null,
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
