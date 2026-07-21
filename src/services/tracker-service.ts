import type { Tracker } from '../domain/models';
import type { OfflineOperation } from '../domain/operations';
import { trackerSchema } from '../domain/schemas';
import type { AppStore } from '../state/app-store';
import type { UserCache } from './cache';
import type { OperationResult, TrackerInput } from './sync-service';
import type { SyncService } from './sync-service';

export interface TrackerService {
  save(input: TrackerInput): Promise<OperationResult>;
  toggle(id: string): Promise<OperationResult>;
  delete(id: string): Promise<OperationResult>;
}

function validationError(): OperationResult {
  return {
    ok: false,
    error: { kind: 'validation', message: 'Invalid tracker input.' }
  };
}

class TrackerServiceImplementation implements TrackerService {
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

  async save(input: TrackerInput): Promise<OperationResult> {
    const before = this.store.getState();
    const timestamp = this.now();
    let tracker: Tracker;

    if (input.id !== undefined) {
      const existing = before.trackers.find(candidate => candidate.id === input.id);
      if (!existing) return validationError();
      tracker = {
        ...existing,
        ...input,
        id: existing.id,
        inputType: 'unit',
        options: []
      };
    } else {
      tracker = {
        ...input,
        id: this.createId(),
        inputType: 'unit',
        options: [],
        active: true,
        sortOrder: before.trackers.length,
        createdAt: timestamp
      };
    }

    const parsed = trackerSchema.safeParse(tracker);
    if (!parsed.success) return validationError();

    const operation: OfflineOperation = {
      id: this.createId(),
      type: 'upsertTracker',
      payload: parsed.data,
      createdAt: timestamp,
      retryCount: 0
    };

    return this.syncService.persist(
      this.userId,
      operation,
      () => this.store.update(state => ({
        ...state,
        trackers: input.id === undefined
          ? [...state.trackers, parsed.data]
          : state.trackers.map(candidate => (
              candidate.id === parsed.data.id ? parsed.data : candidate
            ))
      })),
      () => this.store.replace(before)
    );
  }

  async toggle(id: string): Promise<OperationResult> {
    const before = this.store.getState();
    const existing = before.trackers.find(tracker => tracker.id === id);
    if (!existing) return validationError();

    const tracker = { ...existing, active: !existing.active };
    const operation: OfflineOperation = {
      id: this.createId(),
      type: 'upsertTracker',
      payload: tracker,
      createdAt: this.now(),
      retryCount: 0
    };

    return this.syncService.persist(
      this.userId,
      operation,
      () => this.store.update(state => ({
        ...state,
        trackers: state.trackers.map(candidate => candidate.id === id ? tracker : candidate)
      })),
      () => this.store.replace(before)
    );
  }

  async delete(id: string): Promise<OperationResult> {
    const before = this.store.getState();
    if (!before.trackers.some(tracker => tracker.id === id)) return validationError();

    const operation: OfflineOperation = {
      id: this.createId(),
      type: 'deleteTracker',
      payload: { id },
      createdAt: this.now(),
      retryCount: 0
    };

    return this.syncService.persist(
      this.userId,
      operation,
      () => this.store.update(state => ({
        ...state,
        trackers: state.trackers.filter(tracker => tracker.id !== id),
        logs: state.logs.filter(log => log.trackerId !== id)
      })),
      () => this.store.replace(before)
    );
  }
}

export const TrackerService = TrackerServiceImplementation;
