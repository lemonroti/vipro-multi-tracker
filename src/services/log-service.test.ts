import { describe, expect, it, vi } from 'vitest';
import type { AppState, TrackingLog, UnitTrackingLog } from '../domain/models';
import { blankState } from '../domain/schemas';
import { createAppStore } from '../state/app-store';
import { UserCache } from './cache';
import { LogService } from './log-service';
import { OfflineQueue } from './offline-queue';
import { RepositoryError } from './repository-types';
import { SyncService, type LogInput } from './sync-service';

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
const INPUT: LogInput = {
  trackerId: 'tracker-1',
  value: 250,
  occurredAt: '2026-07-21T07:00:00.000Z',
  note: 'Morning'
};

function makeLog(overrides: Partial<UnitTrackingLog> = {}): UnitTrackingLog {
  return {
    id: 'log-1',
    ...INPUT,
    recordType: 'unit',
    optionId: null,
    source: 'website',
    ...overrides
  };
}

function makeState(logs: TrackingLog[] = [makeLog()]): AppState {
  return {
    ...blankState(),
    trackers: [{
      id: 'tracker-1', name: 'Water', unit: 'ml', icon: '💧', color: '#2563eb',
      goal: 2000, presets: [250], active: true, sortOrder: 0, createdAt: NOW,
      inputType: 'unit', options: []
    }],
    logs
  };
}

function createHarness(
  state = makeState(),
  execute = vi.fn(() => Promise.resolve()),
  ids: string[] = []
) {
  const storage = new MemoryStorage();
  const store = createAppStore(state);
  const cache = new UserCache(storage);
  const queue = new OfflineQueue(storage);
  const sync = new SyncService(store, cache, queue, execute, () => true);
  const service = new LogService(
    'user-1', store, cache, sync,
    () => ids.shift() ?? 'generated-id',
    () => NOW
  );
  return { store, cache, execute, service };
}

describe('LogService', () => {
  it('adds a log and persists its exact operation', async () => {
    const { store, execute, service } = createHarness(makeState([]), undefined, [
      'log-new', 'operation-add'
    ]);

    const result = await service.add(INPUT);

    const log = {
      id: 'log-new', ...INPUT, source: 'website', recordType: 'unit', optionId: null
    };
    expect(result).toEqual({ ok: true, queued: false });
    expect(store.getState().logs).toEqual([log]);
    expect(execute).toHaveBeenCalledWith({
      id: 'operation-add',
      type: 'upsertLog',
      payload: log,
      createdAt: NOW,
      retryCount: 0
    });
  });

  it('updates a log and persists the replacement payload', async () => {
    const { store, execute, service } = createHarness(undefined, undefined, ['operation-update']);
    const input = { ...INPUT, value: 500, note: 'Larger glass' };

    await service.update('log-1', input);

    const updated = makeLog({ value: 500, note: 'Larger glass' });
    expect(store.getState().logs).toEqual([updated]);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      id: 'operation-update', type: 'upsertLog', payload: updated
    }));
  });

  it('deletes a log and persists its identity', async () => {
    const { store, execute, service } = createHarness(undefined, undefined, ['operation-delete']);

    await service.delete('log-1');

    expect(store.getState().logs).toEqual([]);
    expect(execute).toHaveBeenCalledWith({
      id: 'operation-delete', type: 'deleteLog', payload: { id: 'log-1' },
      createdAt: NOW, retryCount: 0
    });
  });

  it('undoes the most recently occurred log', async () => {
    const older = makeLog({ id: 'older', occurredAt: '2026-07-21T06:00:00.000Z' });
    const newer = makeLog({ id: 'newer', occurredAt: '2026-07-21T09:00:00.000Z' });
    const { store, execute, service } = createHarness(makeState([older, newer]), undefined, [
      'operation-undo'
    ]);

    const result = await service.undoLast();

    expect(result).toEqual({ ok: true, queued: false });
    expect(store.getState().logs).toEqual([older]);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      id: 'operation-undo', type: 'deleteLog', payload: { id: 'newer' }
    }));
  });

  it('returns null when there is no log to undo', async () => {
    const { execute, service } = createHarness(makeState([]));

    expect(await service.undoLast()).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects invalid input before mutating or persisting', async () => {
    const initial = makeState();
    const { store, execute, service } = createHarness(initial);

    const result = await service.add({ ...INPUT, value: 0 });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'Invalid log input.' }
    });
    expect(store.getState()).toEqual(initial);
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns the repository error and restores state when persistence rejects a change', async () => {
    const initial = makeState();
    const execute = vi.fn(() => Promise.reject(
      new RepositoryError('validation', 'Log rejected')
    ));
    const { store, cache, service } = createHarness(initial, execute, ['operation-delete']);

    const result = await service.delete('log-1');

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'Log rejected' }
    });
    expect(store.getState()).toEqual(initial);
    expect(cache.load('user-1')).toEqual(initial);
  });
});
