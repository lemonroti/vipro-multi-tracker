// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
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
      expect.objectContaining({ id: 'tracker-reading', name: 'Reading' })
    ]);
    await expect(repositories.logs.listAll()).resolves.toEqual([
      expect.objectContaining({ id: 'log-water-morning', note: 'Morning glass' }),
      expect.objectContaining({ id: 'log-reading-evening', note: 'Evening chapter' })
    ]);
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
