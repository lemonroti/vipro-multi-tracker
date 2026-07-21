import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppState, Tracker, TrackingLog, UserSettings } from '../domain/models';
import {
  RepositoryError,
  type BackupRepository,
  type LogRepository,
  type RepositoryErrorKind,
  type SettingsRepository,
  type TrackerRepository
} from './repository-types';
import {
  logFromRow,
  logToRow,
  optionToRow,
  settingsFromRow,
  settingsToRow,
  trackerFromRows,
  trackerToRow,
  type TrackerOptionRow,
  type TrackerRow,
  type TrackingLogRow,
  type UserSettingsRow
} from './row-mappers';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

const DEFAULT_LOG_PAGE_SIZE = 1000;

function errorKind(error: SupabaseErrorLike): RepositoryErrorKind {
  const message = error.message ?? '';
  if (/fetch|network|timeout|connection/i.test(message)) return 'network';
  if (error.code === '42501' || /permission|row-level security/i.test(message)) {
    return 'permission';
  }
  if (error.code?.startsWith('22') || ['23502', '23503', '23514'].includes(error.code ?? '')) {
    return 'validation';
  }
  return 'persistence';
}

function safeMessage(kind: RepositoryErrorKind): string {
  if (kind === 'network') return 'Could not reach cloud storage.';
  if (kind === 'permission') return 'You do not have permission to access this data.';
  if (kind === 'validation') return 'Cloud storage rejected invalid data.';
  return 'Could not save or load cloud data.';
}

function throwRepositoryError(error: SupabaseErrorLike): never {
  const kind = errorKind(error);
  throw new RepositoryError(kind, safeMessage(kind));
}

function mapRows<Row, Domain>(rows: Row[], mapper: (row: Row) => Domain): Domain[] {
  try {
    return rows.map(mapper);
  } catch {
    throw new RepositoryError('validation', safeMessage('validation'));
  }
}

function withoutUserId<Row extends { user_id: string }>(row: Row): Omit<Row, 'user_id'> {
  const { user_id: userId, ...payload } = row;
  void userId;
  return payload;
}

function optionRpcPayload(
  option: Parameters<typeof optionToRow>[0],
  trackerId: string,
  userId: string
) {
  const {
    user_id: optionUserId,
    tracker_id: optionTrackerId,
    ...payload
  } = optionToRow(option, trackerId, userId);
  void optionUserId;
  void optionTrackerId;
  return payload;
}

function optionRpcPayloads(tracker: Tracker, userId: string) {
  return [...tracker.options]
    .sort((left, right) => (
      left.sortOrder - right.sortOrder
      || left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id)
    ))
    .map(option => optionRpcPayload(option, tracker.id, userId));
}

export class SupabaseBackupRepository implements BackupRepository {
  constructor(private readonly client: SupabaseClient) {}

  async restoreState(state: AppState): Promise<void> {
    const { error } = await this.client.rpc('restore_tracker_state', {
      trackers_payload: state.trackers.map(tracker => (
        {
          ...withoutUserId(trackerToRow(tracker, '')),
          created_at: tracker.createdAt,
          options: optionRpcPayloads(tracker, '')
        }
      )),
      logs_payload: state.logs.map(log => withoutUserId(logToRow(log, ''))),
      settings_payload: withoutUserId(settingsToRow(state.settings, ''))
    });
    if (error) throwRepositoryError(error);
  }
}

