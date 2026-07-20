import { describe, expect, it } from 'vitest';
import { blankState, normalizeState } from './schemas';
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

  it('rejects data that is not an object', () => {
    expect(() => normalizeState('invalid')).toThrow('Invalid tracker state');
  });
});
