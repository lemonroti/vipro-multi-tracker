export type ThemePreference = 'system' | 'light' | 'dark';

export interface TrackerOption {
  id: string;
  label: string;
  sortOrder: number;
  createdAt: string;
}

interface TrackerBase {
  id: string;
  name: string;
  icon: string;
  color: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface UnitTracker extends TrackerBase {
  inputType: 'unit';
  unit: string;
  goal: number | null;
  presets: number[];
  options: [];
}

export interface OptionTracker extends TrackerBase {
  inputType: 'option';
  unit: null;
  goal: null;
  presets: [];
  options: TrackerOption[];
}

export type Tracker = UnitTracker | OptionTracker;

interface TrackingLogBase {
  id: string;
  trackerId: string;
  occurredAt: string;
  note: string;
  source: string;
}

export interface UnitTrackingLog extends TrackingLogBase {
  recordType: 'unit';
  value: number;
  optionId: null;
}

export interface OptionTrackingLog extends TrackingLogBase {
  recordType: 'option';
  value: null;
  optionId: string;
}

export type TrackingLog = UnitTrackingLog | OptionTrackingLog;

export interface UserSettings {
  theme: ThemePreference;
  confirmDelete: boolean;
}

export interface AppState {
  version: 4;
  trackers: Tracker[];
  logs: TrackingLog[];
  settings: UserSettings;
}
