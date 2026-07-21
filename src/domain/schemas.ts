import { z } from 'zod';
import type {
  AppState,
  Tracker,
  TrackerOption,
  TrackingLog,
  UserSettings
} from './models';
import type { OfflineOperation } from './operations';

const COLORS = ['#334155', '#6d4aff', '#0f766e', '#c2410c', '#be185d', '#2563eb', '#7c2d12'];
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const trackerOptionSchema: z.ZodType<TrackerOption> = z.object({
  id: z.string(),
  label: z.string().trim().min(1).max(80),
  sortOrder: z.number().int(),
  createdAt: z.string()
});

const trackerOptionsSchema = z.array(trackerOptionSchema).min(1).max(8).superRefine((options, context) => {
  const labels = new Set<string>();
  options.forEach((option, index) => {
    const normalized = option.label.toLowerCase();
    if (labels.has(normalized)) {
      context.addIssue({
        code: 'custom',
        message: 'Option labels must be unique.',
        path: [index, 'label']
      });
    }
    labels.add(normalized);
  });
});

const trackerBaseFields = {
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string().regex(COLOR_PATTERN),
  active: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string()
};

export const unitTrackerSchema = z.object({
  ...trackerBaseFields,
  inputType: z.literal('unit'),
  unit: z.string(),
  goal: z.number().finite().nullable(),
  presets: z.array(z.number().finite().positive()).max(8),
  options: z.tuple([])
});

export const optionTrackerSchema = z.object({
  ...trackerBaseFields,
  inputType: z.literal('option'),
  unit: z.null(),
  goal: z.null(),
  presets: z.tuple([]),
  options: trackerOptionsSchema
});

export const trackerSchema: z.ZodType<Tracker> = z.discriminatedUnion('inputType', [
  unitTrackerSchema,
  optionTrackerSchema
]);

const trackingLogBaseFields = {
  id: z.string(),
  trackerId: z.string().min(1),
  occurredAt: z.string(),
  note: z.string(),
  source: z.string()
};

export const unitTrackingLogSchema = z.object({
  ...trackingLogBaseFields,
  recordType: z.literal('unit'),
  value: z.number().finite().positive(),
  optionId: z.null()
});

export const optionTrackingLogSchema = z.object({
  ...trackingLogBaseFields,
  recordType: z.literal('option'),
  value: z.null(),
  optionId: z.string().min(1)
});

export const trackingLogSchema: z.ZodType<TrackingLog> = z.discriminatedUnion('recordType', [
  unitTrackingLogSchema,
  optionTrackingLogSchema
]);

export const userSettingsSchema: z.ZodType<UserSettings> = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  confirmDelete: z.boolean()
});

const operationFields = {
  id: z.string(),
  createdAt: z.string(),
  retryCount: z.number().int().nonnegative()
};

export const offlineOperationSchema: z.ZodType<OfflineOperation> = z.discriminatedUnion('type', [
  z.object({ ...operationFields, type: z.literal('upsertTracker'), payload: trackerSchema }),
  z.object({ ...operationFields, type: z.literal('deleteTracker'), payload: z.object({ id: z.string() }) }),
  z.object({ ...operationFields, type: z.literal('upsertLog'), payload: trackingLogSchema }),
  z.object({ ...operationFields, type: z.literal('deleteLog'), payload: z.object({ id: z.string() }) }),
  z.object({ ...operationFields, type: z.literal('saveSettings'), payload: userSettingsSchema })
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringify(value: unknown): string {
  if (!value) return '';

  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

function createId(): string {
  return crypto.randomUUID();
}

function currentTimestamp(): string {
  return new Date().toISOString();
}

function normalizeTracker(input: unknown, index: number): Tracker {
  const tracker = isObject(input) ? input : {};
  const rawColor = stringify(tracker.color);
  const inputType = tracker.inputType === undefined ? 'unit' : tracker.inputType;
  const common = {
    id: stringify(tracker.id) || createId(),
    name: stringify(tracker.name) || 'Untitled',
    icon: stringify(tracker.icon) || '✦',
    color: COLOR_PATTERN.test(rawColor) ? rawColor : COLORS[index % COLORS.length],
    active: tracker.active !== false,
    sortOrder: index,
    createdAt: stringify(tracker.createdAt) || currentTimestamp()
  };

  if (inputType === 'option') {
    const options = (Array.isArray(tracker.options) ? tracker.options : []).map((input, optionIndex) => {
      const option = isObject(input) ? input : {};
      return {
        id: stringify(option.id) || createId(),
        label: stringify(option.label),
        sortOrder: optionIndex,
        createdAt: stringify(option.createdAt) || currentTimestamp()
      };
    });

    return trackerSchema.parse({
      ...common,
      inputType,
      unit: null,
      goal: null,
      presets: [],
      options
    });
  }

  const rawGoal = tracker.goal;
  const presets = (Array.isArray(tracker.presets) ? tracker.presets : [1])
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0)
    .slice(0, 8);

  return trackerSchema.parse({
    ...common,
    inputType,
    unit: stringify(tracker.unit) || 'count',
    goal: rawGoal === null || rawGoal === '' || rawGoal === undefined ? null : Number(rawGoal),
    presets,
    options: []
  });
}

function normalizeLog(input: unknown): TrackingLog | null {
  if (!isObject(input)) return null;

  const recordType = input.recordType === undefined ? 'unit' : input.recordType;
  const common = {
    id: stringify(input.id) || createId(),
    trackerId: stringify(input.trackerId),
    occurredAt: stringify(input.occurredAt) || currentTimestamp(),
    note: stringify(input.note),
    source: stringify(input.source) || 'website'
  };

  const result = trackingLogSchema.safeParse(recordType === 'option'
    ? {
        ...common,
        recordType,
        value: null,
        optionId: stringify(input.optionId)
      }
    : {
        ...common,
        recordType,
        value: Number(input.value),
        optionId: null
      });

  return result.success ? result.data : null;
}

export function blankState(): AppState {
  return {
    version: 4,
    trackers: [],
    logs: [],
    settings: { theme: 'system', confirmDelete: true }
  };
}

export function normalizeState(input: unknown): AppState {
  if (!isObject(input)) {
    throw new Error('Invalid tracker state');
  }

  const trackers = Array.isArray(input.trackers)
    ? input.trackers.map(normalizeTracker)
    : [];
  const logs = Array.isArray(input.logs)
    ? input.logs.map(normalizeLog).filter((log): log is TrackingLog => log !== null)
    : [];
  const settings = isObject(input.settings) ? input.settings : {};

  return {
    version: 4,
    trackers,
    logs,
    settings: userSettingsSchema.parse({
      theme: settings.theme ?? 'system',
      confirmDelete: settings.confirmDelete ?? true
    })
  };
}
