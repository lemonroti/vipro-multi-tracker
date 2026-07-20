# Foundation Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current global, order-dependent JavaScript runtime with a tested Vite and vanilla TypeScript architecture while preserving the UI, Supabase data, offline behavior, and GitHub Pages production experience.

**Architecture:** Keep the existing HTML/CSS presentation and migrate behavior in vertical slices. Pure domain modules and a typed store sit beneath repository-backed services; feature controllers own DOM rendering and events; `main.ts` is the composition root. The legacy runtime remains deployable until the replacement passes parity checks.

**Tech Stack:** HTML, CSS, vanilla TypeScript, Vite, Supabase JavaScript client, Zod, Vitest, ESLint, Playwright, GitHub Actions, GitHub Pages

## Global Constraints

- Work only on `dev`; do not deploy `dev` to the production Pages site.
- Preserve the current UI, user flows, Supabase project, and existing user data.
- Do not add React, Vue, Svelte, Capacitor, browser-extension tooling, PHP, PSR-4, Redux, or Zustand.
- Do not add product features or make unapproved copy/visual changes.
- Use two-space indentation, single-quoted TypeScript strings, semicolons, camelCase identifiers, `UPPER_SNAKE_CASE` constants, and kebab-case CSS classes.
- Escape user-controlled text before inserting HTML.
- Only the Supabase project URL and publishable key may enter frontend output; never commit `.env`, service-role credentials, passwords, or access tokens.
- Keep the runtime bundle order intact until the legacy entry point is deliberately removed in Task 11.
- Existing cloud data must remain readable throughout the migration.
- Each task ends with its specified tests and a focused Conventional Commit.

---

## Locked file map

The implementation should converge on these responsibilities. Do not create empty files merely to match the map.

```text
index.html                                  Existing application shell
public/legacy/app.js                        Temporary legacy loader
public/legacy/app-*.js                      Temporary legacy runtime
src/main.ts                                 Composition root and startup
src/config/environment.ts                   Validated public configuration
src/domain/models.ts                        Domain data types
src/domain/defaults.ts                      First-account/reset defaults
src/domain/schemas.ts                       Runtime Zod schemas/normalization
src/domain/operations.ts                    Typed persisted operations
src/state/app-store.ts                      Only owner of in-memory state
src/services/cache.ts                       User-scoped local cache
src/services/supabase-client.ts             Supabase client construction
src/services/repository-types.ts            Repository contracts/results
src/services/row-mappers.ts                 Database/domain mapping
src/services/supabase-repositories.ts       Concrete table persistence
src/services/offline-queue.ts               Queue storage/coalescing
src/services/sync-service.ts                Optimistic persistence/retry
src/services/cloud-state-service.ts         Cloud loading/seeding/reconciliation
src/services/auth-service.ts                Supabase session operations
src/services/tracker-service.ts             Tracker use cases
src/services/log-service.ts                 Log use cases
src/services/settings-service.ts            Settings use cases
src/services/backup-service.ts              Import/export/reset orchestration
src/features/auth/index.ts                  Auth screen controller
src/features/dashboard/index.ts             Dashboard renderer/controller
src/features/history/index.ts               History renderer/controller
src/features/trackers/index.ts              Tracker management/controller
src/features/logs/index.ts                  Log modal/controller
src/features/settings/index.ts              Settings/controller
src/features/shell/index.ts                 Navigation, modal and toast shell
src/shared/dom.ts                           DOM lookup and escaping
src/shared/dates.ts                         Local date/time utilities
src/shared/formatting.ts                    Display/CSV formatting
src/shared/ids.ts                           UUID generation
src/styles/app.css                          Existing stylesheet entry
supabase/migrations/*_remote_schema.sql      Pulled baseline schema
supabase/migrations/*_atomic_restore.sql     Transactional restore RPC
tests/e2e/*.spec.ts                         Browser flows
.github/workflows/ci.yml                    Non-deployment checks
.github/workflows/pages.yml                 Main-only Pages deployment
```

Co-locate unit tests with source as `*.test.ts`. Feature modules may be split further only when a file would otherwise own unrelated rendering, event, and form responsibilities.

### Task 1: Add Vite/TypeScript tooling without removing the legacy app

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `.env.example`
- Create: `src/vite-env.d.ts`
- Move: `app.js` to `public/legacy/app.js`
- Move: `app-1.js` through `app-4b.js` to `public/legacy/`

**Interfaces:**
- Consumes: existing static application and release scripts.
- Produces: `npm run dev`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:e2e`, and `npm run build`; the Vite build still runs the unchanged legacy product.

- [ ] **Step 1: Install pinned runtime and development dependencies**

Run:

```powershell
npm install @supabase/supabase-js zod
npm install --save-dev vite typescript vitest jsdom eslint @eslint/js typescript-eslint @playwright/test
```

Expected: `package.json` and `package-lock.json` record exact resolved versions; installation exits `0`.

- [ ] **Step 2: Add the development and verification scripts**

Merge these keys into `package.json` without removing the existing release and commitlint scripts:

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 3: Create deterministic TypeScript, Vite, and ESLint configuration**

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  test: {
    environment: 'node'
  }
});
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src", "tests", "vite.config.ts", "playwright.config.ts"]
}
```

Create `eslint.config.js`:

```js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'public/legacy/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error'
    }
  }
);
```

