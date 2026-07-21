import { z } from 'zod';
import { makeDefaultTrackers } from '../domain/defaults';
import type { AppState, Tracker, TrackingLog, UnitTracker } from '../domain/models';
import {
  normalizeState,
  optionTrackerSchema,
  optionTrackingLogSchema,
  trackerSchema,
  trackingLogSchema,
  unitTrackerSchema,
  unitTrackingLogSchema,
  userSettingsSchema
} from '../domain/schemas';
import type { AppStore } from '../state/app-store';
import type { BackupRepository } from './repository-types';
import type { OperationResult } from './sync-service';

const BATCH_SIZE = 500;
const IMPORT_ERROR_MESSAGE = 'This file is not a valid My Tracker JSON backup.';
const PERSISTENCE_ERROR_MESSAGE = 'Could not safely replace cloud data.';
const CSV_HEADERS = [
  'ID', 'Tracker', 'Record Type', 'Value', 'Unit', 'Option', 'Occurred At', 'Note'
] as const;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const strictTrackerSchema = z.discriminatedUnion('inputType', [
  unitTrackerSchema.strict(),
  optionTrackerSchema.strict()
]);

const strictTrackingLogSchema = z.discriminatedUnion('recordType', [
  unitTrackingLogSchema.strict(),
  optionTrackingLogSchema.strict()
]);

const backupSchema = z.object({
  version: z.literal(4),
  trackers: z.array(strictTrackerSchema),
  logs: z.array(strictTrackingLogSchema),
  settings: userSettingsSchema,
  exportedAt: z.string().optional()
}).strict();

const legacyTrackerSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  icon: z.string(),
  color: z.string().regex(COLOR_PATTERN),
  goal: z.number().finite().nullable(),
  presets: z.array(z.number().finite().positive()).max(8),
  active: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string()
}).strict();

const legacyTrackingLogSchema = z.object({
  id: z.string(),
  trackerId: z.string().min(1),
  value: z.number().finite().positive(),
  occurredAt: z.string(),
  note: z.string(),
  source: z.string()
}).strict();

const legacyBackupSchema = z.object({
  version: z.literal(3),
  trackers: z.array(legacyTrackerSchema),
  logs: z.array(legacyTrackingLogSchema),
  settings: userSettingsSchema,
  exportedAt: z.string().optional()
}).strict();

export interface BackupTrackerRepository {
  deleteAll(): Promise<void>;
  insertMany(trackers: Tracker[]): Promise<void>;
}

export interface BackupLogRepository {
  deleteAll(): Promise<void>;
  insertMany(logs: TrackingLog[]): Promise<void>;
}

export interface BackupServiceDependencies {
  userId: string;
  store: Pick<AppStore, 'getState' | 'replace'>;
  cache: { save(userId: string, state: AppState): void };
  queue: { clear(userId: string): void };
  backup: BackupRepository;
  trackers: BackupTrackerRepository;
  logs: BackupLogRepository;
  reloadCloudState(): Promise<void>;
  createId(): string;
  now(): string;
  isOnline(): boolean;
}

export interface BackupServiceContract {
  exportJson(): string;
  exportCsv(): string;
  importJson(text: string): Promise<OperationResult>;
  loadSampleData(): Promise<OperationResult>;
  clearLogs(): Promise<OperationResult>;
  resetEverything(): Promise<OperationResult>;
}

function validationFailure(): OperationResult {
  return {
    ok: false,
    error: { kind: 'validation', message: IMPORT_ERROR_MESSAGE }
  };
}

function persistenceFailure(): OperationResult {
  return {
    ok: false,
    error: { kind: 'persistence', message: PERSISTENCE_ERROR_MESSAGE }
  };
}

