import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test, vi } from 'vitest';
import type { AppState, Tracker, TrackingLog } from '../domain/models';
import {
  SupabaseBackupRepository,
  SupabaseLogRepository,
  SupabaseTrackerRepository
} from './supabase-repositories';

const NOW = '2026-07-21T08:00:00.000Z';

function tracker(): Tracker {
  return {
    id: 'tracker-1', name: 'Water', unit: 'glass', icon: '💧', color: '#2563eb',
    goal: 8, presets: [1], inputType: 'unit', options: [],
    active: true, sortOrder: 0, createdAt: NOW
  };
}

function optionTracker(): Tracker {
  return {
    id: 'tracker-2', name: 'Wake quality', unit: null, icon: '☀️', color: '#c2410c',
    goal: null, presets: [], inputType: 'option', options: [{
      id: 'tired-id', label: 'Tired', sortOrder: 1, createdAt: NOW
    }, {
      id: 'rested-id', label: 'Rested', sortOrder: 0, createdAt: NOW
    }], active: true, sortOrder: 1, createdAt: NOW
  };
}

function log(): TrackingLog {
  return {
    id: 'log-1', trackerId: 'tracker-1', value: 1, occurredAt: NOW,
    note: '', source: 'website', recordType: 'unit', optionId: null
  };
}

function state(): AppState {
  return {
    version: 4,
    trackers: [tracker(), optionTracker()],
    logs: [log(), {
      id: 'log-2', trackerId: 'tracker-2', value: null, optionId: 'rested-id',
      recordType: 'option', occurredAt: NOW, note: '', source: 'website'
    }],
    settings: { theme: 'dark', confirmDelete: false }
  };
}

function insertClient() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ insert }));
  return { client: { from } as unknown as SupabaseClient, from, insert };
}

function deleteClient() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ delete: remove }));
  return { client: { from } as unknown as SupabaseClient, from, remove, eq };
}

