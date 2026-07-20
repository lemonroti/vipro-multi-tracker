import type { AppState, ThemePreference, UserSettings } from '../../domain/models';
import type { SettingsService } from '../../services/settings-service';
import type { AppStore } from '../../state/app-store';
import type { ShellController } from '../shell';
import { getElement } from '../../shared/dom';

const MIGRATION_MESSAGE = 'Migration in progress';
const DISABLED_ACTIONS = [
  '#exportJson', '#exportCsv', '#importFile', '#loadSampleData', '#clearLogs', '#resetEverything'
] as const;

export interface SettingsControllerDependencies {
  service: Pick<SettingsService, 'save'>;
  store: Pick<AppStore, 'getState'>;
  shell: Pick<ShellController, 'applyTheme' | 'showToast'>;
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

  themeSelect.addEventListener('change', handleTheme);
  confirmToggle.addEventListener('click', handleConfirmToggle);
  syncButton.addEventListener('click', handleSyncClick);
  signOutButton.addEventListener('click', handleSignOutClick);

  DISABLED_ACTIONS.forEach(selector => {
    const control = getElement<HTMLInputElement | HTMLButtonElement>(selector);
    control.disabled = true;
    control.title = MIGRATION_MESSAGE;
  });
  const importLabel = document.querySelector<HTMLLabelElement>('label[for="importFile"]');
  if (importLabel) {
    importLabel.title = MIGRATION_MESSAGE;
    importLabel.setAttribute('aria-disabled', 'true');
    importLabel.classList.add('busy');
  }

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
    }
  };
}
