import { describe, expect, it, vi } from 'vitest';
import type {
  AppState,
  Tracker,
  TrackingLog,
  UnitTracker,
  UnitTrackingLog,
  UserSettings
} from '../domain/models';
import type { OfflineOperation } from '../domain/operations';
import { blankState } from '../domain/schemas';
import { createAppStore } from '../state/app-store';
import { UserCache } from './cache';
import { CloudStateService } from './cloud-state-service';
import { OfflineQueue } from './offline-queue';
import { RepositoryError } from './repository-types';
import type { LogRepository, SettingsRepository, TrackerRepository } from './repository-types';
import { SyncService, type OperationExecutor } from './sync-service';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

class FakeTrackerRepository implements TrackerRepository {
  readonly upserted: Tracker[] = [];
  readonly deleted: string[] = [];

  constructor(
    private readonly trackers: Tracker[],
    private readonly onList: () => void = () => undefined
  ) {}

  list(): Promise<Tracker[]> {
    this.onList();
    return Promise.resolve(structuredClone(this.trackers));
  }

  upsert(tracker: Tracker): Promise<void> {
    this.upserted.push(structuredClone(tracker));
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.deleted.push(id);
    return Promise.resolve();
  }
}

class FakeLogRepository implements LogRepository {
  readonly upserted: TrackingLog[] = [];
  readonly deleted: string[] = [];

  constructor(private readonly logs: TrackingLog[]) {}

  listAll(): Promise<TrackingLog[]> {
    return Promise.resolve(structuredClone(this.logs));
  }

  upsert(log: TrackingLog): Promise<void> {
    this.upserted.push(structuredClone(log));
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.deleted.push(id);
    return Promise.resolve();
  }

  deleteAll(): Promise<void> {
    this.deleted.splice(0, this.deleted.length, ...this.logs.map(log => log.id));
    return Promise.resolve();
  }
}

class FakeSettingsRepository implements SettingsRepository {
  readonly saved: UserSettings[] = [];

  constructor(private readonly settings: UserSettings | null) {}

  get(): Promise<UserSettings | null> {
    return Promise.resolve(
      this.settings === null ? null : structuredClone(this.settings)
    );
  }

  save(settings: UserSettings): Promise<void> {
    this.saved.push(structuredClone(settings));
    return Promise.resolve();
  }
}

const NOW = '2026-07-21T08:00:00.000Z';

function makeTracker(overrides: Partial<UnitTracker> = {}): UnitTracker {
  return {
    id: 'tracker-remote', name: 'Remote', unit: 'count', icon: '✦',
    color: '#334155', goal: null, presets: [1], inputType: 'unit', options: [], active: true,
    sortOrder: 0, createdAt: NOW, ...overrides
  };
}

function makeLog(overrides: Partial<UnitTrackingLog> = {}): UnitTrackingLog {
  return {
    id: 'log-remote', trackerId: 'tracker-remote', value: 1,
    occurredAt: NOW, note: '', source: 'website',
    recordType: 'unit', optionId: null, ...overrides
  };
}

function createHarness(options: {
  trackers?: Tracker[];
  logs?: TrackingLog[];
  settings?: UserSettings | null;
  initial?: AppState;
  execute?: OperationExecutor;
  onTrackerList?: () => void;
  ids?: string[];
} = {}) {
  const storage = new MemoryStorage();
  const store = createAppStore(options.initial ?? blankState());
  const cache = new UserCache(storage);
  const queue = new OfflineQueue(storage);
  const execute = options.execute ?? (() => Promise.resolve());
  const sync = new SyncService(store, cache, queue, execute, () => true);
  const trackers = new FakeTrackerRepository(options.trackers ?? [], options.onTrackerList);
  const logs = new FakeLogRepository(options.logs ?? []);
  const settings = new FakeSettingsRepository(options.settings ?? null);
  const ids = options.ids ?? [];
  const service = new CloudStateService(
    'user-1', store, cache, queue, sync, trackers, logs, settings,
    () => ids.shift() ?? 'generated-id',
    () => NOW
  );
  return { store, cache, queue, trackers, logs, settings, service };
}

function enqueue(queue: OfflineQueue, operation: OfflineOperation): void {
  queue.enqueue('user-1', operation);
}

