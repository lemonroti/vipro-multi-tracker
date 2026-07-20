import type { OfflineOperation } from './domain/operations';
import type { ApplicationRuntime } from './runtime/application-runtime';
import { createProductionRuntime } from './runtime/application-runtime';
import { createAuthController, type AuthSession } from './features/auth';
import { createDashboardController } from './features/dashboard';
import { createHistoryController } from './features/history';
import { createLogController } from './features/logs';
import { createSettingsController, type DownloadRequest } from './features/settings';
import { createShellController } from './features/shell';
import { createTrackerController } from './features/trackers';
import { createAppStore } from './state/app-store';
import type { SessionUser } from './services/auth-service';
import { UserCache } from './services/cache';
import { BackupService } from './services/backup-service';
import { CloudStateService } from './services/cloud-state-service';
import { LogService } from './services/log-service';
import { OfflineQueue } from './services/offline-queue';
import { SettingsService } from './services/settings-service';
import { SyncService } from './services/sync-service';
import { TrackerService } from './services/tracker-service';

const FATAL_STARTUP_MESSAGE =
  'The app could not finish loading. Refresh the page and check your internet connection.';

interface ActiveUserApplication {
  userId: string;
  refreshCloud(): Promise<void>;
  destroy(): void;
}

let started = false;

async function resolveRuntime(): Promise<ApplicationRuntime> {
  if (import.meta.env.DEV) {
    const scenario = new URLSearchParams(window.location.search).get('fixture');
    const fixtureModule = await import('./testing/browser-fixture');
    if (fixtureModule.isBrowserFixtureScenario(scenario)) {
      return fixtureModule.createBrowserFixture(scenario, localStorage);
    }
  }
  return createProductionRuntime();
}

function authSession(user: SessionUser | null): AuthSession | null {
  if (user === null) return null;
  return user.email === undefined
    ? { user: { id: user.id } }
    : { user: { id: user.id, email: user.email } };
}

