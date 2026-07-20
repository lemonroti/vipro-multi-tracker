import { describe, expect, test } from 'vitest';
import type { AppState, Tracker, TrackingLog, UserSettings } from '../domain/models';
import { blankState } from '../domain/schemas';
import { createAppStore } from '../state/app-store';
import { BackupService } from './backup-service';

const NOW = '2026-07-21T08:00:00.000Z';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function tracker(overrides: Partial<Tracker> = {}): Tracker {
  return {
    id: 'tracker-a', name: 'Water', unit: 'glass', icon: '💧', color: '#2563eb',
    goal: 8, presets: [1], active: true, sortOrder: 0, createdAt: NOW,
    ...overrides
  };
}

function log(overrides: Partial<TrackingLog> = {}): TrackingLog {
  return {
    id: 'log-a', trackerId: 'tracker-a', value: 1, occurredAt: NOW,
    note: '', source: 'website', ...overrides
  };
}

function state(overrides: Partial<AppState> = {}): AppState {
  return {
    ...blankState(),
    trackers: [tracker()],
    logs: [log()],
    ...overrides
  };
}

function backupText(overrides: Partial<AppState> = {}): string {
  return JSON.stringify(state(overrides));
}

function createHarness(initial = state(), ids: string[] = [], online = true) {
  const events: string[] = [];
  const store = createAppStore(initial);
  const storage = new MemoryStorage();
  const trackerBatches: Tracker[][] = [];
  const logBatches: TrackingLog[][] = [];
  const settingsSaved: UserSettings[] = [];
  let failLogBatch = 0;
  const service = new BackupService({
    userId: 'user-1',
    store,
    cache: {
      save(userId: string, next: AppState) {
        storage.setItem(`cache:${userId}`, JSON.stringify(next));
        events.push('cache:save');
      }
    },
    queue: {
      clear(userId: string) {
        events.push(`queue:clear:${userId}`);
      }
    },
    trackers: {
      deleteAll() {
        events.push('trackers:deleteAll');
        return Promise.resolve();
      },
      insertMany(items: Tracker[]) {
        trackerBatches.push(structuredClone(items));
        events.push(`trackers:insert:${items.length}`);
        return Promise.resolve();
      }
    },
    logs: {
      deleteAll() {
        events.push('logs:deleteAll');
        return Promise.resolve();
      },
      insertMany(items: TrackingLog[]) {
        logBatches.push(structuredClone(items));
        events.push(`logs:insert:${items.length}`);
        if (failLogBatch > 0 && logBatches.length === failLogBatch) {
          return Promise.reject(new Error('write failed'));
        }
        return Promise.resolve();
      }
    },
    settings: {
      save(settings: UserSettings) {
        settingsSaved.push(structuredClone(settings));
        events.push('settings:save');
        return Promise.resolve();
      }
    },
    reloadCloudState() {
      events.push('cloud:reload');
      return Promise.resolve();
    },
    createId: () => ids.shift() ?? `generated-${ids.length}`,
    now: () => NOW,
    isOnline: () => online
  });
  return {
    service, store, storage, events, trackerBatches, logBatches, settingsSaved,
    failOnLogBatch(batch: number) { failLogBatch = batch; }
  };
}

describe('BackupService exports', () => {
  test('exports a deterministic JSON snapshot with an export timestamp', () => {
    const { service } = createHarness();

    expect(service.exportJson()).toBe(JSON.stringify({
      version: 3,
      trackers: [tracker()],
      logs: [log()],
      settings: { theme: 'system', confirmDelete: true },
      exportedAt: NOW
    }, null, 2));
    expect(service.exportJson()).toBe(service.exportJson());
  });

  test('exports deterministic CSV headers, ordering, and RFC 4180 escaping', () => {
    const older = log({
      id: 'log-old', occurredAt: '2026-07-20T08:00:00.000Z', note: 'plain'
    });
    const newer = log({
      id: 'log-new', value: 2.5, occurredAt: '2026-07-21T09:00:00.000Z',
      note: 'line one, "quoted"\nline two'
    });
    const { service } = createHarness(state({ logs: [older, newer] }));

    expect(service.exportCsv()).toBe([
      'ID,Tracker,Value,Unit,Occurred At,Note',
      'log-new,Water,2.5,glass,2026-07-21T09:00:00.000Z,"line one, ""quoted""\nline two"',
      'log-old,Water,1,glass,2026-07-20T08:00:00.000Z,plain'
    ].join('\r\n'));
  });
});

