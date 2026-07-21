import { describe, expect, it } from 'vitest';
import { blankState } from '../domain/schemas';
import type { Tracker } from '../domain/models';
import { createAppStore } from './app-store';

function makeTracker(): Tracker {
  return {
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
}

describe('createAppStore', () => {
  it('replaces state without retaining or exposing mutable references', () => {
    const store = createAppStore();
    const tracker = makeTracker();
    const replacement = { ...blankState(), trackers: [tracker] };

    store.replace(replacement);
    replacement.trackers[0]!.name = 'Changed outside';

    const snapshot = store.getState();
    snapshot.trackers[0]!.name = 'Changed snapshot';

    expect(store.getState().trackers).toEqual([makeTracker()]);
  });

  it('applies immutable updates and notifies subscribers with isolated snapshots', () => {
    const store = createAppStore();
    const tracker = makeTracker();
    const snapshots: Readonly<ReturnType<typeof blankState>>[] = [];
    const unsubscribe = store.subscribe(next => snapshots.push(next));

    store.update(current => ({ ...current, trackers: [tracker] }));

    expect(store.getState().trackers).toEqual([tracker]);
    expect(snapshots).toHaveLength(1);
    snapshots[0]!.trackers[0]!.name = 'Changed listener snapshot';
    expect(store.getState().trackers[0]?.name).toBe('Water');

    unsubscribe();
    store.reset();

    expect(snapshots).toHaveLength(1);
    expect(store.getState()).toEqual(blankState());
  });
});