function offlineFailure(): OperationResult {
  return {
    ok: false,
    error: {
      kind: 'network',
      message: 'Connect to the internet before changing cloud data.'
    }
  };
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function hasUniqueNonemptyIds(items: ReadonlyArray<{ id: string }>): boolean {
  const ids = items.map(item => item.id);
  return ids.every(id => id.length > 0) && new Set(ids).size === ids.length;
}

function relationshipsAreValid(state: AppState): boolean {
  if (!hasUniqueNonemptyIds(state.trackers) || !hasUniqueNonemptyIds(state.logs)) {
    return false;
  }
  const options = state.trackers.flatMap(tracker => tracker.options);
  if (!hasUniqueNonemptyIds(options)) return false;

  const trackers = new Map(state.trackers.map(tracker => [tracker.id, tracker]));
  return state.logs.every(item => {
    const owner = trackers.get(item.trackerId);
    if (owner === undefined) return false;
    if (item.recordType === 'unit') return owner.inputType === 'unit';
    return owner.inputType === 'option'
      && owner.options.some(option => option.id === item.optionId);
  });
}

async function insertBatches<T>(
  items: T[],
  insert: (batch: T[]) => Promise<void>
): Promise<void> {
  for (let index = 0; index < items.length; index += BATCH_SIZE) {
    await insert(items.slice(index, index + BATCH_SIZE));
  }
}

export class BackupService implements BackupServiceContract {
  constructor(private readonly dependencies: BackupServiceDependencies) {}

  exportJson(): string {
    const state = this.dependencies.store.getState();
    return JSON.stringify({
      version: state.version,
      trackers: state.trackers,
      logs: state.logs,
      settings: state.settings,
      exportedAt: this.dependencies.now()
    }, null, 2);
  }

  exportCsv(): string {
    const state = this.dependencies.store.getState();
    const trackers = new Map(state.trackers.map(item => [item.id, item]));
    const logs = [...state.logs].sort((left, right) => (
      right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id)
    ));
    const rows: Array<Array<string | number>> = [
      [...CSV_HEADERS],
      ...logs.map(item => {
        const owner = trackers.get(item.trackerId);
        const option = item.recordType === 'option' && owner?.inputType === 'option'
          ? owner.options.find(candidate => candidate.id === item.optionId)
          : undefined;
        return [
          item.id,
          owner?.name ?? '',
          item.recordType === 'unit' ? 'Unit' : 'Option',
          item.recordType === 'unit' ? item.value : '',
          item.recordType === 'unit' && owner?.inputType === 'unit' ? owner.unit : '',
          item.recordType === 'option' ? option?.label ?? '' : '',
          item.occurredAt,
          item.note
        ];
      })
    ];
    return rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  }

  async importJson(text: string): Promise<OperationResult> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return validationFailure();
    }

    const currentResult = backupSchema.safeParse(parsed);
    let imported: AppState;
    if (currentResult.success) {
      imported = {
        version: 4,
        trackers: currentResult.data.trackers,
        logs: currentResult.data.logs,
        settings: currentResult.data.settings
      };
    } else {
      const legacyResult = legacyBackupSchema.safeParse(parsed);
      if (!legacyResult.success) return validationFailure();
      imported = normalizeState(legacyResult.data);
    }
    if (!relationshipsAreValid(imported)) return validationFailure();

    const trackerIdMap = new Map<string, string>();
    const optionIdMap = new Map<string, string>();
    const createdAt = this.dependencies.now();
    const trackers = imported.trackers.map((item, index) => {
      const id = this.dependencies.createId();
      trackerIdMap.set(item.id, id);
      const options = item.inputType === 'option'
        ? item.options.map(option => {
            const optionId = this.dependencies.createId();
            optionIdMap.set(option.id, optionId);
            return { ...option, id: optionId };
          })
        : [];
      return trackerSchema.parse({
        ...item,
        id,
        options,
        sortOrder: index,
        createdAt
      });
    });
    const logs = imported.logs.map(item => trackingLogSchema.parse({
      ...item,
      id: this.dependencies.createId(),
      trackerId: trackerIdMap.get(item.trackerId),
      optionId: item.recordType === 'option' ? optionIdMap.get(item.optionId) : null,
      source: 'import'
    }));
    const replacement: AppState = {
      version: 4,
      trackers,
      logs,
      settings: imported.settings
    };
    if (!relationshipsAreValid(replacement)) return validationFailure();

    return this.replaceEverything(replacement);
  }

  async loadSampleData(): Promise<OperationResult> {
    if (!this.dependencies.isOnline()) return offlineFailure();
    const current = this.dependencies.store.getState();
    const trackers = current.trackers.length > 0
      ? [...current.trackers]
      : makeDefaultTrackers(
          () => this.dependencies.createId(),
          () => this.dependencies.now()
        );
    const samples = this.makeSampleLogs(trackers);
    const next: AppState = {
      version: 4,
      trackers,
      logs: [...current.logs, ...samples],
      settings: current.settings
    };

    try {
      if (current.trackers.length === 0) {
        await insertBatches(trackers, batch => this.dependencies.trackers.insertMany(batch));
      }
      await insertBatches(samples, batch => this.dependencies.logs.insertMany(batch));
      this.saveLocalState(next, false);
      return { ok: true, queued: false };
    } catch {
      await this.safeReload();
      return persistenceFailure();
    }
  }

  async clearLogs(): Promise<OperationResult> {
    if (!this.dependencies.isOnline()) return offlineFailure();
    const current = this.dependencies.store.getState();
    try {
      await this.dependencies.logs.deleteAll();
      this.saveLocalState({ ...current, logs: [] }, true);
      return { ok: true, queued: false };
    } catch {
      await this.safeReload();
      return persistenceFailure();
    }
  }

  async resetEverything(): Promise<OperationResult> {
    const replacement: AppState = {
      version: 4,
      trackers: makeDefaultTrackers(
        () => this.dependencies.createId(),
        () => this.dependencies.now()
      ),
      logs: [],
      settings: { theme: 'system', confirmDelete: true }
    };
    return this.replaceEverything(replacement);
  }

  private async replaceEverything(replacement: AppState): Promise<OperationResult> {
    if (!this.dependencies.isOnline()) return offlineFailure();
    try {
      await this.dependencies.backup.restoreState(replacement);
      this.saveLocalState(replacement, true);
      return { ok: true, queued: false };
    } catch {
      await this.safeReload();
      return persistenceFailure();
    }
  }

  private saveLocalState(state: AppState, clearQueue: boolean): void {
    this.dependencies.store.replace(state);
    this.dependencies.cache.save(this.dependencies.userId, state);
    if (clearQueue) this.dependencies.queue.clear(this.dependencies.userId);
  }

  private async safeReload(): Promise<void> {
    try {
      await this.dependencies.reloadCloudState();
    } catch {
      // The caller receives a safe persistence error even if recovery also fails.
    }
  }

  private makeSampleLogs(trackers: Tracker[]): TrackingLog[] {
    const unitTrackers = trackers.filter((tracker): tracker is UnitTracker => (
      tracker.inputType === 'unit'
    ));
    const first = unitTrackers[0];
    if (!first) return [];
    const second = unitTrackers[1] ?? first;
    const now = new Date(this.dependencies.now());
    const counts = [4, 7, 5, 8, 3, 6, 2];
    const secondValues = [10, 15, 20, 10, 30, 15, 25];
    const samples: TrackingLog[] = [];

    for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
      const valueIndex = 6 - dayOffset;
      const day = new Date(now);
      day.setUTCDate(now.getUTCDate() - dayOffset);
      const count = counts[valueIndex] ?? 0;
      for (let index = 0; index < count; index += 1) {
        const occurredAt = new Date(day);
        occurredAt.setUTCHours(10 + index * 2, (index * 11) % 60, 0, 0);
        samples.push({
          id: this.dependencies.createId(),
          trackerId: first.id,
          value: 1,
          recordType: 'unit',
          optionId: null,
          occurredAt: occurredAt.toISOString(),
          note: index === 0 && dayOffset === 0 ? 'Morning' : '',
          source: 'sample'
        });
      }
      const occurredAt = new Date(day);
      occurredAt.setUTCHours(21, 30, 0, 0);
      samples.push({
        id: this.dependencies.createId(),
        trackerId: second.id,
        value: secondValues[valueIndex] ?? 1,
        recordType: 'unit',
        optionId: null,
        occurredAt: occurredAt.toISOString(),
        note: '',
        source: 'sample'
      });
    }
    return samples;
  }
}
