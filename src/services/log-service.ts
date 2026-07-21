import type { TrackingLog } from '../domain/models';
import type { OfflineOperation } from '../domain/operations';
import { trackingLogSchema } from '../domain/schemas';
import type { AppStore } from '../state/app-store';
import type { UserCache } from './cache';
import type { LogInput, OperationResult } from './sync-service';
import type { SyncService } from './sync-service';

export interface LogService {
  add(input: LogInput): Promise<OperationResult>;
  update(id: string, input: LogInput): Promise<OperationResult>;
  delete(id: string): Promise<OperationResult>;
  undoLast(): Promise<OperationResult | null>;
}

function validationError(): OperationResult {
  return {
    ok: false,
    error: { kind: 'validation', message: 'Invalid log input.' }
  };
}

class LogServiceImplementation implements LogService {
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

  async add(input: LogInput): Promise<OperationResult> {
    const before = this.store.getState();
    const tracker = before.trackers.find(candidate => candidate.id === input.trackerId);
    if (tracker?.inputType !== 'unit') {
      return validationError();
    }

    const parsed = trackingLogSchema.safeParse({
      id: this.createId(),
      ...input,
      recordType: 'unit',
      optionId: null,
      source: 'website'
    });
    if (!parsed.success) return validationError();

    return this.persistUpsert(before, parsed.data, true);
  }

  async update(id: string, input: LogInput): Promise<OperationResult> {
    const before = this.store.getState();
    const existing = before.logs.find(log => log.id === id);
    const tracker = before.trackers.find(candidate => candidate.id === input.trackerId);
    if (
      existing?.recordType !== 'unit'
      || tracker?.inputType !== 'unit'
    ) {
      return validationError();
    }

    const parsed = trackingLogSchema.safeParse({
      id,
      ...input,
      recordType: 'unit',
      optionId: null,
      source: existing.source
    });
    if (!parsed.success) return validationError();

    return this.persistUpsert(before, parsed.data, false);
  }

  async delete(id: string): Promise<OperationResult> {
    const before = this.store.getState();
    if (!before.logs.some(log => log.id === id)) return validationError();

    const operation: OfflineOperation = {
      id: this.createId(),
      type: 'deleteLog',
      payload: { id },
      createdAt: this.now(),
      retryCount: 0
    };

    return this.syncService.persist(
      this.userId,
      operation,
      () => this.store.update(state => ({
        ...state,
        logs: state.logs.filter(log => log.id !== id)
      })),
      () => this.store.replace(before)
    );
  }

  async undoLast(): Promise<OperationResult | null> {
    const logs = this.store.getState().logs;
    if (logs.length === 0) return null;

    const latest = logs.reduce((candidate, log) => (
      log.occurredAt > candidate.occurredAt ? log : candidate
    ));
    return this.delete(latest.id);
  }

  private persistUpsert(
    before: ReturnType<AppStore['getState']>,
    log: TrackingLog,
    isNew: boolean
  ): Promise<OperationResult> {
    const operation: OfflineOperation = {
      id: this.createId(),
      type: 'upsertLog',
      payload: log,
      createdAt: this.now(),
      retryCount: 0
    };

    return this.syncService.persist(
      this.userId,
      operation,
      () => this.store.update(state => ({
        ...state,
        logs: isNew
          ? [...state.logs, log]
          : state.logs.map(candidate => candidate.id === log.id ? log : candidate)
      })),
      () => this.store.replace(before)
    );
  }
}

export const LogService = LogServiceImplementation;
