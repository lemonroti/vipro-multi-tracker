// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/unbound-method */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AppState, UserSettings } from '../../domain/models';
import type { BackupServiceContract } from '../../services/backup-service';
import type { OperationResult } from '../../services/sync-service';
import { createSettingsController, type SettingsControllerDependencies } from './index';

function state(overrides: Partial<AppState> = {}): AppState {
  return {
    version: 4,
    trackers: [],
    logs: [],
    settings: { theme: 'system', confirmDelete: true },
    ...overrides
  };
}

function installDom(): void {
  document.body.innerHTML = `
    <select id="themeSelect">
      <option value="system">Follow device</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
    <button id="confirmDeleteToggle"></button>
    <p id="storageInfo"></p>
    <span id="syncInfo"></span>
    <button id="syncNow">Sync now</button>
    <button id="exportJson">Export JSON</button>
    <button id="exportCsv">Export CSV</button>
    <label for="importFile">Import JSON</label>
    <input id="importFile" type="file" />
    <button id="loadSampleData">Load sample records</button>
    <button id="clearLogs">Clear all records</button>
    <button id="resetEverything">Reset full tracker</button>
    <span id="accountEmail"></span>
    <button id="settingsSignOut">Sign out</button>
  `;
}

function dependencies(snapshot = state()): SettingsControllerDependencies & {
  service: { save: ReturnType<typeof vi.fn<(input: UserSettings) => Promise<OperationResult>>> };
  backup: Record<keyof BackupServiceContract, ReturnType<typeof vi.fn>>;
} {
  return {
    service: {
      save: vi.fn().mockResolvedValue({ ok: true, queued: false } satisfies OperationResult)
    },
    backup: {
      exportJson: vi.fn(() => '{"version":3}'),
      exportCsv: vi.fn(() => 'ID,Tracker'),
      importJson: vi.fn().mockResolvedValue({ ok: true, queued: false }),
      loadSampleData: vi.fn().mockResolvedValue({ ok: true, queued: false }),
      clearLogs: vi.fn().mockResolvedValue({ ok: true, queued: false }),
      resetEverything: vi.fn().mockResolvedValue({ ok: true, queued: false })
    },
    download: vi.fn(),
    confirmAction: vi.fn(() => true),
    readFile: vi.fn().mockResolvedValue('{"version":3}'),
    store: { getState: () => structuredClone(snapshot) },
    shell: { applyTheme: vi.fn(), showToast: vi.fn() },
    syncNow: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    pendingCount: () => 0,
    isOnline: () => true,
    accountEmail: 'vincent@example.com'
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('SettingsController', () => {
  beforeEach(installDom);

  test('renders theme, confirmation, storage, sync, account, and enabled backup actions', () => {
    const snapshot = state({
      trackers: [{
        id: 'water', name: 'Water', unit: 'glass', icon: '💧', color: '#2563eb',
        goal: 8, presets: [1], inputType: 'unit', options: [],
        active: true, sortOrder: 0, createdAt: '2026-07-20T00:00:00Z'
      }],
      logs: [{
        id: 'one', trackerId: 'water', value: 1, occurredAt: '2026-07-21T00:00:00Z',
        note: '', source: 'website', recordType: 'unit', optionId: null
      }],
      settings: { theme: 'dark', confirmDelete: false }
    });
    const controller = createSettingsController(dependencies(snapshot));

    controller.render(snapshot);

    expect(document.querySelector<HTMLSelectElement>('#themeSelect')?.value).toBe('dark');
    expect(document.querySelector('#confirmDeleteToggle')?.classList.contains('on')).toBe(false);
    expect(document.querySelector('#storageInfo')?.textContent).toContain(
      '1 records and 1 trackers are stored in Supabase and cached locally'
    );
    expect(document.querySelector('#syncInfo')?.textContent).toBe('All local changes are synced.');
    expect(document.querySelector('#accountEmail')?.textContent).toBe('vincent@example.com');

    for (const selector of [
      '#exportJson', '#exportCsv', '#importFile', '#loadSampleData', '#clearLogs', '#resetEverything'
    ]) {
      const control = document.querySelector<HTMLInputElement | HTMLButtonElement>(selector);
      expect(control?.disabled, selector).toBe(false);
      expect(control?.title, selector).toBe('');
    }
    expect(document.querySelector<HTMLLabelElement>('label[for="importFile"]')?.title).toBe('');
  });

  test('persists theme selection and confirm-delete toggling through the settings service', async () => {
    const snapshot = state();
    const deps = dependencies(snapshot);
    const controller = createSettingsController(deps);
    controller.render(snapshot);

    const theme = document.querySelector<HTMLSelectElement>('#themeSelect')!;
    theme.value = 'dark';
    theme.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(deps.shell.applyTheme).toHaveBeenCalledWith('dark');
    expect(deps.service.save).toHaveBeenCalledWith({ theme: 'dark', confirmDelete: true });

    document.querySelector<HTMLButtonElement>('#confirmDeleteToggle')?.click();
    await settle();
    expect(deps.service.save).toHaveBeenLastCalledWith({
      theme: 'system', confirmDelete: false
    });
  });

  test('runs sync-now and sign-out exactly once and removes listeners on destroy', async () => {
    const deps = dependencies();
    const controller = createSettingsController(deps);

    document.querySelector<HTMLButtonElement>('#syncNow')?.click();
    document.querySelector<HTMLButtonElement>('#settingsSignOut')?.click();
    await settle();
    expect(deps.syncNow).toHaveBeenCalledOnce();
    expect(deps.signOut).toHaveBeenCalledOnce();

    controller.destroy();
    document.querySelector<HTMLButtonElement>('#syncNow')?.click();
    await settle();
    expect(deps.syncNow).toHaveBeenCalledOnce();
  });

  test('downloads deterministic JSON and CSV exports', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T08:00:00.000Z'));
    const deps = dependencies();
    createSettingsController(deps);

    document.querySelector<HTMLButtonElement>('#exportJson')?.click();
    document.querySelector<HTMLButtonElement>('#exportCsv')?.click();

    expect(deps.download).toHaveBeenNthCalledWith(1, {
      filename: 'my-tracker-backup-2026-07-21.json',
      content: '{"version":3}',
      type: 'application/json'
    });
    expect(deps.download).toHaveBeenNthCalledWith(2, {
      filename: 'my-tracker-records-2026-07-21.csv',
      content: 'ID,Tracker',
      type: 'text/csv;charset=utf-8'
    });
    vi.useRealTimers();
  });

  test('reads, confirms, and imports the selected JSON file', async () => {
    const deps = dependencies();
    createSettingsController(deps);
    const input = document.querySelector<HTMLInputElement>('#importFile')!;
    const file = new File(['backup'], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    input.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    await settle();

    expect(deps.readFile).toHaveBeenCalledWith(file);
    expect(deps.confirmAction).toHaveBeenCalledWith(
      'Import this backup? This replaces your current cloud data.'
    );
    expect(deps.backup.importJson).toHaveBeenCalledWith('{"version":3}');
    expect(deps.shell.showToast).toHaveBeenCalledWith('Backup imported');
    expect(input.value).toBe('');
  });

  test('runs sample, clear, and reset through BackupService with confirmations', async () => {
    const deps = dependencies();
    createSettingsController(deps);

    document.querySelector<HTMLButtonElement>('#loadSampleData')?.click();
    document.querySelector<HTMLButtonElement>('#clearLogs')?.click();
    document.querySelector<HTMLButtonElement>('#resetEverything')?.click();
    await settle();
    await settle();

    expect(deps.backup.loadSampleData).toHaveBeenCalledOnce();
    expect(deps.backup.clearLogs).toHaveBeenCalledOnce();
    expect(deps.backup.resetEverything).toHaveBeenCalledOnce();
    expect(deps.confirmAction).toHaveBeenCalledWith('Delete all records but keep trackers?');
    expect(deps.confirmAction).toHaveBeenCalledWith(
      'Reset the full tracker? All records and custom trackers will be removed.'
    );
  });
});
