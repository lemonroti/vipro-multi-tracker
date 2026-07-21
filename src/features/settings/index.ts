import type { AppState, ThemePreference, UserSettings } from '../../domain/models';
import type { BackupServiceContract } from '../../services/backup-service';
import type { SettingsService } from '../../services/settings-service';
import type { AppStore } from '../../state/app-store';
import type { ShellController } from '../shell';
import { localDateKey } from '../../shared/dates';
import { getElement } from '../../shared/dom';

export interface DownloadRequest {
  filename: string;
  content: string;
  type: string;
}

export interface SettingsControllerDependencies {
  service: Pick<SettingsService, 'save'>;
  backup: BackupServiceContract;
  store: Pick<AppStore, 'getState'>;
  shell: Pick<ShellController, 'applyTheme' | 'showToast'>;
  download(request: DownloadRequest): void;
  confirmAction(message: string): boolean;
  readFile(file: File): Promise<string>;
  syncNow(): Promise<void>;
  signOut(): Promise<void>;
  pendingCount(): number;
  isOnline(): boolean;
  accountEmail?: string;
}

export interface SettingsController {
  render(state: Readonly<AppState>): void;
  destroy(): void;
}

function storageSize(state: Readonly<AppState>): string {
  const bytes = new Blob([JSON.stringify(state)]).size;
  return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`;
}

function isTheme(value: string): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function createSettingsController(
  dependencies: SettingsControllerDependencies
): SettingsController {
  const themeSelect = getElement<HTMLSelectElement>('#themeSelect');
  const confirmToggle = getElement<HTMLButtonElement>('#confirmDeleteToggle');
  const syncButton = getElement<HTMLButtonElement>('#syncNow');
  const signOutButton = getElement<HTMLButtonElement>('#settingsSignOut');
  const exportJsonButton = getElement<HTMLButtonElement>('#exportJson');
  const exportCsvButton = getElement<HTMLButtonElement>('#exportCsv');
  const importInput = getElement<HTMLInputElement>('#importFile');
  const sampleButton = getElement<HTMLButtonElement>('#loadSampleData');
  const clearLogsButton = getElement<HTMLButtonElement>('#clearLogs');
  const resetButton = getElement<HTMLButtonElement>('#resetEverything');

  const save = async (settings: UserSettings): Promise<void> => {
    const result = await dependencies.service.save(settings);
    dependencies.shell.showToast(
      result.ok
        ? `Settings saved${result.queued ? ' offline' : ''}`
        : result.error.message
    );
  };

  const handleTheme = (): void => {
    if (!isTheme(themeSelect.value)) return;
    const settings = dependencies.store.getState().settings;
    dependencies.shell.applyTheme(themeSelect.value);
    void save({ ...settings, theme: themeSelect.value });
  };
  const handleConfirmToggle = (): void => {
    const settings = dependencies.store.getState().settings;
    void save({ ...settings, confirmDelete: !settings.confirmDelete });
  };
  const handleSync = async (): Promise<void> => {
    syncButton.disabled = true;
    try {
      await dependencies.syncNow();
    } catch (error) {
      dependencies.shell.showToast(
        error instanceof Error ? error.message : 'Could not sync data.'
      );
    } finally {
      syncButton.disabled = false;
    }
  };
  const handleSignOut = async (): Promise<void> => {
    try {
      await dependencies.signOut();
    } catch (error) {
      dependencies.shell.showToast(
        error instanceof Error ? error.message : 'Could not sign out. Please try again.'
      );
    }
  };
  const handleSyncClick = (): void => void handleSync();
  const handleSignOutClick = (): void => void handleSignOut();
  const handleExportJson = (): void => {
    dependencies.download({
      filename: `my-tracker-backup-${localDateKey()}.json`,
      content: dependencies.backup.exportJson(),
      type: 'application/json'
    });
  };
  const handleExportCsv = (): void => {
    dependencies.download({
      filename: `my-tracker-records-${localDateKey()}.csv`,
      content: dependencies.backup.exportCsv(),
      type: 'text/csv;charset=utf-8'
    });
  };
  const showOperationResult = (
    result: Awaited<ReturnType<BackupServiceContract['importJson']>>,
    successMessage: string
  ): void => {
    dependencies.shell.showToast(result.ok ? successMessage : result.error.message);
  };
  const handleImport = async (): Promise<void> => {
    const file = importInput.files?.[0];
    if (!file) return;
    importInput.disabled = true;
    try {
      const text = await dependencies.readFile(file);
      if (!dependencies.confirmAction(
        'Import this backup? This replaces your current cloud data.'
      )) return;
      showOperationResult(await dependencies.backup.importJson(text), 'Backup imported');
    } catch (error) {
      dependencies.shell.showToast(
        error instanceof Error ? error.message : 'Could not read the backup file.'
      );
    } finally {
      importInput.value = '';
      importInput.disabled = false;
    }
  };
  const runButtonOperation = async (
    button: HTMLButtonElement,
    operation: () => ReturnType<BackupServiceContract['clearLogs']>,
    successMessage: string
  ): Promise<void> => {
    button.disabled = true;
    try {
      showOperationResult(await operation(), successMessage);
    } finally {
      button.disabled = false;
    }
  };
  const handleSample = (): void => {
    void runButtonOperation(
      sampleButton,
      () => dependencies.backup.loadSampleData(),
      'Sample records added'
    );
  };
  const handleClearLogs = (): void => {
    if (!dependencies.confirmAction('Delete all records but keep trackers?')) return;
    void runButtonOperation(
      clearLogsButton,
      () => dependencies.backup.clearLogs(),
      'All records cleared'
    );
  };
  const handleReset = (): void => {
    if (!dependencies.confirmAction(
      'Reset the full tracker? All records and custom trackers will be removed.'
    )) return;
    void runButtonOperation(
      resetButton,
      () => dependencies.backup.resetEverything(),
      'Tracker reset'
    );
  };
  const handleImportChange = (): void => void handleImport();

  themeSelect.addEventListener('change', handleTheme);
  confirmToggle.addEventListener('click', handleConfirmToggle);
  syncButton.addEventListener('click', handleSyncClick);
  signOutButton.addEventListener('click', handleSignOutClick);
  exportJsonButton.addEventListener('click', handleExportJson);
  exportCsvButton.addEventListener('click', handleExportCsv);
  importInput.addEventListener('change', handleImportChange);
  sampleButton.addEventListener('click', handleSample);
  clearLogsButton.addEventListener('click', handleClearLogs);
  resetButton.addEventListener('click', handleReset);

  return {
    render(state) {
      themeSelect.value = state.settings.theme;
      confirmToggle.classList.toggle('on', state.settings.confirmDelete);
      getElement('#storageInfo').textContent =
        `${state.logs.length} records and ${state.trackers.length} trackers are stored in Supabase and cached locally (${storageSize(state)}).`;
      const pending = dependencies.pendingCount();
      getElement('#syncInfo').textContent = pending
        ? `${pending} change${pending === 1 ? '' : 's'} waiting to sync.`
        : dependencies.isOnline()
          ? 'All local changes are synced.'
          : 'Offline with no pending changes.';
      getElement('#accountEmail').textContent = dependencies.accountEmail || 'Signed-in user';
    },
    destroy() {
      themeSelect.removeEventListener('change', handleTheme);
      confirmToggle.removeEventListener('click', handleConfirmToggle);
      syncButton.removeEventListener('click', handleSyncClick);
      signOutButton.removeEventListener('click', handleSignOutClick);
      exportJsonButton.removeEventListener('click', handleExportJson);
      exportCsvButton.removeEventListener('click', handleExportCsv);
      importInput.removeEventListener('change', handleImportChange);
      sampleButton.removeEventListener('click', handleSample);
      clearLogsButton.removeEventListener('click', handleClearLogs);
      resetButton.removeEventListener('click', handleReset);
    }
  };
}
