import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test, vi } from 'vitest';
import type { Tracker, TrackingLog } from '../domain/models';
import {
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
