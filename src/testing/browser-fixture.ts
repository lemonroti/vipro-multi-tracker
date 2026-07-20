import type { AppState, TrackingLog, UserSettings } from '../domain/models';
import type { AuthService, SessionUser } from '../services/auth-service';
import { UserCache } from '../services/cache';
import { OfflineQueue } from '../services/offline-queue';
import { RepositoryError } from '../services/repository-types';
import type {
  ApplicationRuntime,
  RuntimeRepositories
} from '../runtime/application-runtime';

export type BrowserFixtureScenario =
  | 'signed-out'
  | 'signed-in-empty'
  | 'populated'
  | 'offline-pending'
  | 'repository-error';

const FIXTURE_USER: SessionUser = {
  id: 'fixture-user',
  email: 'browser@example.test'
};
const REPOSITORY_ERROR_MESSAGE = 'Fixture repository unavailable.';

function todayAt(hour: number): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function populatedState(): AppState {
  return {
    version: 3,
    trackers: [
      {
        id: 'tracker-water',
        name: 'Water',
        unit: 'glass',
        icon: '💧',
        color: '#2563eb',
        goal: 8,
        presets: [1, 2],
        active: true,
        sortOrder: 0,
        createdAt: todayAt(8)
      },
      {
        id: 'tracker-reading',
        name: 'Reading',
        unit: 'minute',
        icon: '📖',
        color: '#6d4aff',
        goal: 30,
        presets: [10, 20],
        active: true,
        sortOrder: 1,
        createdAt: todayAt(8)
      }
    ],
    logs: [
      {
        id: 'log-water-morning',
        trackerId: 'tracker-water',
        value: 1,
        occurredAt: todayAt(9),
        note: 'Morning glass',
        source: 'fixture'
      },
      {
        id: 'log-reading-evening',
        trackerId: 'tracker-reading',
        value: 20,
        occurredAt: todayAt(20),
        note: 'Evening chapter',
        source: 'fixture'
      }
    ],
    settings: { theme: 'system', confirmDelete: true }
  };
}

function cloneState(state: AppState): AppState {
  return structuredClone(state);
}

function repositoryFailure(): RepositoryError {
  return new RepositoryError('persistence', REPOSITORY_ERROR_MESSAGE);
}

class FixtureAuthService implements AuthService {
  private user: SessionUser | null;
  private readonly listeners = new Set<(user: SessionUser | null) => void>();

  constructor(signedIn: boolean) {
    this.user = signedIn ? FIXTURE_USER : null;
  }

  getSession(): Promise<SessionUser | null> {
    return Promise.resolve(this.user === null ? null : { ...this.user });
  }

  signIn(email: string): Promise<void> {
    this.user = { id: FIXTURE_USER.id, email };
    this.emit();
    return Promise.resolve();
  }

  signUp(email: string): Promise<{ signedIn: boolean }> {
    this.user = { id: FIXTURE_USER.id, email };
    this.emit();
    return Promise.resolve({ signedIn: true });
  }

  signOut(): Promise<void> {
    this.user = null;
    this.emit();
    return Promise.resolve();
  }

  onSessionChange(listener: (user: SessionUser | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const user = this.user === null ? null : { ...this.user };
    this.listeners.forEach(listener => listener(user));
  }
}

class FixtureRepositories implements RuntimeRepositories {
  private state: AppState;
  private settingsState: UserSettings | null;

  constructor(
    initialState: AppState,
    hasSettings: boolean,
    private readonly shouldFail: boolean
  ) {
    this.state = cloneState(initialState);
    this.settingsState = hasSettings ? structuredClone(initialState.settings) : null;
  }

  readonly trackers: RuntimeRepositories['trackers'] = {
    list: () => this.resolve(this.state.trackers),
    upsert: tracker => this.mutate(() => {
      const index = this.state.trackers.findIndex(candidate => candidate.id === tracker.id);
      if (index === -1) this.state.trackers.push(structuredClone(tracker));
      else this.state.trackers[index] = structuredClone(tracker);
    }),
    delete: id => this.mutate(() => {
      this.state.trackers = this.state.trackers.filter(tracker => tracker.id !== id);
      this.state.logs = this.state.logs.filter(log => log.trackerId !== id);
    }),
    deleteAll: () => this.mutate(() => {
      this.state.trackers = [];
      this.state.logs = [];
    }),
    insertMany: trackers => this.mutate(() => {
      this.state.trackers.push(...structuredClone(trackers));
    })
  };

  readonly logs: RuntimeRepositories['logs'] = {
    listAll: () => this.resolve(this.state.logs),
    upsert: log => this.mutate(() => {
      const index = this.state.logs.findIndex(candidate => candidate.id === log.id);
      if (index === -1) this.state.logs.push(structuredClone(log));
      else this.state.logs[index] = structuredClone(log);
    }),
    delete: id => this.mutate(() => {
      this.state.logs = this.state.logs.filter(log => log.id !== id);
    }),
    deleteAll: () => this.mutate(() => {
      this.state.logs = [];
    }),
    insertMany: logs => this.mutate(() => {
      this.state.logs.push(...structuredClone(logs));
    })
  };

  readonly settings: RuntimeRepositories['settings'] = {
    get: () => this.resolve(this.settingsState),
    save: settings => this.mutate(() => {
      this.state.settings = structuredClone(settings);
      this.settingsState = structuredClone(settings);
    })
  };

  readonly backup: RuntimeRepositories['backup'] = {
    restoreState: state => this.mutate(() => {
      this.state = cloneState(state);
      this.settingsState = structuredClone(state.settings);
    })
  };

  private resolve<T>(value: T): Promise<T> {
    if (this.shouldFail) return Promise.reject(repositoryFailure());
    return Promise.resolve(structuredClone(value));
  }

  private mutate(operation: () => void): Promise<void> {
    if (this.shouldFail) return Promise.reject(repositoryFailure());
    operation();
    return Promise.resolve();
  }
}

export function isBrowserFixtureScenario(value: string | null): value is BrowserFixtureScenario {
  return value === 'signed-out'
    || value === 'signed-in-empty'
    || value === 'populated'
    || value === 'offline-pending'
    || value === 'repository-error';
}

export function createBrowserFixture(
  scenario: BrowserFixtureScenario,
  storage: Storage
): ApplicationRuntime {
  const initialState = scenario === 'signed-in-empty'
    ? { version: 3 as const, trackers: [], logs: [], settings: { theme: 'system' as const, confirmDelete: true } }
    : populatedState();
  const repositories = new FixtureRepositories(
    initialState,
    scenario !== 'signed-in-empty',
    scenario === 'repository-error'
  );

  if (scenario === 'offline-pending') {
    const pendingLog: TrackingLog = {
      id: 'pending-log',
      trackerId: 'tracker-water',
      value: 2,
      occurredAt: todayAt(12),
      note: 'Queued while offline',
      source: 'website'
    };
    const cached = cloneState(initialState);
    cached.logs.push(pendingLog);
    new UserCache(storage).save(FIXTURE_USER.id, cached);
    new OfflineQueue(storage).enqueue(FIXTURE_USER.id, {
      id: 'pending-log-operation',
      type: 'upsertLog',
      payload: pendingLog,
      createdAt: todayAt(12),
      retryCount: 0
    });
  }

  let nextId = 0;
  return {
    authService: new FixtureAuthService(scenario !== 'signed-out'),
    createRepositories: () => repositories,
    createId: () => `fixture-generated-${++nextId}`,
    now: () => new Date().toISOString()
  };
}
