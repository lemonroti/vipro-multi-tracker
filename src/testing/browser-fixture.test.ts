// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import type { OptionTracker, OptionTrackingLog } from '../domain/models';
import { OfflineQueue } from '../services/offline-queue';
import { RepositoryError } from '../services/repository-types';
import {
  createBrowserFixture,
  isBrowserFixtureScenario
} from './browser-fixture';

describe('browser fixture boundary', () => {
  beforeEach(() => localStorage.clear());

  it('accepts only the documented deterministic scenarios', () => {
    expect(isBrowserFixtureScenario('signed-out')).toBe(true);
    expect(isBrowserFixtureScenario('signed-in-empty')).toBe(true);
    expect(isBrowserFixtureScenario('populated')).toBe(true);
    expect(isBrowserFixtureScenario('offline-pending')).toBe(true);
    expect(isBrowserFixtureScenario('repository-error')).toBe(true);
    expect(isBrowserFixtureScenario('production')).toBe(false);
  });

  it('provides a signed-out auth state that can sign in without network access', async () => {
    const runtime = createBrowserFixture('signed-out', localStorage);
    const sessions: Array<string | null> = [];
    runtime.authService.onSessionChange(user => sessions.push(user?.email ?? null));

    expect(await runtime.authService.getSession()).toBeNull();
    await runtime.authService.signIn('browser@example.test', 'password');

    expect(sessions).toEqual(['browser@example.test']);
  });

  it('provides populated repositories through the production interfaces', async () => {
    const runtime = createBrowserFixture('populated', localStorage);
    const repositories = runtime.createRepositories('fixture-user');

    await expect(repositories.trackers.list()).resolves.toEqual([
      expect.objectContaining({ id: 'tracker-water', name: 'Water' }),
      expect.objectContaining({ id: 'tracker-reading', name: 'Reading' }),
      expect.objectContaining({
        id: 'tracker-sleep',
        inputType: 'option',
        name: 'Sleep Tracker',
        options: [
          expect.objectContaining({ id: 'option-sleep', label: 'Sleep', sortOrder: 0 }),
          expect.objectContaining({ id: 'option-wake', label: 'Wake', sortOrder: 1 })
        ]
      })
    ]);
    await expect(repositories.logs.listAll()).resolves.toEqual([
      expect.objectContaining({ id: 'log-water-morning', note: 'Morning glass' }),
      expect.objectContaining({ id: 'log-reading-evening', note: 'Evening chapter' })
    ]);
  });

  it('persists nested options and cascades logs for options omitted by an upsert', async () => {
    const runtime = createBrowserFixture('populated', localStorage);
    const repositories = runtime.createRepositories('fixture-user');
    const tracker: OptionTracker = {
      id: 'tracker-custom-option',
      inputType: 'option',
      name: 'Custom Option',
      unit: null,
      goal: null,
      presets: [],
      icon: '✦',
      color: '#334155',
      options: [
        {
          id: 'option-retained',
          label: 'Retained',
          sortOrder: 0,
          createdAt: '2026-07-21T08:00:00.000Z'
        },
        {
          id: 'option-removed',
          label: 'Removed',
          sortOrder: 1,
          createdAt: '2026-07-21T08:00:00.000Z'
        }
      ],
      active: true,
      sortOrder: 3,
      createdAt: '2026-07-21T08:00:00.000Z'
    };
    const log: OptionTrackingLog = {
      id: 'log-removed-option',
      trackerId: tracker.id,
      value: null,
      recordType: 'option',
      optionId: 'option-removed',
      occurredAt: '2026-07-21T09:00:00.000Z',
      note: '',
      source: 'fixture'
    };

    await repositories.trackers.upsert(tracker);
    await repositories.logs.upsert(log);
    await expect(repositories.trackers.list()).resolves.toContainEqual(tracker);

    await repositories.trackers.upsert({
      ...tracker,
      options: [tracker.options[0]!]
    });

    await expect(repositories.logs.listAll()).resolves.not.toContainEqual(log);
  });

  it('represents a genuinely empty signed-in repository for default seeding', async () => {
    const runtime = createBrowserFixture('signed-in-empty', localStorage);
    const repositories = runtime.createRepositories('fixture-user');

    await expect(repositories.trackers.list()).resolves.toEqual([]);
    await expect(repositories.logs.listAll()).resolves.toEqual([]);
    await expect(repositories.settings.get()).resolves.toBeNull();
  });

  it('prepares a cached pending operation for the offline scenario', () => {
    createBrowserFixture('offline-pending', localStorage);

    expect(new OfflineQueue(localStorage).load('fixture-user')).toEqual([
      expect.objectContaining({ id: 'pending-log-operation', type: 'upsertLog' })
    ]);
  });

  it('exposes repository failures without replacing application behavior', async () => {
    const runtime = createBrowserFixture('repository-error', localStorage);
    const repositories = runtime.createRepositories('fixture-user');

    await expect(repositories.trackers.list()).rejects.toEqual(
      new RepositoryError('persistence', 'Fixture repository unavailable.')
    );
  });
});
