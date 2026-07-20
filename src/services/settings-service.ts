import type { UserSettings } from '../domain/models';
import type { OfflineOperation } from '../domain/operations';
import { userSettingsSchema } from '../domain/schemas';
import type { AppStore } from '../state/app-store';
import type { UserCache } from './cache';
import type { OperationResult } from './sync-service';
import type { SyncService } from './sync-service';

export interface SettingsService {
  save(input: UserSettings): Promise<OperationResult>;
}

class SettingsServiceImplementation implements SettingsService {
  constructor(
    private readonly userId: string,
    private readonly store: AppStore,
    cache: UserCache,
    private readonly syncService: SyncService,
    private readonly createId: () => string,
    private readonly now: () => string
  ) {
    void cache;
  }

  async save(input: UserSettings): Promise<OperationResult> {
    const parsed = userSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: { kind: 'validation', message: 'Invalid settings input.' }
      };
    }

    const before = this.store.getState();
    const operation: OfflineOperation = {
      id: this.createId(),
      type: 'saveSettings',
      payload: parsed.data,
      createdAt: this.now(),
      retryCount: 0
    };

    return this.syncService.persist(
      this.userId,
      operation,
      () => this.store.update(state => ({ ...state, settings: parsed.data })),
      () => this.store.replace(before)
    );
  }
}

export const SettingsService = SettingsServiceImplementation;
