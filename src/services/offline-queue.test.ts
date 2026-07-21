import { describe, expect, it } from 'vitest';
import type { OfflineOperation } from '../domain/operations';
import { OfflineQueue } from './offline-queue';

const QUEUE_KEY_PREFIX = 'vipro-multi-tracker-queue-v3-';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function trackerUpsert(
  operationId: string,
  entityId: string,
  createdAt: string,
  name = entityId
): Extract<OfflineOperation, { type: 'upsertTracker' }> {
  return {
    id: operationId,
    type: 'upsertTracker',
    payload: {
      id: entityId,
      name,
      unit: 'count',
      icon: '✦',
      color: '#334155',
      goal: null,
      presets: [1],
      inputType: 'unit',
      options: [],
      active: true,
      sortOrder: 0,
      createdAt
    },
    createdAt,
    retryCount: 0
  };
}

function logUpsert(
  operationId: string,
  entityId: string,
  createdAt: string
): Extract<OfflineOperation, { type: 'upsertLog' }> {
  return {
    id: operationId,
    type: 'upsertLog',
    payload: {
      id: entityId,
      trackerId: 'tracker-1',
      value: 1,
      recordType: 'unit',
      optionId: null,
      occurredAt: createdAt,
      note: '',
      source: 'website'
    },
    createdAt,
    retryCount: 0
  };
}

function trackerDelete(operationId: string, entityId: string, createdAt: string): OfflineOperation {
  return {
    id: operationId,
    type: 'deleteTracker',
    payload: { id: entityId },
    createdAt,
    retryCount: 0
  };
}

function optionTrackerUpsert(
  operationId: string,
  optionIds: string[],
  createdAt: string
): OfflineOperation {
  return {
    id: operationId,
    type: 'upsertTracker',
    payload: {
      id: 'routine',
      name: 'Routine',
      unit: null,
      icon: '✦',
      color: '#334155',
      goal: null,
      presets: [],
      inputType: 'option',
      options: optionIds.map((id, index) => ({
        id,
        label: id === 'sleep' ? 'Sleep' : 'Exercise',
        sortOrder: index,
        createdAt
      })),
      active: true,
      sortOrder: 0,
      createdAt
    },
    createdAt,
    retryCount: 0
  };
}

function optionLogUpsert(
  operationId: string,
  optionId: string,
  createdAt: string
): OfflineOperation {
  return {
    id: operationId,
    type: 'upsertLog',
    payload: {
      id: 'routine-log',
      trackerId: 'routine',
      value: null,
      recordType: 'option',
      optionId,
      occurredAt: createdAt,
      note: '',
      source: 'website'
    },
    createdAt,
    retryCount: 0
  };
}

function settingsSave(operationId: string, createdAt: string): OfflineOperation {
  return {
    id: operationId,
    type: 'saveSettings',
    payload: { theme: 'dark', confirmDelete: true },
    createdAt,
    retryCount: 0
  };
}

