import { makeDefaultTrackers } from '../domain/defaults';
import type { AppState } from '../domain/models';
import type { OfflineOperation } from '../domain/operations';
import { blankState, normalizeState } from '../domain/schemas';
import type { AppStore } from '../state/app-store';
import type { UserCache } from './cache';
import type { OfflineQueue } from './offline-queue';
import type {
  LogRepository,
  SettingsRepository,
  TrackerRepository
} from './repository-types';
import type { SyncService } from './sync-service';

export interface CloudStateService {
  load(options: { hasPendingOperations: boolean }): Promise<AppState>;
  reload(): Promise<AppState>;
}

function applyOperation(state: AppState, operation: OfflineOperation): AppState {
  if (operation.type === 'upsertTracker') {
    const existing = state.trackers.find(tracker => tracker.id === operation.payload.id);
    const retainedOptionIds = new Set(operation.payload.options.map(option => option.id));
    const removedOptionIds = new Set(
      existing?.options
        .filter(option => !retainedOptionIds.has(option.id))
        .map(option => option.id) ?? []
    );
    return {
      ...state,
      trackers: existing !== undefined
        ? state.trackers.map(tracker => (
            tracker.id === operation.payload.id ? operation.payload : tracker
          ))
        : [...state.trackers, operation.payload],
      logs: state.logs.filter(log => (
        log.optionId === null || !removedOptionIds.has(log.optionId)
      ))
    };
  }

  if (operation.type === 'deleteTracker') {
    return {
      ...state,
      trackers: state.trackers.filter(tracker => tracker.id !== operation.payload.id),
      logs: state.logs.filter(log => log.trackerId !== operation.payload.id)
    };
  }

  if (operation.type === 'upsertLog') {
    const exists = state.logs.some(log => log.id === operation.payload.id);
    return {
      ...state,
      logs: exists
        ? state.logs.map(log => log.id === operation.payload.id ? operation.payload : log)
        : [...state.logs, operation.payload]
    };
  }

  if (operation.type === 'deleteLog') {
    return {
      ...state,
      logs: state.logs.filter(log => log.id !== operation.payload.id)
    };
  }

  return { ...state, settings: operation.payload };
}

class CloudStateServiceImplementation implements CloudStateService {
  constructor(
    private readonly userId: string,
    private readonly store: AppStore,
    private readonly cache: UserCache,
    private readonly queue: OfflineQueue,
    private readonly syncService: SyncService,
    private readonly trackerRepository: TrackerRepository,
    private readonly logRepository: LogRepository,
    private readonly settingsRepository: SettingsRepository,
    private readonly createId: () => string,
    private readonly now: () => string
  ) {}

  async load(options: { hasPendingOperations: boolean }): Promise<AppState> {
    await this.syncService.sync(this.userId);
    const remainingOperations = this.queue.load(this.userId);

    const [trackers, logs, settings] = await Promise.all([
      this.trackerRepository.list(),
      this.logRepository.listAll(),
      this.settingsRepository.get()
    ]);

    const shouldSeed = trackers.length === 0
      && settings === null
      && !options.hasPendingOperations
      && remainingOperations.length === 0;

    let cloudState: AppState;
    if (shouldSeed) {
      const defaultTrackers = makeDefaultTrackers(this.createId, this.now);
      const defaultSettings = blankState().settings;
      await Promise.all([
        ...defaultTrackers.map(tracker => this.trackerRepository.upsert(tracker)),
        this.settingsRepository.save(defaultSettings)
      ]);
      cloudState = normalizeState({
        version: 4,
        trackers: defaultTrackers,
        logs,
        settings: defaultSettings
      });
    } else {
      cloudState = normalizeState({
        version: 4,
        trackers,
        logs,
        settings: settings ?? blankState().settings
      });
    }

    const state = remainingOperations.reduce(applyOperation, cloudState);
    this.store.replace(state);
    this.cache.save(this.userId, state);
    return this.store.getState();
  }

  async reload(): Promise<AppState> {
    const remainingOperations = this.queue.load(this.userId);
    const [trackers, logs, settings] = await Promise.all([
      this.trackerRepository.list(),
      this.logRepository.listAll(),
      this.settingsRepository.get()
    ]);
    const cloudState = normalizeState({
      version: 4,
      trackers,
      logs,
      settings: settings ?? blankState().settings
    });
    const state = remainingOperations.reduce(applyOperation, cloudState);
    this.store.replace(state);
    this.cache.save(this.userId, state);
    return this.store.getState();
  }
}

export const CloudStateService = CloudStateServiceImplementation;
