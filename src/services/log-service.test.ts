import { describe, expect, it, vi } from 'vitest';
import type {
  AppState,
  OptionTrackingLog,
  TrackingLog,
  UnitTrackingLog
} from '../domain/models';
import { blankState } from '../domain/schemas';
import { createAppStore } from '../state/app-store';
import { UserCache } from './cache';
import { LogService } from './log-service';
import { OfflineQueue } from './offline-queue';
import { RepositoryError } from './repository-types';
import {
  SyncService,
  type LogInput,
  type OptionLogInput,
  type UnitLogInput
} from './sync-service';

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
const INPUT: UnitLogInput = {
  recordType: 'unit',
  trackerId: 'tracker-1',
  value: 250,
  occurredAt: '2026-07-21T07:00:00.000Z',
  note: 'Morning'
};
const OPTION_INPUT: OptionLogInput = {
  recordType: 'option',
  trackerId: 'option-tracker',
  optionId: 'wake',
  occurredAt: '2026-07-21T07:00:00.000Z',
  note: 'Morning'
};

function makeOptionTracker() {
  return {
    id: 'option-tracker',
    name: 'Routine',
    inputType: 'option' as const,
    unit: null,
    icon: '✦',
    color: '#334155',
    goal: null,
    presets: [] as [],
    options: [
      { id: 'sleep', label: 'Sleep', sortOrder: 0, createdAt: NOW },
      { id: 'wake', label: 'Wake', sortOrder: 1, createdAt: NOW }
    ],
    active: true,
    sortOrder: 1,
    createdAt: NOW
  };
}

function makeOptionLog(overrides: Partial<OptionTrackingLog> = {}): OptionTrackingLog {
  return {
    id: 'option-log',
    ...OPTION_INPUT,
    value: null,
    source: 'mobile',
    ...overrides
  };
}

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
  it('adds an Option log with a null numeric value and persists its exact operation', async () => {
    const initial = makeState([]);
    initial.trackers.push(makeOptionTracker());
    const { store, execute, service } = createHarness(initial, undefined, [
      'option-log-new', 'operation-add'
    ]);

    const result = await service.add(OPTION_INPUT);

    const log = {
      id: 'option-log-new', ...OPTION_INPUT, value: null, source: 'website'
    };
    expect(result).toEqual({ ok: true, queued: false });
    expect(store.getState().logs).toEqual([log]);
    expect(execute).toHaveBeenCalledWith({
      id: 'operation-add', type: 'upsertLog', payload: log,
      createdAt: NOW, retryCount: 0
    });
  });

  it('updates an Option log while preserving its original source', async () => {
    const initial = makeState([makeOptionLog()]);
    initial.trackers.push(makeOptionTracker());
    const { store, execute, service } = createHarness(initial, undefined, ['operation-update']);
    const input: LogInput = { ...OPTION_INPUT, optionId: 'sleep', note: 'Evening' };

    const result = await service.update('option-log', input);

    const updated = makeOptionLog({ optionId: 'sleep', note: 'Evening' });
    expect(result).toEqual({ ok: true, queued: false });
    expect(store.getState().logs).toEqual([updated]);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      id: 'operation-update', type: 'upsertLog', payload: updated
    }));
  });

  it('rejects an Option that belongs to another tracker', async () => {
    const initial = makeState([]);
    initial.trackers.push(makeOptionTracker(), {
      ...makeOptionTracker(),
      id: 'other-option-tracker',
      options: [{ id: 'other-option', label: 'Other', sortOrder: 0, createdAt: NOW }]
    });
    const { store, execute, service } = createHarness(initial);

    const result = await service.add({ ...OPTION_INPUT, optionId: 'other-option' });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'Invalid log input.' }
    });
    expect(store.getState()).toEqual(initial);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects an Option input for a Unit tracker', async () => {
    const initial = makeState([]);
    const { store, execute, service } = createHarness(initial);

    const result = await service.add({
      ...OPTION_INPUT,
      trackerId: 'tracker-1'
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'Invalid log input.' }
    });
    expect(store.getState()).toEqual(initial);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects an Option that was deleted from its tracker', async () => {
    const initial = makeState([]);
    initial.trackers.push(makeOptionTracker());
    const { store, execute, service } = createHarness(initial);

    const result = await service.add({ ...OPTION_INPUT, optionId: 'deleted-option' });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'Invalid log input.' }
    });
    expect(store.getState()).toEqual(initial);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects adding a Unit log to an Option tracker', async () => {
    const initial: AppState = {
      ...blankState(),
      trackers: [makeOptionTracker()]
    };
    const { store, execute, service } = createHarness(initial);

    const result = await service.add({ ...INPUT, trackerId: 'option-tracker' });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'Invalid log input.' }
    });
    expect(store.getState()).toEqual(initial);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects moving a Unit log to an Option tracker', async () => {
    const initial = makeState();
    initial.trackers.push(makeOptionTracker());
    const { store, execute, service } = createHarness(initial);

    const result = await service.update('log-1', {
      ...INPUT,
      trackerId: 'option-tracker'
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'Invalid log input.' }
    });
    expect(store.getState()).toEqual(initial);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects editing an existing Option log with Unit input', async () => {
    const initial = makeState([]);
    initial.trackers.push(makeOptionTracker());
    initial.logs.push({
      id: 'option-log',
      trackerId: 'option-tracker',
      recordType: 'option',
      value: null,
      optionId: 'sleep',
      occurredAt: NOW,
      note: '',
      source: 'website'
    });
    const { store, execute, service } = createHarness(initial);

    const result = await service.update('option-log', INPUT);

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'Invalid log input.' }
    });
    expect(store.getState()).toEqual(initial);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects editing an existing Unit log with Option input', async () => {
    const initial = makeState();
    initial.trackers.push(makeOptionTracker());
    const { store, execute, service } = createHarness(initial);

    const result = await service.update('log-1', OPTION_INPUT);

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'Invalid log input.' }
    });
    expect(store.getState()).toEqual(initial);
    expect(execute).not.toHaveBeenCalled();
  });

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

  it('deletes and undoes Option logs without converting their record type', async () => {
    const optionLog = makeOptionLog({ occurredAt: '2026-07-21T09:00:00.000Z' });
    const initial = makeState([makeLog(), optionLog]);
    initial.trackers.push(makeOptionTracker());
    const { store, execute, service } = createHarness(initial, undefined, [
      'operation-delete', 'operation-undo'
    ]);

    expect(await service.delete('option-log')).toEqual({ ok: true, queued: false });
    expect(store.getState().logs).toEqual([makeLog()]);
    expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 'operation-delete', type: 'deleteLog', payload: { id: 'option-log' }
    }));

    store.replace(initial);
    expect(await service.undoLast()).toEqual({ ok: true, queued: false });
    expect(store.getState().logs).toEqual([makeLog()]);
    expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
      id: 'operation-undo', type: 'deleteLog', payload: { id: 'option-log' }
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

  it('restores an Option log when persistence rejects its update', async () => {
    const initial = makeState([makeOptionLog()]);
    initial.trackers.push(makeOptionTracker());
    const execute = vi.fn(() => Promise.reject(
      new RepositoryError('validation', 'Log rejected')
    ));
    const { store, cache, service } = createHarness(initial, execute, ['operation-update']);

    const result = await service.update('option-log', {
      ...OPTION_INPUT,
      optionId: 'sleep'
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'Log rejected' }
    });
    expect(store.getState()).toEqual(initial);
    expect(cache.load('user-1')).toEqual(initial);
  });
});