describe('OfflineQueue', () => {
  it('uses a versioned storage key scoped to the user', () => {
    const storage = new MemoryStorage();
    const queue = new OfflineQueue(storage);

    queue.enqueue('user-a', trackerUpsert('operation-a', 'tracker-a', '2026-01-01T00:00:00.000Z'));

    expect(storage.getItem(`${QUEUE_KEY_PREFIX}user-a`)).not.toBeNull();
    expect(storage.getItem(`${QUEUE_KEY_PREFIX}user-b`)).toBeNull();
    expect(queue.load('user-b')).toEqual([]);
  });

  it('discards stored operations that fail schema validation', () => {
    const storage = new MemoryStorage();
    const queue = new OfflineQueue(storage);
    const valid = trackerUpsert('valid', 'tracker-a', '2026-01-01T00:00:00.000Z');
    storage.setItem(`${QUEUE_KEY_PREFIX}user-a`, JSON.stringify([
      valid,
      { ...valid, id: 'invalid', retryCount: -1 },
      { id: 'unknown', type: 'unknown', payload: {} }
    ]));

    expect(queue.load('user-a')).toEqual([valid]);
  });

  it.each(['{malformed', JSON.stringify({ not: 'an array' })])(
    'returns an empty queue for unusable stored data: %s',
    stored => {
      const storage = new MemoryStorage();
      const queue = new OfflineQueue(storage);
      storage.setItem(`${QUEUE_KEY_PREFIX}user-a`, stored);

      expect(queue.load('user-a')).toEqual([]);
    }
  );

  it('retains operation creation order', () => {
    const queue = new OfflineQueue(new MemoryStorage());
    const first = trackerUpsert('first', 'tracker-a', '2026-01-01T00:00:00.000Z');
    const second = logUpsert('second', 'log-a', '2026-01-01T00:00:01.000Z');

    queue.enqueue('user-a', first);

    expect(queue.enqueue('user-a', second).map(operation => operation.id)).toEqual([
      'first',
      'second'
    ]);
  });

  it('replaces an earlier pending upsert for the same entity', () => {
    const queue = new OfflineQueue(new MemoryStorage());
    const earlier = trackerUpsert(
      'earlier',
      'tracker-a',
      '2026-01-01T00:00:00.000Z',
      'Earlier'
    );
    const unrelated = trackerUpsert(
      'unrelated',
      'tracker-b',
      '2026-01-01T00:00:01.000Z'
    );
    const replacement = trackerUpsert(
      'replacement',
      'tracker-a',
      '2026-01-01T00:00:02.000Z',
      'Replacement'
    );

    queue.enqueue('user-a', earlier);
    queue.enqueue('user-a', unrelated);

    expect(queue.enqueue('user-a', replacement)).toEqual([replacement, unrelated]);
  });

  it('keeps a replacement Option tracker before logs that depend on its new options', () => {
    const queue = new OfflineQueue(new MemoryStorage());
    const initial = optionTrackerUpsert(
      'tracker-initial',
      ['sleep'],
      '2026-07-21T08:00:00.000Z'
    );
    const dependentLog = optionLogUpsert(
      'exercise-log',
      'exercise',
      '2026-07-21T08:01:00.000Z'
    );
    const replacement = optionTrackerUpsert(
      'tracker-replacement',
      ['sleep', 'exercise'],
      '2026-07-21T08:02:00.000Z'
    );

    queue.enqueue('user-a', initial);
    queue.enqueue('user-a', dependentLog);

    expect(queue.enqueue('user-a', replacement).map(operation => operation.id)).toEqual([
      'tracker-replacement',
      'exercise-log'
    ]);
  });

  it('removes queued option logs for options omitted by a replacement tracker', () => {
    const queue = new OfflineQueue(new MemoryStorage());
    queue.enqueue('user-a', optionTrackerUpsert('tracker-initial', ['sleep', 'exercise'], '2026-07-21T08:00:00.000Z'));
    queue.enqueue('user-a', optionLogUpsert('sleep-log', 'sleep', '2026-07-21T08:01:00.000Z'));
    queue.enqueue('user-a', optionLogUpsert('exercise-log', 'exercise', '2026-07-21T08:02:00.000Z'));

    expect(queue.enqueue(
      'user-a',
      optionTrackerUpsert('tracker-removal', ['exercise'], '2026-07-21T08:03:00.000Z')
    ).map(operation => operation.id)).toEqual(['tracker-removal', 'exercise-log']);
  });

  it('normalizes legacy v3 Unit tracker and log upserts from the existing queue key', () => {
    const storage = new MemoryStorage();
    const queue = new OfflineQueue(storage);
    const tracker = trackerUpsert('legacy-tracker', 'tracker-legacy', '2026-07-21T08:00:00.000Z');
    const log = logUpsert('legacy-log', 'log-legacy', '2026-07-21T08:01:00.000Z');
    const legacyTracker = structuredClone(tracker) as unknown as { payload: Record<string, unknown> };
    const legacyLog = structuredClone(log) as unknown as { payload: Record<string, unknown> };
    delete legacyTracker.payload.inputType;
    delete legacyTracker.payload.options;
    delete legacyLog.payload.recordType;
    delete legacyLog.payload.optionId;
    storage.setItem(`${QUEUE_KEY_PREFIX}user-a`, JSON.stringify([legacyTracker, legacyLog]));

    expect(queue.load('user-a')).toEqual([tracker, log]);
  });

  it('round-trips Option tracker and record operations without changing their variants', () => {
    const queue = new OfflineQueue(new MemoryStorage());
    const trackerOperation = optionTrackerUpsert(
      'tracker-operation',
      ['sleep'],
      '2026-07-21T08:00:00.000Z'
    );
    const logOperation = optionLogUpsert(
      'log-operation',
      'sleep',
      '2026-07-21T08:01:00.000Z'
    );

    queue.enqueue('user-a', trackerOperation);
    queue.enqueue('user-a', logOperation);

    expect(queue.load('user-a')).toEqual([trackerOperation, logOperation]);
  });

  it('removes earlier upserts when a delete for the same entity is queued', () => {
    const queue = new OfflineQueue(new MemoryStorage());
    const removed = trackerUpsert('upsert-a', 'tracker-a', '2026-01-01T00:00:00.000Z');
    const retained = trackerUpsert('upsert-b', 'tracker-b', '2026-01-01T00:00:01.000Z');
    const deletion = trackerDelete('delete-a', 'tracker-a', '2026-01-01T00:00:02.000Z');

    queue.enqueue('user-a', removed);
    queue.enqueue('user-a', retained);

    expect(queue.enqueue('user-a', deletion)).toEqual([retained, deletion]);
  });

  it('does not coalesce settings saves with entity operations or each other', () => {
    const queue = new OfflineQueue(new MemoryStorage());
    const entity = trackerUpsert('entity', 'shared-id', '2026-01-01T00:00:00.000Z');
    const firstSettings = settingsSave('settings-a', '2026-01-01T00:00:01.000Z');
    const secondSettings = settingsSave('settings-b', '2026-01-01T00:00:02.000Z');

    queue.enqueue('user-a', entity);
    queue.enqueue('user-a', firstSettings);

    expect(queue.enqueue('user-a', secondSettings)).toEqual([
      entity,
      firstSettings,
      secondSettings
    ]);
  });

  it('removes only the confirmed operation', () => {
    const queue = new OfflineQueue(new MemoryStorage());
    const first = trackerUpsert('first', 'tracker-a', '2026-01-01T00:00:00.000Z');
    const second = logUpsert('second', 'log-a', '2026-01-01T00:00:01.000Z');
    queue.enqueue('user-a', first);
    queue.enqueue('user-a', second);

    expect(queue.remove('user-a', 'first')).toEqual([second]);
  });

  it('increments the retry count of only the selected operation', () => {
    const queue = new OfflineQueue(new MemoryStorage());
    const first = trackerUpsert('first', 'tracker-a', '2026-01-01T00:00:00.000Z');
    const second = logUpsert('second', 'log-a', '2026-01-01T00:00:01.000Z');
    queue.enqueue('user-a', first);
    queue.enqueue('user-a', second);

    const updated = queue.incrementRetry('user-a', 'second');

    expect(updated.map(operation => operation.retryCount)).toEqual([0, 1]);
    expect(updated.map(operation => operation.id)).toEqual(['first', 'second']);
  });

  it('returns clones that cannot mutate the stored queue', () => {
    const queue = new OfflineQueue(new MemoryStorage());
    const operation = trackerUpsert('operation-a', 'tracker-a', '2026-01-01T00:00:00.000Z');

    const enqueued = queue.enqueue('user-a', operation);
    enqueued.splice(0, 1);

    const loaded = queue.load('user-a');
    loaded[0]!.retryCount = 99;

    expect(queue.load('user-a')).toEqual([operation]);
  });

  it('clears only the selected user queue', () => {
    const storage = new MemoryStorage();
    const queue = new OfflineQueue(storage);
    queue.enqueue('user-a', trackerUpsert('operation-a', 'tracker-a', '2026-01-01T00:00:00.000Z'));
    queue.enqueue('user-b', trackerUpsert('operation-b', 'tracker-b', '2026-01-01T00:00:00.000Z'));

    queue.clear('user-a');

    expect(queue.load('user-a')).toEqual([]);
    expect(queue.load('user-b').map(operation => operation.id)).toEqual(['operation-b']);
  });
});