describe('CloudStateService', () => {
  it('propagates cloud errors without replacing local state', async () => {
    const initial = { ...blankState(), trackers: [makeTracker({ id: 'cached' })] };
    const { store, service } = createHarness({ initial });
    const failure = new RepositoryError('network', 'Could not load trackers');
    vi.spyOn(FakeTrackerRepository.prototype, 'list').mockRejectedValueOnce(failure);

    await expect(service.load({ hasPendingOperations: false })).rejects.toBe(failure);
    expect(store.getState()).toEqual(initial);
  });

  it('seeds default trackers and settings for a truly empty first account', async () => {
    const { store, cache, trackers, settings, service } = createHarness({
      ids: ['default-smoking', 'default-prayer']
    });

    const state = await service.load({ hasPendingOperations: false });

    expect(state.trackers.map(tracker => tracker.id)).toEqual([
      'default-smoking', 'default-prayer'
    ]);
    expect(trackers.upserted).toEqual(state.trackers);
    expect(settings.saved).toEqual([{ theme: 'system', confirmDelete: true }]);
    expect(store.getState()).toEqual(state);
    expect(cache.load('user-1')).toEqual(state);
  });

  it('does not seed when synchronization leaves an operation queued', async () => {
    const execute = vi.fn(() => Promise.reject(
      new RepositoryError('network', 'Still offline')
    ));
    const { queue, trackers, settings, service } = createHarness({ execute });
    enqueue(queue, {
      id: 'pending-delete', type: 'deleteTracker', payload: { id: 'removed' },
      createdAt: NOW, retryCount: 0
    });

    const state = await service.load({ hasPendingOperations: true });

    expect(state.trackers).toEqual([]);
    expect(trackers.upserted).toEqual([]);
    expect(settings.saved).toEqual([]);
    expect(queue.load('user-1')).toEqual([
      expect.objectContaining({ id: 'pending-delete', retryCount: 1 })
    ]);
  });

  it('does not seed after all trackers were deliberately deleted when settings exist', async () => {
    const existingSettings: UserSettings = { theme: 'dark', confirmDelete: false };
    const { trackers, settings, service } = createHarness({ settings: existingSettings });

    const state = await service.load({ hasPendingOperations: false });

    expect(state.trackers).toEqual([]);
    expect(state.settings).toEqual(existingSettings);
    expect(trackers.upserted).toEqual([]);
    expect(settings.saved).toEqual([]);
  });

  it('normalizes the combined cloud state before storing it', async () => {
    const malformed = {
      ...makeTracker(),
      name: '',
      color: 'invalid',
      presets: [1, -1],
      sortOrder: 99
    };
    const { store, cache, service } = createHarness({
      trackers: [malformed],
      logs: [makeLog()],
      settings: { theme: 'light', confirmDelete: false }
    });

    const state = await service.load({ hasPendingOperations: false });

    expect(state.trackers[0]).toEqual(expect.objectContaining({
      name: 'Untitled', color: '#334155', presets: [1], sortOrder: 0
    }));
    expect(state.logs).toEqual([makeLog()]);
    expect(store.getState()).toEqual(state);
    expect(cache.load('user-1')).toEqual(state);
  });

  it('syncs before loading and reapplies every operation that remains pending', async () => {
    const events: string[] = [];
    const localTracker = makeTracker({ id: 'tracker-local', name: 'Pending local' });
    const execute: OperationExecutor = operation => {
      events.push(`sync:${operation.id}`);
      return Promise.reject(new RepositoryError('network', 'Still offline'));
    };
    const { store, queue, service } = createHarness({
      trackers: [makeTracker()],
      logs: [makeLog()],
      settings: { theme: 'light', confirmDelete: true },
      execute,
      onTrackerList: () => events.push('load:trackers')
    });
    enqueue(queue, {
      id: 'pending-tracker', type: 'upsertTracker', payload: localTracker,
      createdAt: NOW, retryCount: 0
    });
    enqueue(queue, {
      id: 'pending-settings', type: 'saveSettings',
      payload: { theme: 'dark', confirmDelete: false },
      createdAt: NOW, retryCount: 0
    });

    const state = await service.load({ hasPendingOperations: true });

    expect(events).toEqual(['sync:pending-tracker', 'load:trackers']);
    expect(state.trackers.map(tracker => tracker.id)).toEqual([
      'tracker-remote', 'tracker-local'
    ]);
    expect(state.settings).toEqual({ theme: 'dark', confirmDelete: false });
    expect(store.getState()).toEqual(state);
  });

  it('removes logs for deleted options when overlaying a queued tracker edit', async () => {
    const optionTracker: Tracker = {
      id: 'option-tracker', name: 'Routine', icon: '✦', color: '#334155',
      inputType: 'option', unit: null, goal: null, presets: [], active: true,
      sortOrder: 0, createdAt: NOW,
      options: [
        { id: 'sleep', label: 'Sleep', sortOrder: 0, createdAt: NOW },
        { id: 'exercise', label: 'Exercise', sortOrder: 1, createdAt: NOW }
      ]
    };
    const pendingTracker: Tracker = {
      ...optionTracker,
      options: [{ id: 'exercise', label: 'Exercise', sortOrder: 0, createdAt: NOW }]
    };
    const logs: TrackingLog[] = [
      {
        id: 'sleep-log', trackerId: 'option-tracker', value: null,
        occurredAt: NOW, note: '', source: 'website',
        recordType: 'option', optionId: 'sleep'
      },
      {
        id: 'exercise-log', trackerId: 'option-tracker', value: null,
        occurredAt: NOW, note: '', source: 'website',
        recordType: 'option', optionId: 'exercise'
      }
    ];
    const execute: OperationExecutor = () => Promise.reject(
      new RepositoryError('network', 'Still offline')
    );
    const { queue, service } = createHarness({
      trackers: [optionTracker],
      logs,
      settings: { theme: 'light', confirmDelete: true },
      execute
    });
    enqueue(queue, {
      id: 'pending-option-edit',
      type: 'upsertTracker',
      payload: pendingTracker,
      createdAt: NOW,
      retryCount: 0
    });

    const state = await service.load({ hasPendingOperations: true });

    expect(state.trackers).toEqual([pendingTracker]);
    expect(state.logs.map(log => log.id)).toEqual(['exercise-log']);
  });

  it('reloads cloud state after a destructive failure without executing queued operations', async () => {
    const events: string[] = [];
    const execute: OperationExecutor = operation => {
      events.push(`sync:${operation.id}`);
      return Promise.resolve();
    };
    const { queue, trackers, settings, service } = createHarness({
      trackers: [makeTracker()],
      logs: [makeLog()],
      settings: { theme: 'light', confirmDelete: true },
      execute,
      onTrackerList: () => events.push('load:trackers')
    });
    enqueue(queue, {
      id: 'pending-settings', type: 'saveSettings',
      payload: { theme: 'dark', confirmDelete: false },
      createdAt: NOW, retryCount: 0
    });

    const state = await service.reload();

    expect(events).toEqual(['load:trackers']);
    expect(state.settings).toEqual({ theme: 'dark', confirmDelete: false });
    expect(trackers.upserted).toEqual([]);
    expect(settings.saved).toEqual([]);
    expect(queue.load('user-1')).toHaveLength(1);
  });
});
