import { z } from 'zod';
import type { AppState, Tracker, TrackingLog, UserSettings } from './models';
import type { OfflineOperation } from './operations';

const COLORS = ['#334155', '#6d4aff', '#0f766e', '#c2410c', '#be185d', '#2563eb', '#7c2d12'];
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const trackerSchema: z.ZodType<Tracker> = z.object({
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
});

export const trackingLogSchema: z.ZodType<TrackingLog> = z.object({
  id: z.string(),
  trackerId: z.string(),
  value: z.number().finite().positive(),
  occurredAt: z.string(),
  note: z.string(),
  source: z.string()
});

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
  const rawGoal = tracker.goal;
  const presets = (Array.isArray(tracker.presets) ? tracker.presets : [1])
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0)
    .slice(0, 8);

  return trackerSchema.parse({
    id: stringify(tracker.id) || createId(),
    name: stringify(tracker.name) || 'Untitled',
    unit: stringify(tracker.unit) || 'count',
    icon: stringify(tracker.icon) || '✦',
    color: COLOR_PATTERN.test(rawColor) ? rawColor : COLORS[index % COLORS.length],
    goal: rawGoal === null || rawGoal === '' || rawGoal === undefined ? null : Number(rawGoal),
    presets,
    active: tracker.active !== false,
    sortOrder: index,
    createdAt: stringify(tracker.createdAt) || currentTimestamp()
  });
}

function normalizeLog(input: unknown): TrackingLog | null {
  if (!isObject(input)) return null;

  const result = trackingLogSchema.safeParse({
    id: stringify(input.id) || createId(),
    trackerId: stringify(input.trackerId),
    value: Number(input.value),
    occurredAt: stringify(input.occurredAt) || currentTimestamp(),
    note: stringify(input.note),
    source: stringify(input.source) || 'website'
  });

  return result.success ? result.data : null;
}

export function blankState(): AppState {
  return {
    version: 3,
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
    version: 3,
    trackers,
    logs,
    settings: userSettingsSchema.parse({
      theme: settings.theme ?? 'system',
      confirmDelete: settings.confirmDelete ?? true
    })
  };
}
