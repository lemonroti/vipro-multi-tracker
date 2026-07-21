import { describe, expect, it, vi } from 'vitest';
import type { OfflineOperation } from '../domain/operations';
import { blankState } from '../domain/schemas';
import { createAppStore } from '../state/app-store';
import { UserCache } from './cache';
import { OfflineQueue } from './offline-queue';
import { RepositoryError } from './repository-types';
import { SyncService } from './sync-service';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function makeOperation(id: string): OfflineOperation {
  return {
    id,
    type: 'saveSettings',
    payload: { theme: 'dark', confirmDelete: true },
    createdAt: '2026-07-21T00:00:00.000Z',
    retryCount: 0
  };
}

function createDependencies() {
  const storage = new MemoryStorage();
  return {
    store: createAppStore(),
    cache: new UserCache(storage),
    queue: new OfflineQueue(storage)
  };
}

describe('SyncService.persist', () => {
  it('applies, caches, and queues an optimistic operation once while offline', async () => {
    const { store, cache, queue } = createDependencies();
    const execute = vi.fn(() => Promise.resolve());
    const service = new SyncService(store, cache, queue, execute, () => false);
    const operation = makeOperation('operation-1');

    const result = await service.persist(
      'user-1',
      operation,
      () => store.update(state => ({
        ...state,
        settings: { theme: 'dark', confirmDelete: true }
      })),
      () => store.replace(blankState())
    );

    expect(result).toEqual({ ok: true, queued: true });
    expect(store.getState().settings.theme).toBe('dark');
    expect(cache.load('user-1').settings.theme).toBe('dark');
    expect(queue.load('user-1')).toEqual([operation]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps optimistic state and queues when the repository reports a network error', async () => {
    const { store, cache, queue } = createDependencies();
    const execute = vi.fn(() => Promise.reject(
      new RepositoryError('network', 'Cloud unavailable')
    ));
    const operation = makeOperation('operation-1');
    const service = new SyncService(store, cache, queue, execute, () => true);

    const result = await service.persist(
      'user-1',
      operation,
      () => store.update(state => ({
        ...state,
        settings: { theme: 'dark', confirmDelete: true }
      })),
      () => store.replace(blankState())
    );

    expect(result).toEqual({ ok: true, queued: true });
    expect(store.getState().settings.theme).toBe('dark');
    expect(cache.load('user-1').settings.theme).toBe('dark');
    expect(queue.load('user-1')).toEqual([operation]);
  });

  it.each(['permission', 'validation'] as const)(
    'rolls back optimistic state after a %s error',
    async kind => {
      const { store, cache, queue } = createDependencies();
      const before = store.getState();
      const execute = vi.fn(() => Promise.reject(
        new RepositoryError(kind, `Rejected: ${kind}`)
      ));
      const service = new SyncService(store, cache, queue, execute, () => true);

      const result = await service.persist(
        'user-1',
        makeOperation('operation-1'),
        () => store.update(state => ({
          ...state,
          settings: { theme: 'dark', confirmDelete: true }
        })),
        () => store.replace(before)
      );

      expect(result).toEqual({
        ok: false,
        error: { kind, message: `Rejected: ${kind}` }
      });
      expect(store.getState()).toEqual(before);
      expect(cache.load('user-1')).toEqual(before);
      expect(queue.load('user-1')).toEqual([]);
    }
  );

  it('does not queue a successful online persistence', async () => {
    const { store, cache, queue } = createDependencies();
    const execute = vi.fn(() => Promise.resolve());
    const operation = makeOperation('operation-1');
    const service = new SyncService(store, cache, queue, execute, () => true);

    const result = await service.persist(
      'user-1',
      operation,
      () => store.update(state => ({
        ...state,
        settings: { theme: 'dark', confirmDelete: true }
      })),
      () => store.replace(blankState())
    );

    expect(result).toEqual({ ok: true, queued: false });
    expect(execute).toHaveBeenCalledWith(operation);
    expect(cache.load('user-1')).toEqual(store.getState());
    expect(queue.load('user-1')).toEqual([]);
  });
});

describe('SyncService.sync', () => {
  it('executes queued operations in order and removes only successful operations', async () => {
    const { store, cache, queue } = createDependencies();
    const first = makeOperation('first');
    const second = makeOperation('second');
    const third = makeOperation('third');
    queue.enqueue('user-1', first);
    queue.enqueue('user-1', second);
    queue.enqueue('user-1', third);
    const attempted: string[] = [];
    const service = new SyncService(
      store,
      cache,
      queue,
      operation => {
        attempted.push(operation.id);
        if (operation.id === 'second') {
          return Promise.reject(new RepositoryError('network', 'Offline'));
        }
        return Promise.resolve();
      },
      () => true
    );

    await service.sync('user-1');

    expect(attempted).toEqual(['first', 'second']);
    expect(queue.load('user-1')).toEqual([
      { ...second, retryCount: 1 },
      third
    ]);
  });

  it('returns one shared execution to concurrent callers', async () => {
    const { store, cache, queue } = createDependencies();
    queue.enqueue('user-1', makeOperation('operation-1'));
    let release: (() => void) | undefined;
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });
    const execute = vi.fn(() => blocked);
    const service = new SyncService(store, cache, queue, execute, () => true);

    const first = service.sync('user-1');
    const second = service.sync('user-1');

    expect(second).toBe(first);
    expect(execute).toHaveBeenCalledTimes(1);

    release?.();
    await first;
    expect(queue.load('user-1')).toEqual([]);
  });
});
