import type { AppState, Tracker, TrackingLog, UserSettings } from '../domain/models';

export type RepositoryErrorKind =
  | 'network'
  | 'permission'
  | 'validation'
  | 'persistence';

export class RepositoryError extends Error {
  constructor(
    public readonly kind: RepositoryErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export interface TrackerRepository {
  list(): Promise<Tracker[]>;
  upsert(tracker: Tracker): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface LogRepository {
  listAll(pageSize?: number): Promise<TrackingLog[]>;
  upsert(log: TrackingLog): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<UserSettings | null>;
  save(settings: UserSettings): Promise<void>;
}

export interface BackupRepository {
  restoreState(state: AppState): Promise<void>;
}