Create `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

Create `.env.example`:

```dotenv
VITE_SUPABASE_URL=https://example.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example
```

- [ ] **Step 4: Preserve the legacy runtime under Vite's public directory**

Run:

```powershell
New-Item -ItemType Directory -Force public\legacy
git mv app.js public/legacy/app.js
git mv app-1.js app-2.js app-3a.js app-3b.js app-4a.js app-4b.js public/legacy/
```

In `public/legacy/app.js`, replace the local entries with URLs relative to the loader:

```js
const scripts = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  ...['app-1.js', 'app-2.js', 'app-3a.js', 'app-3b.js', 'app-4a.js', 'app-4b.js']
    .map(file => new URL(file, import.meta.url).href)
];
```

Replace the final script in `index.html` with:

```html
<script type="module" src="./legacy/app.js"></script>
```

- [ ] **Step 5: Verify the temporary Vite build**

Run:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

Expected: all commands exit `0`; `dist/index.html` exists and `dist/legacy/app.js` plus all six legacy bundles exist.

- [ ] **Step 6: Manually smoke-test the unchanged legacy application**

Run `npm run dev`, open the printed local URL, and verify the auth screen loads. Sign in with the beta account and verify Dashboard, History, Trackers, Settings, light/dark theme, and one non-destructive quick log. Expected: behavior and visuals match the pre-Vite baseline.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json index.html vite.config.ts tsconfig.json eslint.config.js .env.example src/vite-env.d.ts public/legacy
git commit -m "build: add Vite and TypeScript foundation"
```

### Task 2: Define and validate the domain model

**Files:**
- Create: `src/domain/models.ts`
- Create: `src/domain/defaults.ts`
- Create: `src/domain/schemas.ts`
- Create: `src/domain/operations.ts`
- Create: `src/domain/schemas.test.ts`

**Interfaces:**
- Consumes: Zod.
- Produces: `Tracker`, `TrackingLog`, `UserSettings`, `AppState`, `OfflineOperation`, `makeDefaultTrackers()`, `blankState()`, and `normalizeState(input)`.

- [ ] **Step 1: Write failing normalization tests**

Create `src/domain/schemas.test.ts` with tests that prove defaults, filtering, and rejection behavior:

```ts
import { describe, expect, it } from 'vitest';
import { blankState, normalizeState } from './schemas';

describe('normalizeState', () => {
  it('returns the version 3 blank state for an empty object', () => {
    expect(normalizeState({})).toEqual(blankState());
  });

  it('normalizes a valid tracker and removes non-positive logs', () => {
    const state = normalizeState({
      trackers: [{ id: 'tracker-1', name: 'Water', unit: 'ml', presets: [250] }],
      logs: [
        { id: 'log-1', trackerId: 'tracker-1', value: 250 },
        { id: 'log-2', trackerId: 'tracker-1', value: 0 }
      ]
    });

    expect(state.trackers[0]).toMatchObject({ name: 'Water', active: true, presets: [250] });
    expect(state.logs).toHaveLength(1);
    expect(state.settings).toEqual({ theme: 'system', confirmDelete: true });
  });

  it('rejects data that is not an object', () => {
    expect(() => normalizeState('invalid')).toThrow('Invalid tracker state');
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run `npm run test -- src/domain/schemas.test.ts`.

Expected: FAIL because `./schemas` does not exist.

- [ ] **Step 3: Add the domain types**

Create `src/domain/models.ts`:

```ts
export type ThemePreference = 'system' | 'light' | 'dark';

