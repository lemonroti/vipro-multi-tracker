import { describe, expect, it, vi } from 'vitest';
import type {
  AppState,
  OptionTracker,
  OptionTrackingLog,
  UnitTracker
} from '../domain/models';
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
const INPUT: Extract<TrackerInput, { inputType: 'unit' }> = {
  inputType: 'unit',
  name: 'Water',
  unit: 'ml',
  icon: '💧',
  color: '#2563eb',
  goal: 2000,
  presets: [250, 500]
};

const OPTION_INPUT: Extract<TrackerInput, { inputType: 'option' }> = {
  inputType: 'option',
  name: 'Routine',
  icon: '✦',
  color: '#334155',
  optionLabels: ['Sleep', 'Exercise']
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

function makeOptionTracker(overrides: Partial<OptionTracker> = {}): OptionTracker {
  return {
    id: 'option-tracker',
    name: 'Routine',
    inputType: 'option',
    unit: null,
    icon: '✦',
    color: '#334155',
    goal: null,
    presets: [],
    options: [
      { id: 'sleep', label: 'Sleep', sortOrder: 0, createdAt: NOW },
      { id: 'exercise', label: 'Exercise', sortOrder: 1, createdAt: NOW }
    ],
    active: true,
    sortOrder: 0,
    createdAt: NOW,
    ...overrides
  };
}

function makeOptionLog(overrides: Partial<OptionTrackingLog> = {}): OptionTrackingLog {
  return {
    id: 'option-log',
    trackerId: 'option-tracker',
    value: null,
    occurredAt: NOW,
    note: '',
    source: 'website',
    recordType: 'option',
    optionId: 'sleep',
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
  ids: string[] = [],
  isOnline = true
) {
  const storage = new MemoryStorage();
  const store = createAppStore(state);
  const cache = new UserCache(storage);
  const queue = new OfflineQueue(storage);
  const sync = new SyncService(store, cache, queue, execute, () => isOnline);
  const service = new TrackerService(
    'user-1', store, cache, sync,
    () => ids.shift() ?? 'generated-id',
    () => NOW
  );
  return { store, cache, queue, execute, service };
}

describe('TrackerService', () => {
  it('rejects Unit edits to an Option tracker that has records', async () => {
    const optionTracker = makeOptionTracker({
      options: [{ id: 'sleep', label: 'Sleep', sortOrder: 0, createdAt: NOW }]
    });
    const initial: AppState = {
      ...blankState(),
      trackers: [optionTracker],
      logs: [makeOptionLog()]
    };
    const { store, execute, service } = createHarness(initial);

    const result = await service.save({ ...INPUT, id: optionTracker.id });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'validation',
        message: 'Tracker input type cannot be changed after records exist.'
      }
    });
    expect(store.getState()).toEqual(initial);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [['Sleep'], ['sleep-id']],
    [['Sleep', 'Exercise'], ['sleep-id', 'exercise-id']]
  ])('creates an Option tracker with %s', async (optionLabels, optionIds) => {
    const { store, execute, service } = createHarness(
      blankState(),
      undefined,
      ['tracker-new', ...optionIds, 'operation-create']
    );

    const result = await service.save({ ...OPTION_INPUT, optionLabels });

    expect(result).toEqual({ ok: true, queued: false });
    expect(store.getState().trackers).toEqual([{
      id: 'tracker-new',
      name: 'Routine',
      inputType: 'option',
      unit: null,
      icon: '✦',
      color: '#334155',
      goal: null,
      presets: [],
      options: optionLabels.map((label, sortOrder) => ({
        id: optionIds[sortOrder], label, sortOrder, createdAt: NOW
      })),
      active: true,
      sortOrder: 0,
      createdAt: NOW
    }]);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      id: 'operation-create',
      type: 'upsertTracker',
      payload: store.getState().trackers[0]
    }));
  });

  it('treats a replacement label as a rename that retains the existing option ID', async () => {
    const initial = { ...blankState(), trackers: [makeOptionTracker()] };
    const { store, service } = createHarness(initial, undefined, ['operation-update']);

    const analysis = service.analyze({
      ...OPTION_INPUT,
      id: 'option-tracker',
      optionLabels: ['Rest', 'Exercise']
    });
    const result = await service.save({
      ...OPTION_INPUT,
      id: 'option-tracker',
      optionLabels: ['Rest', 'Exercise']
    });

    expect(analysis).toEqual({
      ok: true,
      impact: { removedOptions: [], removedRecordCount: 0 }
    });
    expect(result).toEqual({ ok: true, queued: false });
    expect((store.getState().trackers[0] as OptionTracker).options).toEqual([
      { id: 'sleep', label: 'Rest', sortOrder: 0, createdAt: NOW },
      { id: 'exercise', label: 'Exercise', sortOrder: 1, createdAt: NOW }
    ]);
  });

  it('reorders Option labels while preserving their identities', async () => {
    const initial = { ...blankState(), trackers: [makeOptionTracker()] };
    const { store, service } = createHarness(initial, undefined, ['operation-update']);

    await service.save({
      ...OPTION_INPUT,
      id: 'option-tracker',
      optionLabels: ['Exercise', 'Sleep']
    });

    expect((store.getState().trackers[0] as OptionTracker).options).toEqual([
      { id: 'exercise', label: 'Exercise', sortOrder: 0, createdAt: NOW },
      { id: 'sleep', label: 'Sleep', sortOrder: 1, createdAt: NOW }
    ]);
  });

  it('analyzes and removes records belonging to removed options', async () => {
    const initial: AppState = {
      ...blankState(),
      trackers: [makeOptionTracker()],
      logs: [
        makeOptionLog(),
        makeOptionLog({ id: 'exercise-log', optionId: 'exercise' })
      ]
    };
    const { store, service } = createHarness(initial, undefined, ['operation-update']);
    const input: TrackerInput = {
      ...OPTION_INPUT,
      id: 'option-tracker',
      optionLabels: ['Exercise']
    };

    expect(service.analyze(input)).toEqual({
      ok: true,
      impact: {
        removedOptions: [{ id: 'sleep', label: 'Sleep', sortOrder: 0, createdAt: NOW }],
        removedRecordCount: 1
      }
    });

    await service.save(input);

    expect((store.getState().trackers[0] as OptionTracker).options).toEqual([
      { id: 'exercise', label: 'Exercise', sortOrder: 0, createdAt: NOW }
    ]);
    expect(store.getState().logs.map(log => log.id)).toEqual(['exercise-log']);
  });

  it('allows input-type changes before a tracker has records', async () => {
    const initial: AppState = { ...blankState(), trackers: [makeTracker()] };
    const { store, service } = createHarness(
      initial,
      undefined,
      ['sleep-id', 'exercise-id', 'operation-update']
    );

    const result = await service.save({ ...OPTION_INPUT, id: 'tracker-1' });

    expect(result).toEqual({ ok: true, queued: false });
    expect(store.getState().trackers[0]).toEqual(expect.objectContaining({
      id: 'tracker-1',
      inputType: 'option',
      unit: null,
      goal: null,
      presets: [],
      options: [
        { id: 'sleep-id', label: 'Sleep', sortOrder: 0, createdAt: NOW },
        { id: 'exercise-id', label: 'Exercise', sortOrder: 1, createdAt: NOW }
      ]
    }));
  });

  it('rejects input-type changes after a tracker has records', async () => {
    const initial = makeState();
    const { store, execute, service } = createHarness(initial);
    const input: TrackerInput = { ...OPTION_INPUT, id: 'tracker-1' };

    const expected = {
      ok: false as const,
      error: {
        kind: 'validation' as const,
        message: 'Tracker input type cannot be changed after records exist.'
      }
    };
    expect(service.analyze(input)).toEqual(expected);
    await expect(service.save(input)).resolves.toEqual(expected);
    expect(store.getState()).toEqual(initial);
    expect(execute).not.toHaveBeenCalled();
  });

  it('restores removed option records when persistence rejects the atomic edit', async () => {
    const initial: AppState = {
      ...blankState(),
      trackers: [makeOptionTracker()],
      logs: [makeOptionLog()]
    };
    const execute = vi.fn(() => Promise.reject(
      new RepositoryError('permission', 'Tracker update forbidden')
    ));
    const { store, cache, service } = createHarness(initial, execute, ['operation-update']);

    const result = await service.save({
      ...OPTION_INPUT,
      id: 'option-tracker',
      optionLabels: ['Exercise']
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'permission', message: 'Tracker update forbidden' }
    });
    expect(store.getState()).toEqual(initial);
    expect(cache.load('user-1')).toEqual(initial);
  });

  it('keeps the atomic option edit and queues its final tracker while offline', async () => {
    const initial: AppState = {
      ...blankState(),
      trackers: [makeOptionTracker()],
      logs: [makeOptionLog()]
    };
    const { store, queue, execute, service } = createHarness(
      initial,
      undefined,
      ['operation-update'],
      false
    );

    const result = await service.save({
      ...OPTION_INPUT,
      id: 'option-tracker',
      optionLabels: ['Exercise']
    });

    expect(result).toEqual({ ok: true, queued: true });
    expect(store.getState().logs).toEqual([]);
    expect(queue.load('user-1')).toEqual([
      expect.objectContaining({
        id: 'operation-update',
        type: 'upsertTracker',
        payload: store.getState().trackers[0]
      })
    ]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('creates a new option ID when a removed label is added by a later save', async () => {
    const initial: AppState = { ...blankState(), trackers: [makeOptionTracker()] };
    const { store, service } = createHarness(
      initial,
      undefined,
      ['operation-remove', 'new-sleep-id', 'operation-readd']
    );

    await service.save({
      ...OPTION_INPUT,
      id: 'option-tracker',
      optionLabels: ['Exercise']
    });
    await service.save({
      ...OPTION_INPUT,
      id: 'option-tracker',
      optionLabels: ['Exercise', 'Sleep']
    });

    expect((store.getState().trackers[0] as OptionTracker).options).toEqual([
      { id: 'exercise', label: 'Exercise', sortOrder: 0, createdAt: NOW },
      { id: 'new-sleep-id', label: 'Sleep', sortOrder: 1, createdAt: NOW }
    ]);
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
