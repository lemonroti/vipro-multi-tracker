import type { OfflineOperation } from '../domain/operations';
import type { AppStore } from '../state/app-store';
import type { UserCache } from './cache';
import type { OfflineQueue } from './offline-queue';
import { RepositoryError } from './repository-types';

export interface ApplicationError {
  kind: 'network' | 'validation' | 'authentication' | 'permission' | 'persistence';
  message: string;
}

export type OperationResult =
  | { ok: true; queued: boolean }
  | { ok: false; error: ApplicationError };

interface TrackerInputBase {
  id?: string;
  name: string;
  icon: string;
  color: string;
}

export type TrackerInput =
  | (TrackerInputBase & {
      inputType: 'unit';
      unit: string;
      goal: number | null;
      presets: number[];
    })
  | (TrackerInputBase & {
      inputType: 'option';
      optionLabels: string[];
    });

export interface UnitLogInput {
  recordType: 'unit';
  trackerId: string;
  value: number;
  occurredAt: string;
  note: string;
}

export interface OptionLogInput {
  recordType: 'option';
  trackerId: string;
  optionId: string;
  occurredAt: string;
  note: string;
}

export type LogInput = UnitLogInput | OptionLogInput;

export type OperationExecutor = (operation: OfflineOperation) => Promise<void>;

function applicationError(error: unknown): ApplicationError {
  if (error instanceof RepositoryError) {
    return { kind: error.kind, message: error.message };
  }

  if (error instanceof Error) {
    return { kind: 'persistence', message: error.message };
  }

  return { kind: 'persistence', message: 'Could not persist data.' };
}

export class SyncService {
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly store: AppStore,
    private readonly cache: UserCache,
    private readonly queue: OfflineQueue,
    private readonly execute: OperationExecutor,
    private readonly isOnline: () => boolean
  ) {}

  async persist(
    userId: string,
    operation: OfflineOperation,
    apply: () => void,
    rollback: () => void
  ): Promise<OperationResult> {
    apply();
    this.cache.save(userId, this.store.getState());

    if (!this.isOnline()) {
      this.queue.enqueue(userId, operation);
      return { ok: true, queued: true };
    }

    try {
      await this.execute(operation);
      return { ok: true, queued: false };
    } catch (error) {
      const mappedError = applicationError(error);
      if (mappedError.kind === 'network') {
        this.queue.enqueue(userId, operation);
        return { ok: true, queued: true };
      }

      rollback();
      this.cache.save(userId, this.store.getState());
      return { ok: false, error: mappedError };
    }
  }

  sync(userId: string): Promise<void> {
    if (this.inFlight !== null) return this.inFlight;

    const execution = this.drain(userId).finally(() => {
      if (this.inFlight === execution) this.inFlight = null;
    });
    this.inFlight = execution;
    return execution;
  }

  private async drain(userId: string): Promise<void> {
    if (!this.isOnline()) return;

    for (const operation of this.queue.load(userId)) {
      try {
        await this.execute(operation);
        this.queue.remove(userId, operation.id);
      } catch {
        this.queue.incrementRetry(userId, operation.id);
        break;
      }
    }
  }
}
