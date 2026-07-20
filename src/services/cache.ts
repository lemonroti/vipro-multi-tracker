import type { AppState } from '../domain/models';
import { blankState, normalizeState } from '../domain/schemas';

const CACHE_KEY_PREFIX = 'vipro-multi-tracker-cache-v3-';

function cacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

export class UserCache {
  constructor(private readonly storage: Storage) {}

  load(userId: string): AppState {
    const cached = this.storage.getItem(cacheKey(userId));
    if (cached === null) return blankState();

    try {
      return normalizeState(JSON.parse(cached));
    } catch {
      return blankState();
    }
  }

  save(userId: string, state: AppState): void {
    this.storage.setItem(cacheKey(userId), JSON.stringify(state));
  }

  remove(userId: string): void {
    this.storage.removeItem(cacheKey(userId));
  }
}
