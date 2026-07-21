import type {
  ThemePreference,
  Tracker,
  TrackerOption,
  TrackingLog,
  UserSettings
} from '../domain/models';

export interface TrackerRow {
  id: string;
  user_id: string;
  name: string;
  input_type: 'unit' | 'option';
  unit: string | null;
  icon: string;
  color: string;
  daily_goal: number | string | null;
  quick_values: Array<number | string> | null;
  is_active: boolean;
  sort_order: number | null;
  created_at: string;
}

export type TrackerWriteRow = Omit<TrackerRow, 'created_at'>;

export interface TrackerOptionRow {
  id: string;
  user_id: string;
  tracker_id: string;
  label: string;
  sort_order: number;
  created_at: string;
}

export interface TrackingLogRow {
  id: string;
  user_id: string;
  tracker_id: string;
  value: number | string | null;
  option_id: string | null;
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

function optionFromRow(row: TrackerOptionRow): TrackerOption {
  return {
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
    createdAt: row.created_at
  };
}

export function trackerFromRows(
  row: TrackerRow,
  optionRows: TrackerOptionRow[]
): Tracker {
  if (optionRows.some(option => (
    option.tracker_id !== row.id || option.user_id !== row.user_id
  ))) {
    throw new Error('Tracker option rows do not belong to the tracker.');
  }

  const common = {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    active: row.is_active,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at
  };

  if (row.input_type === 'unit') {
    if (optionRows.length > 0) {
      throw new Error('Unit trackers cannot contain options.');
    }
    if (row.unit === null) {
      throw new Error('Unit trackers require a unit.');
    }
    return {
      ...common,
      inputType: 'unit',
      unit: row.unit,
      goal: row.daily_goal === null ? null : Number(row.daily_goal),
      presets: (row.quick_values ?? [1]).map(Number),
      options: []
    };
  }

  if (
    row.input_type !== 'option'
    || row.unit !== null
    || row.daily_goal !== null
    || row.quick_values !== null
    || optionRows.length < 1
    || optionRows.length > 8
  ) {
    throw new Error('Option tracker rows contain invalid fields or option counts.');
  }

  const options = optionRows
    .map(optionFromRow)
    .sort((left, right) => (
      left.sortOrder - right.sortOrder
      || left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id)
    ));
  return {
    ...common,
    inputType: 'option',
    unit: null,
    goal: null,
    presets: [],
    options
  };
}

export function trackerToRow(tracker: Tracker, userId: string): TrackerWriteRow {
  return {
    id: tracker.id,
    user_id: userId,
    name: tracker.name,
    input_type: tracker.inputType,
    unit: tracker.unit,
    icon: tracker.icon,
    color: tracker.color,
    daily_goal: tracker.goal,
    quick_values: tracker.inputType === 'unit' ? tracker.presets : null,
    is_active: tracker.active,
    sort_order: tracker.sortOrder || 0
  };
}

export function optionToRow(
  option: TrackerOption,
  trackerId: string,
  userId: string
): TrackerOptionRow {
  return {
    id: option.id,
    user_id: userId,
    tracker_id: trackerId,
    label: option.label,
    sort_order: option.sortOrder,
    created_at: option.createdAt
  };
}

export function logFromRow(row: TrackingLogRow): TrackingLog {
  const hasValue = row.value !== null;
  const hasOption = row.option_id !== null;
  if (hasValue === hasOption) {
    throw new Error('Tracking log rows require exactly one value or option ID.');
  }

  const common = {
    id: row.id,
    trackerId: row.tracker_id,
    occurredAt: row.occurred_at,
    note: row.note || '',
    source: row.source || 'website'
  };
  if (row.option_id !== null) {
    return {
      ...common,
      recordType: 'option',
      value: null,
      optionId: row.option_id
    };
  }
  return {
    ...common,
    value: Number(row.value),
    recordType: 'unit',
    optionId: null
  };
}

export function logToRow(log: TrackingLog, userId: string): TrackingLogWriteRow {
  return {
    id: log.id,
    user_id: userId,
    tracker_id: log.trackerId,
    value: log.value,
    option_id: log.optionId,
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
