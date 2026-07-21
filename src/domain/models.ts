export type ThemePreference = 'system' | 'light' | 'dark';

export interface Tracker {
  id: string;
  name: string;
  unit: string;
  icon: string;
  color: string;
  goal: number | null;
  presets: number[];
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface TrackingLog {
  id: string;
  trackerId: string;
  value: number;
  occurredAt: string;
  note: string;
  source: string;
}

export interface UserSettings {
  theme: ThemePreference;
  confirmDelete: boolean;
}

export interface AppState {
  version: 3;
  trackers: Tracker[];
  logs: TrackingLog[];
  settings: UserSettings;
}