function downloadFile(request: DownloadRequest): void {
  const blob = new Blob([request.content], { type: request.type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = request.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function handleFatalStartupError(error: unknown): void {
  if (import.meta.env.DEV) console.error('Typed application startup failed.', error);
  const message = document.querySelector<HTMLElement>('#authMessage');
  if (message) message.textContent = FATAL_STARTUP_MESSAGE;
}

export async function startApplication(): Promise<void> {
  if (started) return;
  started = true;

  const runtime = await resolveRuntime();
  const authService = runtime.authService;
  const store = createAppStore();
  const cache = new UserCache(localStorage);
  const queue = new OfflineQueue(localStorage);
  const shell = createShellController();
  let activeApplication: ActiveUserApplication | null = null;

  const updateConnection = (syncing = false): void => {
    shell.updateConnection({
      online: navigator.onLine,
      pendingCount: activeApplication === null
        ? 0
        : queue.load(activeApplication.userId).length,
      syncing
    });
  };

  const createUserApplication = (user: SessionUser): ActiveUserApplication => {
    const userId = user.id;
    const repositories = runtime.createRepositories(userId);
    const trackerRepository = repositories.trackers;
    const logRepository = repositories.logs;
    const settingsRepository = repositories.settings;
    const backupRepository = repositories.backup;
    const executeOperation = async (operation: OfflineOperation): Promise<void> => {
      if (operation.type === 'upsertTracker') {
        await trackerRepository.upsert(operation.payload);
      } else if (operation.type === 'deleteTracker') {
        await trackerRepository.delete(operation.payload.id);
      } else if (operation.type === 'upsertLog') {
        await logRepository.upsert(operation.payload);
      } else if (operation.type === 'deleteLog') {
        await logRepository.delete(operation.payload.id);
      } else {
        await settingsRepository.save(operation.payload);
      }
    };
    const syncService = new SyncService(
      store,
      cache,
      queue,
      executeOperation,
      () => navigator.onLine
    );
    const cloudStateService = new CloudStateService(
      userId,
      store,
      cache,
      queue,
      syncService,
      trackerRepository,
      logRepository,
      settingsRepository,
      runtime.createId,
      runtime.now
    );
    const trackerService = new TrackerService(
      userId,
      store,
      cache,
      syncService,
      runtime.createId,
      runtime.now
    );
    const logService = new LogService(
      userId,
      store,
      cache,
      syncService,
      runtime.createId,
      runtime.now
    );
    const settingsService = new SettingsService(
      userId,
      store,
      cache,
      syncService,
      runtime.createId,
      runtime.now
    );
    let refreshPromise: Promise<void> | null = null;
    const refreshCloud = (): Promise<void> => {
      if (!navigator.onLine) return Promise.resolve();
      if (refreshPromise !== null) return refreshPromise;
      updateConnection(true);
      const hasPendingOperations = queue.load(userId).length > 0;
      refreshPromise = cloudStateService.load({ hasPendingOperations })
        .then(() => undefined)
        .finally(() => {
          refreshPromise = null;
          updateConnection();
        });
      return refreshPromise;
    };
    const backupService = new BackupService({
      userId,
      store,
      cache,
      queue,
      backup: backupRepository,
      trackers: trackerRepository,
      logs: logRepository,
      reloadCloudState: () => cloudStateService.reload().then(() => undefined),
      createId: runtime.createId,
      now: runtime.now,
      isOnline: () => navigator.onLine
    });
    const logController = createLogController({
      service: logService,
      store,
      shell
    });
    const trackerController = createTrackerController({
      service: trackerService,
      store,
      shell,
      openLog(trackerId) {
        logController.openModal({ trackerId });
      }
    });
    const settingsController = createSettingsController({
      service: settingsService,
      backup: backupService,
      store,
      shell,
      download: downloadFile,
      confirmAction: message => window.confirm(message),
      readFile: file => file.text(),
      syncNow: refreshCloud,
      signOut: () => authService.signOut(),
      pendingCount: () => queue.load(userId).length,
      isOnline: () => navigator.onLine,
      ...(user.email === undefined ? {} : { accountEmail: user.email })
    });

    const dashboardController = createDashboardController({
      addQuickLog: (trackerId, value) => logController.addQuickLog(trackerId, value),
      openCustomLog(trackerId) {
        logController.openModal({ trackerId });
      },
      openTrackerEditor(trackerId) {
        trackerController.openModal(trackerId);
      }
    });
    const historyController = createHistoryController({
      openLogEditor(logId) {
        logController.openModal({ logId });
      },
      deleteLog: logId => logController.deleteLog(logId)
    });
    const renderFeatures = (state: ReturnType<typeof store.getState>): void => {
      dashboardController.render(state);
      historyController.render(state);
      trackerController.render(state);
      settingsController.render(state);
    };
    const stopFeatureListener = store.subscribe(renderFeatures);
    renderFeatures(store.getState());

    return {
      userId,
      refreshCloud,
      destroy() {
        stopFeatureListener();
        dashboardController.destroy();
        historyController.destroy();
        trackerController.destroy();
        logController.destroy();
        settingsController.destroy();
      }
    };
  };

  const activateUser = async (user: SessionUser): Promise<void> => {
    if (activeApplication?.userId !== user.id) {
      activeApplication?.destroy();
      store.replace(cache.load(user.id));
      activeApplication = createUserApplication(user);
      shell.applyTheme(store.getState().settings.theme);
      updateConnection();
    }
    await activeApplication.refreshCloud();
  };

  const resetApplication = (): void => {
    activeApplication?.destroy();
    activeApplication = null;
    store.reset();
    shell.applyTheme('system');
    updateConnection();
  };

  const authController = createAuthController({
    async getSession() {
      const user = await authService.getSession();
      if (user) await activateUser(user);
      return authSession(user);
    },
    signIn: (email, password) => authService.signIn(email, password),
    signUp: (email, password) => authService.signUp(email, password),
    signOut: () => authService.signOut(),
    onSessionChange(listener) {
      return authService.onSessionChange(user => {
        if (user === null) {
          listener(null);
          return;
        }
        void activateUser(user)
          .then(() => listener(authSession(user)))
          .catch(handleFatalStartupError);
      });
    },
    resetApplication
  });

  const handleOnline = (): void => {
    updateConnection();
    if (activeApplication) {
      void activeApplication.refreshCloud().catch(handleFatalStartupError);
    }
  };
  const handleOffline = (): void => updateConnection();
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  const handleSystemThemeChange = (): void => {
    if (store.getState().settings.theme === 'system') shell.applyTheme('system');
  };
  const stopStoreListener = store.subscribe(state => {
    shell.applyTheme(state.settings.theme);
    updateConnection();
  });
  const destroyApplication = (): void => {
    activeApplication?.destroy();
    authController.destroy();
    shell.destroy();
    stopStoreListener();
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    systemTheme.removeEventListener('change', handleSystemThemeChange);
    window.removeEventListener('beforeunload', destroyApplication);
    activeApplication = null;
    started = false;
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  systemTheme.addEventListener('change', handleSystemThemeChange);
  window.addEventListener('beforeunload', destroyApplication);
  shell.applyTheme('system');
  updateConnection();
  await authController.initialize();
}

if (new URLSearchParams(window.location.search).get('runtime') === 'typed') {
  void startApplication().catch(handleFatalStartupError);
}
