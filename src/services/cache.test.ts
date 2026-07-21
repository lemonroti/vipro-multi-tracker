import { describe, expect, it } from 'vitest';
import { blankState } from '../domain/schemas';
import { UserCache } from './cache';

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

describe('UserCache', () => {
  it('saves, normalizes, and removes state for one user', () => {
    const storage = new MemoryStorage();
    const cache = new UserCache(storage);

    cache.save('user-a', {
      ...blankState(),
      settings: { theme: 'dark', confirmDelete: false }
    });

    expect(cache.load('user-a').settings).toEqual({ theme: 'dark', confirmDelete: false });

    cache.remove('user-a');
    expect(cache.load('user-a')).toEqual(blankState());
  });

  it.each(['{malformed', JSON.stringify('invalid')])(
    'returns blank state for unusable cached data: %s',
    cached => {
      const storage = new MemoryStorage();
      const cache = new UserCache(storage);
      storage.setItem('vipro-multi-tracker-cache-v3-user-a', cached);

      expect(cache.load('user-a')).toEqual(blankState());
    }
  );

  it('isolates cache entries by account', () => {
    const storage = new MemoryStorage();
    const cache = new UserCache(storage);
    const userAState = {
      ...blankState(),
      settings: { theme: 'light' as const, confirmDelete: false }
    };

    cache.save('user-a', userAState);

    expect(cache.load('user-b')).toEqual(blankState());
    expect(storage.getItem('vipro-multi-tracker-cache-v3-user-a')).not.toBeNull();
    expect(storage.getItem('vipro-multi-tracker-cache-v3-user-b')).toBeNull();
  });
});
