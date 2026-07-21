import { describe, expect, it, vi } from 'vitest';
import type { AppState, UnitTracker } from '../domain/models';
import { blankState } from '../domain/schemas';
import { createAppStore } from '../state/app-store';
import { UserCache } from './cache';
import { OfflineQueue } from './offline-queue';
import { RepositoryError } from './repository-types';
import { SyncService, type TrackerInput } from './sync-service';
import { TrackerService } from './tracker-service';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const NOW = '2026-07-21T08:00:00.000Z';
const INPUT: TrackerInput = {
  name: 'Water',
  unit: 'ml',
  icon: '💧',
  color: '#2563eb',
  goal: 2000,
  presets: [250, 500]
};

function makeTracker(overrides: Partial<UnitTracker> = {}): UnitTracker {
  return {
    id: 'tracker-1',
    ...INPUT,
    inputType: 'unit',
    options: [],
    active: true,
    sortOrder: 0,
    createdAt: '2026-07-20T00:00:00.000Z',
    ...overrides
  };
}

function makeState(): AppState {
  return {
    ...blankState(),
    trackers: [makeTracker()],
    logs: [
      {
        id: 'log-related', trackerId: 'tracker-1', value: 250,
        occurredAt: NOW, note: '', source: 'website', recordType: 'unit', optionId: null
      },
      {
        id: 'log-other', trackerId: 'tracker-2', value: 1,
        occurredAt: NOW, note: '', source: 'website', recordType: 'unit', optionId: null
      }
    ]
  };
}

function createHarness(
  state: AppState = blankState(),
  execute = vi.fn(() => Promise.resolve()),
  ids: string[] = []
) {
  const storage = new MemoryStorage();
  const store = createAppStore(state);
  const cache = new UserCache(storage);
  const queue = new OfflineQueue(storage);
  const sync = new SyncService(store, cache, queue, execute, () => true);
  const service = new TrackerService(
    'user-1', store, cache, sync,
    () => ids.shift() ?? 'generated-id',
    () => NOW
  );
  return { store, cache, execute, service };
}

describe('TrackerService', () => {
  it('rejects Unit edits to an existing Option tracker', async () => {
    const optionTracker = {
      id: 'option-tracker',
      name: 'Routine',
      inputType: 'option' as const,
      unit: null,
      icon: '✦',
      color: '#334155',
      goal: null,
      presets: [] as [],
      options: [{ id: 'sleep', label: 'Sleep', sortOrder: 0, createdAt: NOW }],
      active: true,
      sortOrder: 0,
      createdAt: NOW
    };
    const initial: AppState = { ...blankState(), trackers: [optionTracker] };
    const { store, execute, service } = createHarness(initial);

    const result = await service.save({ ...INPUT, id: optionTracker.id });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'Invalid tracker input.' }
    });
    expect(store.getState()).toEqual(initial);
    expect(execute).not.toHaveBeenCalled();
  });

  it('creates a tracker with deterministic identity and persists its exact operation', async () => {
    const { store, execute, service } = createHarness(blankState(), undefined, [
      'tracker-new', 'operation-create'
    ]);

    const result = await service.save(INPUT);

    const tracker = {
      id: 'tracker-new',
      ...INPUT,
      inputType: 'unit',
      options: [],
      active: true,
      sortOrder: 0,
      createdAt: NOW
    };
    expect(result).toEqual({ ok: true, queued: false });
    expect(store.getState().trackers).toEqual([tracker]);
    expect(execute).toHaveBeenCalledWith({
      id: 'operation-create',
      type: 'upsertTracker',
      payload: tracker,
      createdAt: NOW,
      retryCount: 0
    });
  });

  it('updates a tracker while preserving persistence-owned fields', async () => {
    const { store, execute, service } = createHarness(makeState(), undefined, ['operation-update']);
    const input = { ...INPUT, id: 'tracker-1', name: 'Hydration', goal: 2500 };

    await service.save(input);

    const updated = makeTracker({ name: 'Hydration', goal: 2500 });
    expect(store.getState().trackers[0]).toEqual(updated);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      id: 'operation-update',
      type: 'upsertTracker',
      payload: updated,
      createdAt: NOW,
      retryCount: 0
    }));
  });

  it('toggles a tracker and persists the resulting tracker payload', async () => {
    const { store, execute, service } = createHarness(makeState(), undefined, ['operation-toggle']);

    await service.toggle('tracker-1');

    expect(store.getState().trackers[0]?.active).toBe(false);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      id: 'operation-toggle',
      type: 'upsertTracker',
      payload: makeTracker({ active: false })
    }));
  });

  it('deletes a tracker and its related logs before persistence', async () => {
    const { store, execute, service } = createHarness(makeState(), undefined, ['operation-delete']);

    await service.delete('tracker-1');

    expect(store.getState().trackers).toEqual([]);
    expect(store.getState().logs.map(log => log.id)).toEqual(['log-other']);
    expect(execute).toHaveBeenCalledWith({
      id: 'operation-delete',
      type: 'deleteTracker',
      payload: { id: 'tracker-1' },
      createdAt: NOW,
      retryCount: 0
    });
  });

  it('rejects invalid input before mutating or persisting', async () => {
    const initial = makeState();
    const { store, execute, service } = createHarness(initial);

    const result = await service.save({ ...INPUT, color: 'blue' });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'Invalid tracker input.' }
    });
    expect(store.getState()).toEqual(initial);
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns the repository error and restores state when persistence rejects a change', async () => {
    const initial = makeState();
    const execute = vi.fn(() => Promise.reject(
      new RepositoryError('permission', 'Tracker update forbidden')
    ));
    const { store, cache, service } = createHarness(initial, execute, ['operation-update']);

    const result = await service.save({ ...INPUT, id: 'tracker-1', name: 'Changed' });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'permission', message: 'Tracker update forbidden' }
    });
    expect(store.getState()).toEqual(initial);
    expect(cache.load('user-1')).toEqual(initial);
  });
});