describe('Supabase backup repository boundaries', () => {
  test('restores a complete state through one RPC without caller-provided user IDs', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const repository = new SupabaseBackupRepository(client);

    await repository.restoreState(state());

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('restore_tracker_state', {
      trackers_payload: [{
        id: 'tracker-1',
        name: 'Water',
        input_type: 'unit',
        unit: 'glass',
        icon: '💧',
        color: '#2563eb',
        daily_goal: 8,
        quick_values: [1],
        is_active: true,
        sort_order: 0,
        created_at: NOW,
        options: []
      }, {
        id: 'tracker-2',
        name: 'Wake quality',
        input_type: 'option',
        unit: null,
        icon: '☀️',
        color: '#c2410c',
        daily_goal: null,
        quick_values: null,
        is_active: true,
        sort_order: 1,
        created_at: NOW,
        options: [{
          id: 'rested-id',
          label: 'Rested',
          sort_order: 0,
          created_at: NOW
        }, {
          id: 'tired-id',
          label: 'Tired',
          sort_order: 1,
          created_at: NOW
        }]
      }],
      logs_payload: [{
        id: 'log-1',
        tracker_id: 'tracker-1',
        value: 1,
        option_id: null,
        occurred_at: NOW,
        note: null,
        source: 'website',
        client_id: 'log-1'
      }, {
        id: 'log-2',
        tracker_id: 'tracker-2',
        value: null,
        option_id: 'rested-id',
        occurred_at: NOW,
        note: null,
        source: 'website',
        client_id: 'log-2'
      }],
      settings_payload: {
        theme: 'dark',
        preferences: { confirmDelete: false },
        dashboard_layout: {}
      }
    });
    expect(JSON.stringify(rpc.mock.calls[0])).not.toContain('user_id');
  });

  test('loads owner-scoped trackers with ordered nested options', async () => {
    function query(data: unknown[]) {
      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        then: (
          resolve: (value: { data: unknown[]; error: null }) => unknown,
          reject: (reason?: unknown) => unknown
        ) => Promise.resolve({ data, error: null }).then(resolve, reject)
      };
      builder.select.mockReturnValue(builder);
      builder.eq.mockReturnValue(builder);
      builder.order.mockReturnValue(builder);
      return builder;
    }
    const trackerQuery = query([{
      id: 'tracker-2', user_id: 'user-1', name: 'Wake quality', input_type: 'option',
      unit: null, icon: '☀️', color: '#c2410c', daily_goal: null,
      quick_values: null, is_active: true, sort_order: 1, created_at: NOW
    }]);
    const optionQuery = query([
      {
        id: 'tired-id', user_id: 'user-1', tracker_id: 'tracker-2', label: 'Tired',
        sort_order: 1, created_at: NOW
      },
      {
        id: 'rested-id', user_id: 'user-1', tracker_id: 'tracker-2', label: 'Rested',
        sort_order: 0, created_at: NOW
      }
    ]);
    const from = vi.fn((table: string) => (
      table === 'trackers' ? trackerQuery : optionQuery
    ));
    const repository = new SupabaseTrackerRepository(
      { from } as unknown as SupabaseClient,
      'user-1'
    );

    await expect(repository.list()).resolves.toEqual([expect.objectContaining({
      id: 'tracker-2',
      inputType: 'option',
      options: [
        expect.objectContaining({ id: 'rested-id', sortOrder: 0 }),
        expect.objectContaining({ id: 'tired-id', sortOrder: 1 })
      ]
    })]);
    expect(from).toHaveBeenCalledWith('trackers');
    expect(from).toHaveBeenCalledWith('tracker_options');
    expect(trackerQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(optionQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  test('maps invalid tracker and nested option combinations to safe validation errors', async () => {
    function query(data: unknown[]) {
      const builder = {
        select: vi.fn(), eq: vi.fn(), order: vi.fn(),
        then: (
          resolve: (value: { data: unknown[]; error: null }) => unknown,
          reject: (reason?: unknown) => unknown
        ) => Promise.resolve({ data, error: null }).then(resolve, reject)
      };
      builder.select.mockReturnValue(builder);
      builder.eq.mockReturnValue(builder);
      builder.order.mockReturnValue(builder);
      return builder;
    }
    const from = vi.fn((table: string) => query(table === 'trackers' ? [{
      id: 'tracker-2', user_id: 'user-1', name: 'Wake quality', input_type: 'option',
      unit: null, icon: '☀️', color: '#c2410c', daily_goal: null,
      quick_values: null, is_active: true, sort_order: 1, created_at: NOW
    }] : []));
    const repository = new SupabaseTrackerRepository(
      { from } as unknown as SupabaseClient,
      'user-1'
    );

    await expect(repository.list()).rejects.toMatchObject({
      name: 'RepositoryError',
      kind: 'validation',
      message: 'Cloud storage rejected invalid data.'
    });
  });

  test.each([
    ['Unit', tracker(), []],
    ['Option', optionTracker(), [{
      id: 'rested-id',
      label: 'Rested',
      sort_order: 0,
      created_at: NOW
    }, {
      id: 'tired-id',
      label: 'Tired',
      sort_order: 1,
      created_at: NOW
    }]]
  ])('atomically upserts %s trackers and their options through one RPC', async (
    _variant,
    value,
    expectedOptions
  ) => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const repository = new SupabaseTrackerRepository(
      { rpc } as unknown as SupabaseClient,
      'user-1'
    );

    await repository.upsert(value);

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('save_tracker_with_options', {
      tracker_payload: {
        id: value.id,
        name: value.name,
        input_type: value.inputType,
        unit: value.unit,
        icon: value.icon,
        color: value.color,
        daily_goal: value.goal,
        quick_values: value.inputType === 'unit' ? value.presets : null,
        is_active: value.active,
        sort_order: value.sortOrder
      },
      options_payload: expectedOptions
    });
    expect(JSON.stringify(rpc.mock.calls[0])).not.toContain('user_id');
  });

  test('translates restore RPC failures into safe repository errors', async () => {
    const rpc = vi.fn().mockResolvedValue({
      error: { code: '42501', message: 'row-level security denied the restore' }
    });
    const repository = new SupabaseBackupRepository(
      { rpc } as unknown as SupabaseClient
    );

    await expect(repository.restoreState(state())).rejects.toMatchObject({
      name: 'RepositoryError',
      kind: 'permission',
      message: 'You do not have permission to access this data.'
    });
  });

  test('inserts tracker batches with the active user ID on every row', async () => {
    const { client, from, insert } = insertClient();
    const repository = new SupabaseTrackerRepository(client, 'user-1');

    await repository.insertMany([tracker()]);

    expect(from).toHaveBeenCalledWith('trackers');
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'tracker-1', user_id: 'user-1' })
    ]);
  });

  test('deletes all trackers only for the active user', async () => {
    const { client, from, remove, eq } = deleteClient();
    const repository = new SupabaseTrackerRepository(client, 'user-1');

    await repository.deleteAll();

    expect(from).toHaveBeenCalledWith('trackers');
    expect(remove).toHaveBeenCalledOnce();
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  test('inserts log batches with the active user ID on every row', async () => {
    const { client, from, insert } = insertClient();
    const repository = new SupabaseLogRepository(client, 'user-1');

    await repository.insertMany([log()]);

    expect(from).toHaveBeenCalledWith('tracking_logs');
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'log-1', user_id: 'user-1' })
    ]);
  });
});