export class SupabaseTrackerRepository implements TrackerRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string
  ) {}

  async list(): Promise<Tracker[]> {
    const trackersRequest = this.client
      .from('trackers')
      .select('*')
      .eq('user_id', this.userId)
      .order('sort_order')
      .order('created_at');
    const optionsRequest = this.client
      .from('tracker_options')
      .select('*')
      .eq('user_id', this.userId)
      .order('tracker_id')
      .order('sort_order')
      .order('created_at');
    const [trackersResult, optionsResult] = await Promise.all([
      trackersRequest,
      optionsRequest
    ]);
    if (trackersResult.error) throwRepositoryError(trackersResult.error);
    if (optionsResult.error) throwRepositoryError(optionsResult.error);

    const trackerRows = (trackersResult.data ?? []) as TrackerRow[];
    const optionRows = (optionsResult.data ?? []) as TrackerOptionRow[];
    try {
      const trackerIds = new Set(trackerRows.map(row => row.id));
      if (optionRows.some(row => !trackerIds.has(row.tracker_id))) {
        throw new Error('Tracker option row references an unloaded tracker.');
      }

      const optionsByTrackerId = new Map<string, TrackerOptionRow[]>();
      optionRows.forEach(row => {
        const options = optionsByTrackerId.get(row.tracker_id) ?? [];
        options.push(row);
        optionsByTrackerId.set(row.tracker_id, options);
      });

      return trackerRows.map(row => trackerFromRows(
        row,
        optionsByTrackerId.get(row.id) ?? []
      ));
    } catch {
      throw new RepositoryError('validation', safeMessage('validation'));
    }
  }

  async upsert(tracker: Tracker): Promise<void> {
    const { error } = await this.client.rpc('save_tracker_with_options', {
      tracker_payload: withoutUserId(trackerToRow(tracker, this.userId)),
      options_payload: optionRpcPayloads(tracker, this.userId)
    });
    if (error) throwRepositoryError(error);
  }

  async insertMany(trackers: Tracker[]): Promise<void> {
    const { error } = await this.client
      .from('trackers')
      .insert(trackers.map(tracker => trackerToRow(tracker, this.userId)));
    if (error) throwRepositoryError(error);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.client
      .from('trackers')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);
    if (error) throwRepositoryError(error);
  }

  async deleteAll(): Promise<void> {
    const { error } = await this.client
      .from('trackers')
      .delete()
      .eq('user_id', this.userId);
    if (error) throwRepositoryError(error);
  }
}

export class SupabaseLogRepository implements LogRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string
  ) {}

  async listAll(pageSize = DEFAULT_LOG_PAGE_SIZE): Promise<TrackingLog[]> {
    const rows: TrackingLogRow[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.client
        .from('tracking_logs')
        .select('*')
        .eq('user_id', this.userId)
        .order('occurred_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throwRepositoryError(error);

      const page = (data ?? []) as TrackingLogRow[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }

    return mapRows(rows, logFromRow);
  }

  async upsert(log: TrackingLog): Promise<void> {
    const { error } = await this.client
      .from('tracking_logs')
      .upsert(logToRow(log, this.userId), { onConflict: 'id' })
      .eq('user_id', this.userId);
    if (error) throwRepositoryError(error);
  }

  async insertMany(logs: TrackingLog[]): Promise<void> {
    const { error } = await this.client
      .from('tracking_logs')
      .insert(logs.map(log => logToRow(log, this.userId)));
    if (error) throwRepositoryError(error);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.client
      .from('tracking_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);
    if (error) throwRepositoryError(error);
  }

  async deleteAll(): Promise<void> {
    const { error } = await this.client
      .from('tracking_logs')
      .delete()
      .eq('user_id', this.userId);
    if (error) throwRepositoryError(error);
  }
}

export class SupabaseSettingsRepository implements SettingsRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string
  ) {}

  async get(): Promise<UserSettings | null> {
    const { data, error } = await this.client
      .from('user_settings')
      .select('*')
      .eq('user_id', this.userId)
      .maybeSingle() as { data: unknown; error: SupabaseErrorLike | null };
    if (error) throwRepositoryError(error);
    if (!data) return null;

    try {
      return settingsFromRow(data as UserSettingsRow);
    } catch {
      throw new RepositoryError('validation', safeMessage('validation'));
    }
  }

  async save(settings: UserSettings): Promise<void> {
    const { error } = await this.client
      .from('user_settings')
      .upsert(settingsToRow(settings, this.userId), { onConflict: 'user_id' })
      .eq('user_id', this.userId);
    if (error) throwRepositoryError(error);
  }
}
