import type { Tracker, TrackerOption } from '../domain/models';
import type { OfflineOperation } from '../domain/operations';
import { trackerSchema } from '../domain/schemas';
import { reconcileTrackerOptions } from '../domain/tracker-options';
import type { AppStore } from '../state/app-store';
import type { UserCache } from './cache';
import type {
  ApplicationError,
  OperationResult,
  TrackerInput
} from './sync-service';
import type { SyncService } from './sync-service';

export interface TrackerSaveImpact {
  removedOptions: TrackerOption[];
  removedRecordCount: number;
}

export type TrackerAnalysisResult =
  | { ok: true; impact: TrackerSaveImpact }
  | { ok: false; error: ApplicationError };

export interface TrackerService {
  analyze(input: TrackerInput): TrackerAnalysisResult;
  save(input: TrackerInput): Promise<OperationResult>;
  toggle(id: string): Promise<OperationResult>;
  delete(id: string): Promise<OperationResult>;
}

const INVALID_TRACKER_ERROR: ApplicationError = {
  kind: 'validation',
  message: 'Invalid tracker input.'
};

const LOCKED_INPUT_TYPE_ERROR: ApplicationError = {
  kind: 'validation',
  message: 'Tracker input type cannot be changed after records exist.'
};

interface PreparedTracker {
  tracker: Tracker;
  impact: TrackerSaveImpact;
}

function validationError(error: ApplicationError = INVALID_TRACKER_ERROR): OperationResult {
  return { ok: false, error };
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

  analyze(input: TrackerInput): TrackerAnalysisResult {
    const prepared = this.prepare(
      input,
      (() => {
        let index = 0;
        return () => `analysis-option-${index++}`;
      })(),
      'analysis'
    );
    if ('error' in prepared) return { ok: false, error: prepared.error };
    return { ok: true, impact: prepared.impact };
  }

  async save(input: TrackerInput): Promise<OperationResult> {
    const before = this.store.getState();
    const analysis = this.analyze(input);
    if (!analysis.ok) return validationError(analysis.error);

    const timestamp = this.now();
    const prepared = this.prepare(input, this.createId, timestamp);
    if ('error' in prepared) return validationError(prepared.error);
    const removedOptionIds = new Set(prepared.impact.removedOptions.map(option => option.id));

    const operation: OfflineOperation = {
      id: this.createId(),
      type: 'upsertTracker',
      payload: prepared.tracker,
      createdAt: timestamp,
      retryCount: 0
    };

    return this.syncService.persist(
      this.userId,
      operation,
      () => this.store.update(state => ({
        ...state,
        trackers: input.id === undefined
          ? [...state.trackers, prepared.tracker]
          : state.trackers.map(candidate => (
              candidate.id === prepared.tracker.id ? prepared.tracker : candidate
            )),
        logs: state.logs.filter(log => (
          log.optionId === null || !removedOptionIds.has(log.optionId)
        ))
      })),
      () => this.store.replace(before)
    );
  }

  private prepare(
    input: TrackerInput,
    createId: () => string,
    timestamp: string
  ): PreparedTracker | { error: ApplicationError } {
    const state = this.store.getState();
    const existing = input.id === undefined
      ? undefined
      : state.trackers.find(candidate => candidate.id === input.id);
    if (input.id !== undefined && existing === undefined) {
      return { error: INVALID_TRACKER_ERROR };
    }
    if (
      existing !== undefined
      && existing.inputType !== input.inputType
      && state.logs.some(log => log.trackerId === existing.id)
    ) {
      return { error: LOCKED_INPUT_TYPE_ERROR };
    }

    const common = {
      id: existing?.id ?? createId(),
      name: input.name,
      icon: input.icon,
      color: input.color,
      active: existing?.active ?? true,
      sortOrder: existing?.sortOrder ?? state.trackers.length,
      createdAt: existing?.createdAt ?? timestamp
    };
    let tracker: Tracker;
    if (input.inputType === 'option') {
      const labels = input.optionLabels.map(label => label.trim());
      tracker = {
        ...common,
        inputType: 'option',
        unit: null,
        goal: null,
        presets: [],
        options: reconcileTrackerOptions(
          existing?.inputType === 'option' ? existing.options : [],
          labels,
          createId,
          () => timestamp
        )
      };
    } else {
      tracker = {
        ...common,
        inputType: 'unit',
        unit: input.unit,
        goal: input.goal,
        presets: input.presets,
        options: []
      };
    }

    const parsed = trackerSchema.safeParse(tracker);
    if (!parsed.success) return { error: INVALID_TRACKER_ERROR };

    const retainedOptionIds = new Set(parsed.data.options.map(option => option.id));
    const removedOptions = existing?.options.filter(option => !retainedOptionIds.has(option.id)) ?? [];
    const removedOptionIds = new Set(removedOptions.map(option => option.id));
    return {
      tracker: parsed.data,
      impact: {
        removedOptions,
        removedRecordCount: state.logs.filter(log => (
          log.optionId !== null && removedOptionIds.has(log.optionId)
        )).length
      }
    };
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
