import type { Tracker, TrackingLog, UserSettings } from './models';

export type OfflineOperation =
  | { id: string; type: 'upsertTracker'; payload: Tracker; createdAt: string; retryCount: number }
  | { id: string; type: 'deleteTracker'; payload: { id: string }; createdAt: string; retryCount: number }
  | { id: string; type: 'upsertLog'; payload: TrackingLog; createdAt: string; retryCount: number }
  | { id: string; type: 'deleteLog'; payload: { id: string }; createdAt: string; retryCount: number }
  | { id: string; type: 'saveSettings'; payload: UserSettings; createdAt: string; retryCount: number };