describe('BackupService import', () => {
  test('validates the complete import before the first destructive repository call', async () => {
    const { service, events } = createHarness();
    const invalid = state();
    invalid.trackers.push(tracker({ id: 'invalid', color: 'blue' }));

    const result = await service.importJson(JSON.stringify(invalid));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('validation');
    expect(events).toEqual([]);
  });

  test('rejects orphan logs before any mutation', async () => {
    const { service, events } = createHarness();

    const result = await service.importJson(backupText({
      logs: [log({ trackerId: 'missing-tracker' })]
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('validation');
    expect(events).toEqual([]);
  });

  test('remaps tracker and log IDs and preserves import source', async () => {
    const { service, store, trackerBatches, logBatches, settingsSaved, events } =
      createHarness(state(), ['tracker-new', 'log-new']);

    const result = await service.importJson(backupText());

    expect(result).toEqual({ ok: true, queued: false });
    expect(trackerBatches).toEqual([[tracker({ id: 'tracker-new', createdAt: NOW })]]);
    expect(logBatches).toEqual([[log({
      id: 'log-new', trackerId: 'tracker-new', source: 'import'
    })]]);
    expect(settingsSaved).toEqual([{ theme: 'system', confirmDelete: true }]);
    expect(store.getState()).toEqual({
      version: 3,
      trackers: trackerBatches[0],
      logs: logBatches[0],
      settings: { theme: 'system', confirmDelete: true }
    });
    expect(events.slice(-2)).toEqual(['cache:save', 'queue:clear:user-1']);
  });

  test('inserts imported records in batches of at most 500 rows', async () => {
    const logs = Array.from({ length: 1001 }, (_, index) => log({ id: `log-${index}` }));
    const ids = [
      'tracker-new',
      ...Array.from({ length: logs.length }, (_, index) => `new-log-${index}`)
    ];
    const { service, logBatches } = createHarness(state(), ids);

    const result = await service.importJson(backupText({ logs }));

    expect(result.ok).toBe(true);
    expect(logBatches.map(batch => batch.length)).toEqual([500, 500, 1]);
  });

  test('reloads cloud state after a failed mutation and does not clear the queue', async () => {
    const logs = Array.from({ length: 501 }, (_, index) => log({ id: `log-${index}` }));
    const ids = [
      'tracker-new',
      ...Array.from({ length: logs.length }, (_, index) => `new-log-${index}`)
    ];
    const harness = createHarness(state(), ids);
    harness.failOnLogBatch(2);

    const result = await harness.service.importJson(backupText({ logs }));

    expect(result).toEqual({
      ok: false,
      error: { kind: 'persistence', message: 'Could not safely replace cloud data.' }
    });
    expect(harness.events.at(-1)).toBe('cloud:reload');
    expect(harness.events).not.toContain('queue:clear:user-1');
  });
});

describe('BackupService destructive helpers', () => {
  test('rejects cloud mutations while offline without calling repositories', async () => {
    const { service, events } = createHarness(state(), [], false);

    const result = await service.clearLogs();

    expect(result).toEqual({
      ok: false,
      error: { kind: 'network', message: 'Connect to the internet before changing cloud data.' }
    });
    expect(events).toEqual([]);
  });

  test('loads deterministic sample values with sample source', async () => {
    const ids = Array.from({ length: 42 }, (_, index) => `sample-${index}`);
    const { service, logBatches, store } = createHarness(state({
      trackers: [tracker(), tracker({ id: 'tracker-b', name: 'Prayer', unit: 'minute' })],
      logs: []
    }), ids);

    const result = await service.loadSampleData();

    expect(result.ok).toBe(true);
    expect(logBatches.flat()).toHaveLength(42);
    expect(logBatches.flat().every(item => item.source === 'sample')).toBe(true);
    expect(logBatches.flat().filter(item => item.trackerId === 'tracker-b').map(item => item.value))
      .toEqual([10, 15, 20, 10, 30, 15, 25]);
    expect(store.getState().logs).toEqual(logBatches.flat());
  });

  test('clears logs while preserving trackers and settings', async () => {
    const initial = state({ settings: { theme: 'dark', confirmDelete: false } });
    const { service, store, events } = createHarness(initial);

    const result = await service.clearLogs();

    expect(result).toEqual({ ok: true, queued: false });
    expect(store.getState()).toEqual({ ...initial, logs: [] });
    expect(events).toEqual([
      'logs:deleteAll', 'cache:save', 'queue:clear:user-1'
    ]);
  });

  test('reset restores the exact default trackers and settings', async () => {
    const { service, store, trackerBatches, settingsSaved, events } = createHarness(
      state({ settings: { theme: 'dark', confirmDelete: false } }),
      ['default-smoking', 'default-prayer']
    );

    const result = await service.resetEverything();

    expect(result).toEqual({ ok: true, queued: false });
    expect(trackerBatches[0]?.map(item => ({
      id: item.id, name: item.name, unit: item.unit, icon: item.icon, color: item.color,
      goal: item.goal, presets: item.presets, active: item.active, sortOrder: item.sortOrder,
      createdAt: item.createdAt
    }))).toEqual([
      {
        id: 'default-smoking', name: 'Smoking', unit: 'cigarette', icon: '🚬',
        color: '#334155', goal: 8, presets: [1], active: true, sortOrder: 0,
        createdAt: NOW
      },
      {
        id: 'default-prayer', name: '觀世音菩薩聖號', unit: 'minute', icon: '🙏',
        color: '#6d4aff', goal: 30, presets: [5, 10, 15], active: true, sortOrder: 1,
        createdAt: NOW
      }
    ]);
    expect(settingsSaved).toEqual([{ theme: 'system', confirmDelete: true }]);
    expect(store.getState()).toEqual({
      version: 3,
      trackers: trackerBatches[0],
      logs: [],
      settings: { theme: 'system', confirmDelete: true }
    });
    expect(events.slice(-2)).toEqual(['cache:save', 'queue:clear:user-1']);
  });
});
