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
    goal: 8, presets: [1], active: true, sortOrder: 0, createdAt: NOW
  };
}

function log(): TrackingLog {
  return {
    id: 'log-1', trackerId: 'tracker-1', value: 1, occurredAt: NOW,
    note: '', source: 'website'
  };
}

function state(): AppState {
  return {
    version: 3,
    trackers: [tracker()],
    logs: [log()],
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
        unit: 'glass',
        icon: '💧',
        color: '#2563eb',
        daily_goal: 8,
        quick_values: [1],
        is_active: true,
        sort_order: 0
      }],
      logs_payload: [{
        id: 'log-1',
        tracker_id: 'tracker-1',
        value: 1,
        occurred_at: NOW,
        note: null,
        source: 'website',
        client_id: 'log-1'
      }],
      settings_payload: {
        theme: 'dark',
        preferences: { confirmDelete: false },
        dashboard_layout: {}
      }
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