export interface Tracker {
  id: string;
  name: string;
  unit: string;
  icon: string;
  color: string;
  goal: number | null;
  presets: number[];
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface TrackingLog {
  id: string;
  trackerId: string;
  value: number;
  occurredAt: string;
  note: string;
  source: string;
}

export interface UserSettings {
  theme: ThemePreference;
  confirmDelete: boolean;
}

export interface AppState {
  version: 3;
  trackers: Tracker[];
  logs: TrackingLog[];
  settings: UserSettings;
}
```

Create `src/domain/operations.ts`:

```ts
import type { Tracker, TrackingLog, UserSettings } from './models';

export type OfflineOperation =
  | { id: string; type: 'upsertTracker'; payload: Tracker; createdAt: string; retryCount: number }
  | { id: string; type: 'deleteTracker'; payload: { id: string }; createdAt: string; retryCount: number }
  | { id: string; type: 'upsertLog'; payload: TrackingLog; createdAt: string; retryCount: number }
  | { id: string; type: 'deleteLog'; payload: { id: string }; createdAt: string; retryCount: number }
  | { id: string; type: 'saveSettings'; payload: UserSettings; createdAt: string; retryCount: number };
```

Create `src/domain/defaults.ts` with a supplied clock and ID factory so tests can reproduce the existing defaults:

```ts
import type { Tracker } from './models';

export function makeDefaultTrackers(
  createId: () => string,
  now: () => string
): Tracker[] {
  const createdAt = now();
  return [
    {
      id: createId(), name: 'Smoking', unit: 'cigarette', icon: '🚬',
      color: '#334155', goal: 8, presets: [1], active: true,
      sortOrder: 0, createdAt
    },
    {
      id: createId(), name: '觀世音菩薩聖號', unit: 'minute', icon: '🙏',
      color: '#6d4aff', goal: 30, presets: [5, 10, 15], active: true,
      sortOrder: 1, createdAt
    }
  ];
}
```

Add a test that supplies `id-1`, `id-2`, and `2026-07-21T00:00:00.000Z` and asserts the complete two-tracker result.

- [ ] **Step 4: Implement runtime schemas and normalization**

Create `src/domain/schemas.ts` using explicit Zod schemas. Preserve the current version, defaults, color validation, maximum eight positive presets, and positive-log filtering. Export these exact names:

```ts
export const trackerSchema: z.ZodType<Tracker>;
export const trackingLogSchema: z.ZodType<TrackingLog>;
export const userSettingsSchema: z.ZodType<UserSettings>;
export const offlineOperationSchema: z.ZodType<OfflineOperation>;
export function blankState(): AppState;
export function normalizeState(input: unknown): AppState;
```

`normalizeState` must throw `new Error('Invalid tracker state')` when the root is not an object, apply defaults to omitted collections/settings, normalize tracker positions using their array index, and filter invalid/non-positive log values instead of rejecting the entire state.

- [ ] **Step 5: Run domain tests**

Run `npm run test -- src/domain/schemas.test.ts`.

Expected: PASS with three tests.

- [ ] **Step 6: Commit**

```powershell
git add src/domain
git commit -m "feat: add validated tracker domain model"
```

### Task 3: Extract pure date and formatting behavior

**Files:**
- Create: `src/shared/dates.ts`
- Create: `src/shared/dates.test.ts`
- Create: `src/shared/formatting.ts`
- Create: `src/shared/formatting.test.ts`
- Create: `src/shared/ids.ts`
- Create: `src/shared/dom.ts`

**Interfaces:**
- Consumes: browser `crypto`, DOM APIs, domain models.
- Produces: pure formatting/date helpers and safe DOM lookup/escaping.

- [ ] **Step 1: Write failing tests for preserved utility behavior**

Test these exact cases:

```ts
expect(formatValue(2)).toBe('2');
expect(formatValue(2.5)).toBe('2.50');
expect(pluralUnit('minute', 1)).toBe('minute');
expect(pluralUnit('minute', 2)).toBe('minutes');
expect(csvEscape('a,b')).toBe('"a,b"');
expect(escapeHtml('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
expect(localDateKey(new Date(2026, 6, 21, 23, 30))).toBe('2026-07-21');
```

- [ ] **Step 2: Verify failure**

Run `npm run test -- src/shared`.

Expected: FAIL because the shared modules do not exist.

- [ ] **Step 3: Implement the pure helpers**

Move the behavior of `localDateKey`, `toLocalInputValue`, `formatDateTime`, `formatDateHeading`, `timeAgo`, `pluralUnit`, `formatValue`, `csvEscape`, and `escapeHtml` into focused modules. Export `uid` from `ids.ts` as:

```ts
export function uid(): string {
  return crypto.randomUUID();
}
```

Export strict DOM helpers from `dom.ts`:

```ts
export function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

export function getElements<T extends Element>(selector: string): T[] {
  return [...document.querySelectorAll<T>(selector)];
}
```

- [ ] **Step 4: Run tests and type checking**

Run:

```powershell
npm run test -- src/shared
npm run typecheck
```

Expected: PASS and exit `0`.

- [ ] **Step 5: Commit**

```powershell
git add src/shared
git commit -m "refactor: extract typed shared utilities"
```

### Task 4: Add the typed store and user-scoped cache

**Files:**
- Create: `src/state/app-store.ts`
- Create: `src/state/app-store.test.ts`
- Create: `src/services/cache.ts`
- Create: `src/services/cache.test.ts`

**Interfaces:**
- Consumes: `AppState`, `blankState()`, `normalizeState()`.
- Produces: `AppStore`, `createAppStore()`, and `UserCache`.

- [ ] **Step 1: Write failing store/cache tests**

Cover replacement, immutable updates, subscription cleanup, invalid-cache fallback, and account isolation. Use an in-memory `Storage` fake and assert that user A cannot read user B's key.

Required store usage:

```ts
const store = createAppStore();
const unsubscribe = store.subscribe(next => snapshots.push(next));
store.update(current => ({ ...current, trackers: [tracker] }));
expect(store.getState().trackers).toEqual([tracker]);
unsubscribe();
```

- [ ] **Step 2: Verify failure**

Run `npm run test -- src/state src/services/cache.test.ts`.

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement `AppStore`**

Export this contract:

```ts
export interface AppStore {
  getState(): Readonly<AppState>;
  replace(next: AppState): void;
  update(updater: (current: AppState) => AppState): void;
  subscribe(listener: (state: Readonly<AppState>) => void): () => void;
  reset(): void;
}

export function createAppStore(initial?: AppState): AppStore;
```

Clone values at the store boundary with `structuredClone`, notify subscribers after successful changes, and prevent subscribers from mutating internal state by returning cloned snapshots.

- [ ] **Step 4: Implement `UserCache`**

Use versioned keys `vipro-multi-tracker-cache-v3-${userId}` and this contract:

```ts
export class UserCache {
  constructor(private readonly storage: Storage) {}
  load(userId: string): AppState;
  save(userId: string, state: AppState): void;
  remove(userId: string): void;
}
```

`load` returns `blankState()` for missing, malformed, or invalid data. It must never read a key not derived from the supplied user ID.

- [ ] **Step 5: Run tests**

Run `npm run test -- src/state src/services/cache.test.ts`.

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/state src/services/cache.ts src/services/cache.test.ts
git commit -m "feat: add typed state and user cache"
```

### Task 5: Add typed Supabase boundaries and row mappers

**Files:**
- Create: `src/config/environment.ts`
- Create: `src/config/environment.test.ts`
- Create: `src/services/supabase-client.ts`
- Create: `src/services/repository-types.ts`
- Create: `src/services/row-mappers.ts`
- Create: `src/services/row-mappers.test.ts`
- Create: `src/services/supabase-repositories.ts`

**Interfaces:**
- Consumes: public Vite environment values and domain models.
- Produces: validated `Environment`, row mappers, repository interfaces, and concrete Supabase repositories.

- [ ] **Step 1: Write failing environment and mapper tests**

Assert that invalid/missing URLs and keys throw `ConfigurationError`, nullable database fields map to domain defaults, and domain values map back to snake-case rows with the authenticated `user_id`.

- [ ] **Step 2: Verify failure**

Run `npm run test -- src/config src/services/row-mappers.test.ts`.

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement validated public configuration**

Export:

```ts
export interface Environment {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export function readEnvironment(source: Record<string, unknown>): Environment;
```

Validate the URL with `z.string().url()` and the key with `z.string().min(1)`. `supabase-client.ts` calls `createClient` from `@supabase/supabase-js` with persisted sessions, refresh tokens, and URL session detection enabled.

- [ ] **Step 4: Define repository contracts**

Create contracts with these method names:

```ts
export interface TrackerRepository {
  list(): Promise<Tracker[]>;
  upsert(tracker: Tracker): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface LogRepository {
  listAll(pageSize?: number): Promise<TrackingLog[]>;
  upsert(log: TrackingLog): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<UserSettings | null>;
  save(settings: UserSettings): Promise<void>;
}
```

Add a `RepositoryError` that carries a `kind` of `'network' | 'permission' | 'validation' | 'persistence'` and a safe message.

- [ ] **Step 5: Implement row mappers and concrete repositories**

Move the exact current column mapping for `trackers`, `tracking_logs`, and `user_settings` into pure mapper functions. Concrete repositories receive the authenticated user ID in their constructor, retain log pagination in batches of 1,000, scope destructive queries to `user_id`, and translate Supabase errors into `RepositoryError`.

- [ ] **Step 6: Run tests and type checking**

Run:

```powershell
npm run test -- src/config src/services/row-mappers.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/config src/services/supabase-client.ts src/services/repository-types.ts src/services/row-mappers.ts src/services/row-mappers.test.ts src/services/supabase-repositories.ts
git commit -m "feat: add typed Supabase repositories"
```

### Task 6: Implement and test the offline queue

**Files:**
- Create: `src/services/offline-queue.ts`
- Create: `src/services/offline-queue.test.ts`

**Interfaces:**
- Consumes: `OfflineOperation`, `offlineOperationSchema`, browser `Storage`.
- Produces: `OfflineQueue` with ordered, validated, user-scoped operations.

- [ ] **Step 1: Write failing queue tests**

Cover these exact behaviors:

- Keys are `vipro-multi-tracker-queue-v3-${userId}`.
- Invalid stored operations are discarded.
- Operations retain creation order.
- A second upsert for the same entity replaces the earlier pending upsert.
- A delete removes earlier upserts for the same entity.
- `remove(id)` deletes only the confirmed operation.
- `incrementRetry(id)` increases only that operation's count.

- [ ] **Step 2: Verify failure**

Run `npm run test -- src/services/offline-queue.test.ts`.

Expected: FAIL because `OfflineQueue` does not exist.

- [ ] **Step 3: Implement the queue contract**

```ts
export class OfflineQueue {
  constructor(private readonly storage: Storage) {}
  load(userId: string): OfflineOperation[];
  enqueue(userId: string, operation: OfflineOperation): OfflineOperation[];
  remove(userId: string, operationId: string): OfflineOperation[];
  incrementRetry(userId: string, operationId: string): OfflineOperation[];
  clear(userId: string): void;
}
```

Use operation type plus payload entity ID as the coalescing identity. Never coalesce settings with entity operations. Return cloned arrays so callers cannot mutate queue storage accidentally.

- [ ] **Step 4: Run queue tests**

Run `npm run test -- src/services/offline-queue.test.ts`.

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/offline-queue.ts src/services/offline-queue.test.ts
git commit -m "feat: add resilient offline operation queue"
```

### Task 7: Implement synchronization and application services

**Files:**
- Create: `src/services/sync-service.ts`
- Create: `src/services/sync-service.test.ts`
- Create: `src/services/tracker-service.ts`
- Create: `src/services/tracker-service.test.ts`
- Create: `src/services/log-service.ts`
- Create: `src/services/log-service.test.ts`
- Create: `src/services/settings-service.ts`
- Create: `src/services/settings-service.test.ts`
- Create: `src/services/cloud-state-service.ts`
- Create: `src/services/cloud-state-service.test.ts`

**Interfaces:**
- Consumes: `AppStore`, `UserCache`, `OfflineQueue`, repository contracts, domain operations.
- Produces: tested optimistic CRUD services, single-flight queue synchronization, and deterministic cloud loading/seeding.

- [ ] **Step 1: Write failing sync tests**

Use fake repositories to prove:

- Offline persistence applies the optimistic state, saves cache, and queues once.
- A network repository error behaves like offline.
- Permission/validation errors restore the pre-operation snapshot.
- Successful persistence does not queue.
- Queue sync executes in order and removes only successful operations.
- Two concurrent `sync()` calls share one execution.

- [ ] **Step 2: Define service results and implement minimal sync behavior**

Export:

```ts
export type OperationResult =
  | { ok: true; queued: boolean }
  | { ok: false; error: ApplicationError };

export interface ApplicationError {
  kind: 'network' | 'validation' | 'authentication' | 'permission' | 'persistence';
  message: string;
}

export interface TrackerInput {
  id?: string;
  name: string;
  unit: string;
  icon: string;
  color: string;
  goal: number | null;
  presets: number[];
}

export interface LogInput {
  trackerId: string;
  value: number;
  occurredAt: string;
  note: string;
}
```

`SyncService` receives repositories through an executor function:

```ts
export type OperationExecutor = (operation: OfflineOperation) => Promise<void>;

export class SyncService {
  constructor(
    private readonly store: AppStore,
    private readonly cache: UserCache,
    private readonly queue: OfflineQueue,
    private readonly execute: OperationExecutor,
    private readonly isOnline: () => boolean
  ) {}

  persist(userId: string, operation: OfflineOperation, apply: () => void, rollback: () => void): Promise<OperationResult>;
  sync(userId: string): Promise<void>;
}
```

Store a private in-flight promise and return it from concurrent `sync()` calls.

- [ ] **Step 3: Run sync tests**

Run `npm run test -- src/services/sync-service.test.ts`.

Expected: PASS.

- [ ] **Step 4: Write failing tracker, log, and settings service tests**

Test create/update/toggle/delete tracker, add/update/delete log, and save settings. Assert operation payloads, optimistic state, related-log removal on tracker deletion, input validation, and rollback results.

- [ ] **Step 5: Implement application services**

Export these public methods:

```ts
export interface TrackerService {
  save(input: TrackerInput): Promise<OperationResult>;
  toggle(id: string): Promise<OperationResult>;
  delete(id: string): Promise<OperationResult>;
}

export interface LogService {
  add(input: LogInput): Promise<OperationResult>;
  update(id: string, input: LogInput): Promise<OperationResult>;
  delete(id: string): Promise<OperationResult>;
  undoLast(): Promise<OperationResult | null>;
}

export interface SettingsService {
  save(input: UserSettings): Promise<OperationResult>;
}
```

Service constructors receive `userId`, the store, cache, sync service, and ID/time factories. This makes tests deterministic and prevents UI code from generating persistence operations.

- [ ] **Step 6: Run all service tests**

Run `npm run test -- src/services`.

Expected: PASS.

- [ ] **Step 7: Write failing cloud-loading tests**

Test cloud errors, first-account seeding, no-seed-with-queue, no-seed-with-settings, successful normalization, and reapplication of operations that remain pending after synchronization.

- [ ] **Step 8: Implement `CloudStateService`**

```ts
export interface CloudStateService {
  load(options: { hasPendingOperations: boolean }): Promise<AppState>;
}
```

It fetches trackers, all paginated logs, and settings in parallel; validates the combined state; seeds `makeDefaultTrackers()` plus default settings only when trackers, settings, and pending operations are all absent; and never seeds after a user deliberately deletes all trackers while settings still exist. Startup must call queue sync before cloud load, then reapply any still-pending operations to the loaded state before replacing the store.

- [ ] **Step 9: Run all service tests and commit**

Run `npm run test -- src/services` and expect PASS, then commit:

```powershell
git add src/services
git commit -m "feat: add optimistic tracker synchronization"
```

### Task 8: Build the typed shell and authenticated startup

**Files:**
- Create: `src/features/shell/index.ts`
- Create: `src/features/auth/index.ts`
- Create: `src/features/auth/index.test.ts`
- Create: `src/services/auth-service.ts`
- Create: `src/services/auth-service.test.ts`
- Create: `src/main.ts`
- Move: `styles.css` to `src/styles/app.css`
- Modify: `index.html`

**Interfaces:**
- Consumes: configuration, Supabase client, store/cache/queue/services, existing DOM IDs and CSS.
- Produces: typed shell controllers and a new application entry point behind a temporary opt-in query flag.

- [ ] **Step 1: Write failing auth-controller tests**

Start DOM-facing test files with `// @vitest-environment jsdom`. Verify signed-out visibility, signed-in visibility/email, busy button state, safe error messages, and sign-out reset behavior.

- [ ] **Step 2: Implement shell and auth controllers**

Export factories rather than globals:

```ts
export type ViewName = 'dashboard' | 'history' | 'trackers' | 'settings';

export interface ConnectionStatus {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
}

export interface ShellController {
  switchView(view: ViewName): void;
  openModal(id: string): void;
  closeModal(id: string): void;
  showToast(message: string, canUndo?: boolean): void;
  updateConnection(status: ConnectionStatus): void;
}

export interface AuthDependencies {
  getSession(): Promise<{ user: { id: string; email?: string } } | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  onSessionChange(listener: (session: { user: { id: string; email?: string } } | null) => void): () => void;
  resetApplication(): void;
}

export interface AuthController {
  initialize(): Promise<void>;
  destroy(): void;
}

export function createShellController(): ShellController;
export function createAuthController(dependencies: AuthDependencies): AuthController;
```

Implement `AuthService` as the only wrapper around `supabase.auth`:

```ts
export interface SessionUser {
  id: string;
  email?: string;
}

export interface AuthService {
  getSession(): Promise<SessionUser | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ signedIn: boolean }>;
  signOut(): Promise<void>;
  onSessionChange(listener: (user: SessionUser | null) => void): () => void;
}
```

Map raw Supabase auth errors to safe application errors and test sign-in, sign-up with and without an immediate session, sign-out, listener cleanup, and missing-email display fallback.

Move navigation, modal, toast, theme, greeting, sync-badge, and auth-screen behavior without changing IDs or copy.

- [ ] **Step 3: Create the composition root in shadow mode**

`src/main.ts` must initialize only when the URL contains `?runtime=typed`; otherwise it returns without changing the legacy page. It constructs one store, cache, queue, Supabase client, repositories, services, and feature controllers. This permits side-by-side manual verification before the legacy switch. Register online/offline and system-theme listeners with matching teardown callbacks. Wrap startup in `void startApplication().catch(handleFatalStartupError)`; the handler logs diagnostics for development and places the safe message `The app could not finish loading. Refresh the page and check your internet connection.` in `#authMessage` without exposing credentials or raw database details.

Move the existing stylesheet without changing its rules:

```powershell
git mv styles.css src/styles/app.css
```

Replace the stylesheet link in `index.html` with `<link rel="stylesheet" href="/src/styles/app.css" />`.

Add the typed entry before the legacy entry in `index.html`:

```html
<script type="module" src="/src/main.ts"></script>
<script type="module" src="./legacy/app.js"></script>
```

Modify the legacy loader so it does not initialize when `runtime=typed` is present.

- [ ] **Step 4: Run tests and manual auth checks**

Run `npm run test -- src/features/auth`, `npm run typecheck`, and `npm run build`. Then compare normal URL legacy behavior with `?runtime=typed` auth behavior.

Expected: automated checks pass; normal URL remains legacy; typed URL supports sign-in/sign-out without duplicate initialization.

- [ ] **Step 5: Commit**

```powershell
git add src/features/shell src/features/auth src/main.ts src/styles/app.css index.html public/legacy/app.js
git commit -m "feat: add typed application shell"
```

### Task 9: Migrate dashboard and history rendering

**Files:**
- Create: `src/features/dashboard/index.ts`
- Create: `src/features/dashboard/index.test.ts`
- Create: `src/features/history/index.ts`
- Create: `src/features/history/index.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: store snapshots, shared date/format/escape helpers, shell controller.
- Produces: `DashboardController` and `HistoryController` that preserve all current cards, chart, filters, and delegated events.

- [ ] **Step 1: Write failing renderer tests**

Use representative state fixtures to assert:

- Dashboard statistics and recent activity.
- Tracker card goal progress and quick values.
- Seven local calendar days in the chart.
- History tracker/date/search filtering.
- Date grouping and escaped tracker/note text.
- Empty states when no tracker or log exists.

- [ ] **Step 2: Implement dashboard controller**

Export:

```ts
export interface DashboardDependencies {
  addQuickLog(trackerId: string, value: number): Promise<void>;
  openCustomLog(trackerId: string): void;
  openTrackerEditor(trackerId: string): void;
}

export interface DashboardController {
  render(state: Readonly<AppState>): void;
  destroy(): void;
}

export function createDashboardController(dependencies: DashboardDependencies): DashboardController;
```

Use one delegated click listener on `#dashboardTrackerGrid` instead of rebinding listeners after every render. Delegate quick log, custom log, and edit actions through callbacks supplied in `DashboardDependencies`.

- [ ] **Step 3: Implement history controller**

Export the same `render/destroy` lifecycle. Use delegated events on `#historyGroups`, preserve all three filters, and keep filtering as a pure exported function for unit testing.

- [ ] **Step 4: Wire store subscriptions and run tests**

`main.ts` subscribes both controllers to the store and calls `destroy()` during auth/session teardown. Run feature tests, full type checking, and a typed-runtime manual comparison in light/dark desktop/mobile layouts.

- [ ] **Step 5: Commit**

```powershell
git add src/features/dashboard src/features/history src/main.ts
git commit -m "refactor: migrate dashboard and history modules"
```

### Task 10: Migrate tracker/log management and settings

**Files:**
- Create: `src/features/trackers/index.ts`
- Create: `src/features/trackers/index.test.ts`
- Create: `src/features/logs/index.ts`
- Create: `src/features/logs/index.test.ts`
- Create: `src/features/settings/index.ts`
- Create: `src/features/settings/index.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: tracker/log/settings services, store, shell controller.
- Produces: controllers for tracker cards/forms, log forms/undo, and settings actions.

- [ ] **Step 1: Write failing controller tests**

Cover form parsing, eight-value preset limit, positive numeric validation, edit preservation, delete confirmation, datetime conversion, undo visibility, theme selection, confirm-delete toggle, and sync-now behavior.

- [ ] **Step 2: Implement tracker management**

Export `createTrackerController()` with `render`, `openModal`, and `destroy`. Preserve the seven allowed colors and all current input limits. The controller calls `TrackerService` and never updates the store directly.

- [ ] **Step 3: Implement log management**

Export `createLogController()` with `populateTrackerOptions`, `openModal`, `renderUndo`, and `destroy`. Preserve quick/manual log behavior, notes, local datetime conversion, edit/delete confirmation, and undo. Call `LogService` only.

- [ ] **Step 4: Implement settings**

Export `createSettingsController()` with `render` and `destroy`. Preserve theme behavior, deletion confirmation, sync status, storage information, and sign-out. Backup/destructive buttons remain disabled with the message `Migration in progress` until Task 11 wires the typed backup service; they are enabled only in the legacy runtime meanwhile.

- [ ] **Step 5: Wire controllers and run verification**

Run all unit tests, type checking, linting, and build. Manually compare typed runtime CRUD, modals, theme, and responsive layouts against legacy.

- [ ] **Step 6: Commit**

```powershell
git add src/features/trackers src/features/logs src/features/settings src/main.ts
git commit -m "refactor: migrate tracker interaction modules"
```

### Task 11: Migrate backup/destructive operations and switch the runtime

**Files:**
- Create: `src/services/backup-service.ts`
- Create: `src/services/backup-service.test.ts`
- Modify: `src/features/settings/index.ts`
- Modify: `src/features/settings/index.test.ts`
- Modify: `src/main.ts`
- Modify: `index.html`
- Delete: `public/legacy/app.js`
- Delete: `public/legacy/app-1.js` through `public/legacy/app-4b.js`

**Interfaces:**
- Consumes: store, repositories, runtime schemas, queue, download helper.
- Produces: typed JSON/CSV export, validated import, sample data, clear logs, reset, and typed runtime as the only entry point.

- [ ] **Step 1: Write failing backup-service tests**

Test JSON snapshot shape, deterministic CSV headers/escaping, complete import validation before repository calls, ID remapping, orphan-log rejection, 500-row insert batches, queue clearing only after success, sample values, clear-logs behavior, and reset defaults.

- [ ] **Step 2: Implement backup service**

Export:

```ts
export interface BackupService {
  exportJson(): string;
  exportCsv(): string;
  importJson(text: string): Promise<OperationResult>;
  loadSampleData(): Promise<OperationResult>;
  clearLogs(): Promise<OperationResult>;
  resetEverything(): Promise<OperationResult>;
}
```

Validate and remap the full import before performing the first destructive call. Preserve source values `import` and `sample`. On failure, reload cloud state and return a safe `PersistenceError`. `resetEverything()` must restore the exact two trackers from `makeDefaultTrackers()` and settings `{ theme: 'system', confirmDelete: true }`.

- [ ] **Step 3: Wire settings actions and remove shadow mode**

Enable import/export/sample/clear/reset through `BackupService`. Remove the `runtime=typed` guard from `main.ts`, remove the legacy script tag from `index.html`, and delete `public/legacy/` only after typed-runtime parity checks pass.

The final entry is:

```html
<script type="module" src="/src/main.ts"></script>
```

- [ ] **Step 4: Run the complete automated suite**

Run:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
git diff --check
```

Expected: all pass; `dist/` contains no Supabase CDN reference and no numbered legacy scripts.

- [ ] **Step 5: Run the complete manual parity checklist**

Verify authentication, tracker/log CRUD, persistence after refresh, offline recovery, reconnect sync, history filters, chart, undo, JSON/CSV export, validated JSON import, sample data, clear logs, full reset, light/dark themes, and mobile/desktop layouts. Confirm existing Supabase records are unchanged before destructive tests; use a backup/test account for destructive cases.

- [ ] **Step 6: Commit**

```powershell
git add src index.html public/legacy
git commit -m "refactor: replace legacy tracker runtime"
```

### Task 12: Capture the Supabase schema and make restore atomic

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/<timestamp>_remote_schema.sql`
- Create: `supabase/migrations/<timestamp>_atomic_restore.sql`
- Modify: `src/services/repository-types.ts`
- Modify: `src/services/supabase-repositories.ts`
- Modify: `src/services/backup-service.ts`
- Modify: `src/services/backup-service.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: linked Supabase project `hqdjbdkxvexuduvqccpc` and validated import payload.
- Produces: a reviewed baseline migration and one authenticated transactional restore RPC.

- [ ] **Step 1: Read the live schema without changing it**

Use the Supabase workflow required by the repository environment. Confirm exact columns, types, defaults, foreign keys, indexes, and RLS policies for `trackers`, `tracking_logs`, and `user_settings`. Compare them to the row mappers. Stop this task if the live contract contradicts the mapper assumptions; update the plan and tests before continuing.

- [ ] **Step 2: Pull and lint the remote schema**

Run authenticated Supabase CLI commands without committing credentials:

```powershell
npx supabase link --project-ref hqdjbdkxvexuduvqccpc
npx supabase db pull
npx supabase db lint --linked
```

Expected: a migration representing the existing remote schema is generated; lint reports no security-definer or RLS regressions introduced by this task.

- [ ] **Step 3: Write failing repository/backup tests for atomic restore**

Replace the multi-request import expectation with one repository method on a `BackupRepository`:

```ts
export interface BackupRepository {
  restoreState(state: AppState): Promise<void>;
}
```

Assert that `BackupService.importJson()` calls it once after complete validation and does not delete data directly.

- [ ] **Step 4: Add a transactional RPC migration**

Create an authenticated PostgreSQL function `restore_tracker_state(trackers_payload jsonb, logs_payload jsonb, settings_payload jsonb)` that:

- derives the user from `auth.uid()` and rejects a null user;
- deletes only that user's current logs and trackers;
- inserts only validated payload records scoped to that user;
- upserts only that user's settings;
- runs in one database transaction because a PostgreSQL function call is atomic;
- has execute permission only for `authenticated`;
- sets a safe `search_path` and never accepts a caller-provided user ID.

The migration must include explicit `revoke all` followed by `grant execute ... to authenticated` and must match the exact live column types discovered in Step 1.

- [ ] **Step 5: Implement and verify the RPC repository method**

Call `supabase.rpc('restore_tracker_state', ...)` from the repository and translate errors through `RepositoryError`. Run unit tests, linked database lint, and a destructive integration test only against a backup/test account.

- [ ] **Step 6: Document schema workflow and commit**

Document linking, pull/diff, lint, and migration deployment commands without credentials. Then run the full suite and commit:

```powershell
git add supabase src/services README.md
git commit -m "feat: version Supabase schema and atomic restore"
```

### Task 13: Add browser tests and continuous integration

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/auth.spec.ts`
- Create: `tests/e2e/tracker-crud.spec.ts`
- Create: `tests/e2e/offline-sync.spec.ts`
- Create: `tests/e2e/responsive-theme.spec.ts`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/pages.yml`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: final Vite app and a non-production test configuration.
- Produces: repeatable Chromium smoke tests, branch CI, and main-only Pages deployment.

- [ ] **Step 1: Configure Playwright and install Chromium**

Create config with `webServer.command = 'npm run dev -- --host 127.0.0.1'`, `baseURL = 'http://127.0.0.1:5173'`, trace on first retry, screenshot on failure, and Chromium desktop plus one mobile viewport project. Run `npx playwright install chromium`.

- [ ] **Step 2: Add deterministic browser fixtures**

Intercept Supabase HTTP calls or inject fake repositories through a test-only composition option that is excluded from normal production startup. Fixtures must cover signed-out, signed-in empty, populated, offline-pending, and repository-error states. Never embed production credentials.

- [ ] **Step 3: Write and run browser flows**

Implement tests for auth visibility, tracker/log CRUD, offline/reconnect, history filters, theme, and responsive navigation. Run `npm run test:e2e`.

Expected: all tests pass locally against deterministic fixtures without touching production Supabase.

- [ ] **Step 4: Add non-deployment CI**

`.github/workflows/ci.yml` runs on pull requests and pushes to `dev` and `main`, uses Node LTS with npm cache, runs `npm ci`, installs Playwright Chromium, then runs typecheck, lint, unit tests, E2E tests, and build.

- [ ] **Step 5: Add main-only Pages deployment**

`.github/workflows/pages.yml` runs only on pushes to `main` and manual dispatch. It uses GitHub Pages permissions, runs `npm ci` and `npm run build`, uploads `dist/`, and deploys with the official Pages actions. It must not run on `dev`.

- [ ] **Step 6: Run the full local gate and commit**

```powershell
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
git diff --check
git add playwright.config.ts tests .github package.json package-lock.json README.md
git commit -m "ci: add application verification and Pages deployment"
```

### Task 14: Final parity, security, and release-readiness review

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md` if commands or structure changed
- Modify: `CHANGELOG.md` only through the approved release workflow, not during this task

**Interfaces:**
- Consumes: completed typed application and all prior verification commands.
- Produces: review evidence that meets the design definition of done; no production release or merge is performed automatically.

- [ ] **Step 1: Verify architecture boundaries**

Run searches and fail the review if any result is unexplained:

```powershell
rg -n "window\.supabase|supabase\.from\(" src
rg -n "app-[1-4]|cdn\.jsdelivr\.net/npm/@supabase" index.html src public
rg -n "service_role|service-role|SUPABASE_SERVICE|DATABASE_PASSWORD" . -g '!node_modules/**' -g '!dist/**'
```

Expected: `supabase.from` appears only in the concrete repository/client boundary; legacy/CDN and secret searches return no application matches.

- [ ] **Step 2: Run every automated check from a clean install**

Remove only the generated `node_modules` and `dist` directories after confirming their resolved paths are inside the repository, then run:

```powershell
npm ci
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 3: Complete manual acceptance**

Use the beta account for non-destructive checks and a backup/test account for destructive checks. Verify auth, all CRUD, refresh persistence, offline recovery, queue sync, import/export, undo, sample data, clear/reset, themes, and responsive layouts. Confirm the deployed artifact under the GitHub Pages repository path loads all assets and signs in successfully.

- [ ] **Step 4: Update contributor documentation**

README and AGENTS must state `npm run dev`, `npm run build`, the complete verification commands, `src/` module responsibilities, `supabase/migrations/`, `dist/` deployment, and the rule that only `main` deploys production.

- [ ] **Step 5: Review Git diff and commit documentation only if changed**

```powershell
git status --short
git diff --check
git diff --stat main...HEAD
git add README.md AGENTS.md
git commit -m "docs: update typed application workflow"
```

If README/AGENTS required no change because earlier tasks already made them exact, skip the empty commit.

- [ ] **Step 6: Stop for Vincent's integration decision**

Report the final test evidence, migration notes, commit list, and any remaining manual GitHub/Supabase dashboard actions. Do not merge `dev`, push, publish a release, or modify `main` without explicit approval.
