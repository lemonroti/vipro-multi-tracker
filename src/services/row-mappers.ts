import type {
  ThemePreference,
  Tracker,
  TrackingLog,
  UserSettings
} from '../domain/models';

export interface TrackerRow {
  id: string;
  user_id: string;
  name: string;
  unit: string;
  icon: string;
  color: string;
  daily_goal: number | string | null;
  quick_values: Array<number | string> | null;
  is_active: boolean;
  sort_order: number | null;
  created_at: string;
}

export type TrackerWriteRow = Omit<TrackerRow, 'created_at'>;

export interface TrackingLogRow {
  id: string;
  user_id: string;
  tracker_id: string;
  value: number | string;
  occurred_at: string;
  note: string | null;
  source: string | null;
  client_id: string | null;
}

export interface TrackingLogWriteRow extends Omit<TrackingLogRow, 'client_id'> {
  client_id: string;
}

interface SettingsPreferences {
  confirmDelete?: unknown;
}

export interface UserSettingsRow {
  user_id: string;
  theme: ThemePreference | null;
  preferences: SettingsPreferences | null;
  dashboard_layout: Record<string, unknown> | null;
}

export interface UserSettingsWriteRow extends Omit<UserSettingsRow, 'theme' | 'preferences' | 'dashboard_layout'> {
  theme: ThemePreference;
  preferences: { confirmDelete: boolean };
  dashboard_layout: Record<string, never>;
}

export function trackerFromRow(row: TrackerRow): Tracker {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    icon: row.icon,
    color: row.color,
    goal: row.daily_goal === null ? null : Number(row.daily_goal),
    presets: (row.quick_values ?? [1]).map(Number),
    inputType: 'unit',
    options: [],
    active: row.is_active,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at
  };
}

export function trackerToRow(tracker: Tracker, userId: string): TrackerWriteRow {
  if (tracker.inputType !== 'unit') {
    throw new Error('Option trackers are not supported by the version 3 row mapper.');
  }
  return {
    id: tracker.id,
    user_id: userId,
    name: tracker.name,
    unit: tracker.unit,
    icon: tracker.icon,
    color: tracker.color,
    daily_goal: tracker.goal,
    quick_values: tracker.presets,
    is_active: tracker.active,
    sort_order: tracker.sortOrder || 0
  };
}

export function logFromRow(row: TrackingLogRow): TrackingLog {
  return {
    id: row.id,
    trackerId: row.tracker_id,
    value: Number(row.value),
    recordType: 'unit',
    optionId: null,
    occurredAt: row.occurred_at,
    note: row.note || '',
    source: row.source || 'website'
  };
}

export function logToRow(log: TrackingLog, userId: string): TrackingLogWriteRow {
  if (log.recordType !== 'unit') {
    throw new Error('Option logs are not supported by the version 3 row mapper.');
  }
  return {
    id: log.id,
    user_id: userId,
    tracker_id: log.trackerId,
    value: log.value,
    occurred_at: log.occurredAt,
    note: log.note || null,
    source: log.source || 'website',
    client_id: log.id
  };
}

export function settingsFromRow(row: UserSettingsRow): UserSettings {
  return {
    theme: row.theme || 'system',
    confirmDelete: row.preferences?.confirmDelete !== false
  };
}

export function settingsToRow(
  settings: UserSettings,
  userId: string
): UserSettingsWriteRow {
  return {
    user_id: userId,
    theme: settings.theme || 'system',
    preferences: { confirmDelete: settings.confirmDelete !== false },
    dashboard_layout: {}
  };
}
