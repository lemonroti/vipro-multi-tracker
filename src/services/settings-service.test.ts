import { describe, expect, it, vi } from 'vitest';
import type { UserSettings } from '../domain/models';
import { blankState } from '../domain/schemas';
import { createAppStore } from '../state/app-store';
import { UserCache } from './cache';
import { OfflineQueue } from './offline-queue';
import { RepositoryError } from './repository-types';
import { SettingsService } from './settings-service';
import { SyncService } from './sync-service';

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

function createHarness(execute = vi.fn(() => Promise.resolve())) {
  const storage = new MemoryStorage();
  const initial = { ...blankState(), settings: { theme: 'light' as const, confirmDelete: true } };
  const store = createAppStore(initial);
  const cache = new UserCache(storage);
  const queue = new OfflineQueue(storage);
  const sync = new SyncService(store, cache, queue, execute, () => true);
  const service = new SettingsService(
    'user-1', store, cache, sync,
    () => 'operation-settings',
    () => NOW
  );
  return { initial, store, cache, execute, service };
}

describe('SettingsService', () => {
  it('saves settings optimistically with the exact persistence operation', async () => {
    const { store, execute, service } = createHarness();
    const settings: UserSettings = { theme: 'dark', confirmDelete: false };

    const result = await service.save(settings);

    expect(result).toEqual({ ok: true, queued: false });
    expect(store.getState().settings).toEqual(settings);
    expect(execute).toHaveBeenCalledWith({
      id: 'operation-settings', type: 'saveSettings', payload: settings,
      createdAt: NOW, retryCount: 0
    });
  });

  it('rejects invalid settings before mutating or persisting', async () => {
    const { initial, store, execute, service } = createHarness();
    const invalid = { theme: 'midnight', confirmDelete: true } as unknown as UserSettings;

    const result = await service.save(invalid);

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'Invalid settings input.' }
    });
    expect(store.getState()).toEqual(initial);
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns the repository error and restores settings after persistence rejects them', async () => {
    const execute = vi.fn(() => Promise.reject(
      new RepositoryError('permission', 'Settings update forbidden')
    ));
    const { initial, store, cache, service } = createHarness(execute);

    const result = await service.save({ theme: 'dark', confirmDelete: false });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'permission', message: 'Settings update forbidden' }
    });
    expect(store.getState()).toEqual(initial);
    expect(cache.load('user-1')).toEqual(initial);
  });
});
