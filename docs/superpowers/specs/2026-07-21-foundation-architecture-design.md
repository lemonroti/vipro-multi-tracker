# Foundation Architecture Design

Date: 2026-07-21
Status: Approved design
Target branch: `dev`

## Context

VIPRO Multi Tracker is a beta, build-free static web application currently tested by its founder. It uses HTML, CSS, global JavaScript bundles, Supabase Auth/Postgres, a `localStorage` cache and offline operation queue, and GitHub Pages hosting.

The current product works, but its runtime depends on a Supabase CDN script followed by six numbered scripts loaded in a fixed order. Those scripts share mutable global state and functions. Supabase persistence, offline behavior, state mutation, rendering, formatting, destructive operations, and initialization cross file boundaries without explicit module contracts. There is no static type checking or automated test suite, and the Supabase schema and RLS policies are not versioned in this repository.

This project will remain a web-only beta during this refactor. Cross-device mobile and browser-extension work is explicitly deferred.

## Decision

Refactor the existing application onto this foundation:

- HTML and CSS for the existing presentation.
- Vanilla TypeScript for application code.
- Vite for development, module resolution, dependency bundling, and production builds.
- Native ES module `import` and `export` boundaries.
- The Supabase JavaScript client installed as a pinned npm dependency.
- Zod for validation at runtime trust boundaries.
- A small typed application store without Redux, Zustand, or another state framework.
- Feature-based UI modules backed by typed services and repositories.
- Vitest for unit tests and Playwright for critical browser flows.
- GitHub Actions to build `dist/` and deploy GitHub Pages from `main`.

React, Vue, Svelte, Capacitor, browser-extension tooling, PHP, PSR-4, and an OOP-heavy architecture are not part of this refactor.

## Goals

- Preserve the current UI, user flows, Supabase project, and existing user data.
- Replace implicit script ordering and global dependencies with explicit typed modules.
- Establish clear ownership for domain data, state, persistence, synchronization, and UI behavior.
- Make offline behavior deterministic, recoverable, and testable.
- Validate data entering from forms, local cache, imported JSON, and Supabase.
- Add automated checks that protect the important behavior before legacy bundles are removed.
- Keep hosting and tooling costs at zero under the current GitHub Pages and Supabase Free usage.
- Leave reusable domain and service boundaries for a possible future cross-device phase.

## Non-goals

- Redesigning the interface or changing product behavior.
- Adding features during the refactor.
- Building Android, iOS, PWA, or browser-extension applications.
- Replacing Supabase or changing authentication providers.
- Introducing a general-purpose UI framework or state-management framework.
- Rewriting the application in PHP or adopting PSR-4.
- Changing production data merely to satisfy the new source-code structure.

## Proposed project structure

```text
vipro-multi-tracker/
|-- index.html
|-- src/
|   |-- main.ts
|   |-- config/
|   |   `-- environment.ts
|   |-- domain/
|   |   |-- tracker.ts
|   |   |-- tracking-log.ts
|   |   |-- settings.ts
|   |   `-- schemas.ts
|   |-- state/
|   |   `-- app-store.ts
|   |-- services/
|   |   |-- supabase-client.ts
|   |   |-- tracker-repository.ts
|   |   |-- log-repository.ts
|   |   |-- settings-repository.ts
|   |   |-- offline-queue.ts
|   |   |-- sync-service.ts
|   |   `-- backup-service.ts
|   |-- features/
|   |   |-- auth/
|   |   |-- dashboard/
|   |   |-- history/
|   |   |-- trackers/
|   |   `-- settings/
|   |-- shared/
|   |   |-- dom.ts
|   |   |-- dates.ts
|   |   |-- formatting.ts
|   |   `-- ids.ts
|   `-- styles/
|       |-- tokens.css
|       |-- components.css
|       `-- responsive.css
|-- supabase/
|   `-- migrations/
|-- tests/
|   `-- e2e/
|-- vite.config.ts
|-- tsconfig.json
`-- package.json
```

The exact number of files may change when responsibilities are examined during migration. The architectural boundaries and dependency rules below are authoritative; the tree is an intended starting layout rather than a requirement to create empty files.

## Module responsibilities and dependency rules

### Domain

`domain/` defines `Tracker`, `TrackingLog`, `UserSettings`, persisted operation types, and validation schemas. Domain modules contain no DOM access, Supabase calls, browser storage, or rendering. Calculations such as daily totals and state normalization should be pure functions when they represent domain behavior.

### State

`state/app-store.ts` owns the in-memory application state. It exposes typed read access, explicit update methods, subscriptions, and reset behavior. Feature modules and services must not mutate arrays or nested state directly.

No external state-management framework is required. The store should be small enough to understand in one file or a few focused files if it grows.

### Services and repositories

Repositories own table-specific persistence and mapping between Supabase rows and domain models. Higher-level services coordinate validation, optimistic updates, cache persistence, offline queueing, cloud persistence, rollback, and user-facing results.

Only the Supabase client and repository modules may call `supabase.from(...)` or Supabase RPCs. UI feature modules must not know table names or database column names.

### Features

Each folder under `features/` owns the DOM rendering and interactions for one product area. Features call service APIs and subscribe to the store. They may use shared DOM, date, and formatting helpers, but must not reach into another feature's internal files.

### Composition root

`main.ts` creates concrete repositories and services, initializes shared dependencies, binds feature entry points, restores the session, and starts the application. It contains orchestration only, not product rules.

The permitted dependency direction is:

```text
domain <- state/services <- features <- main
```

Shared utilities must remain dependency-light. Circular imports are not permitted. All cross-module dependencies must be explicit imports.

## Runtime data flow

### Startup

1. `main.ts` initializes the environment configuration and Supabase client.
2. The authentication service restores the current session.
3. If no session exists, the auth screen is displayed and application state remains blank.
4. For an authenticated session, the user-scoped local cache and offline queue are loaded and validated.
5. Valid cached data is placed in the store and rendered immediately.
6. If online, the sync service processes pending operations in order.
7. Repositories load the latest cloud trackers, logs, and settings.
8. Cloud rows are mapped, validated, reconciled with pending operations, and committed to the store.
9. The validated state is cached and the affected features render.

An invalid cache must not crash startup. It is ignored with a recoverable application error while cloud loading proceeds when possible.

### Normal mutation

1. A feature receives a user event and parses the form or action payload.
2. Runtime validation rejects invalid input before state changes.
3. A service creates an operation with a unique operation ID.
4. The store receives an optimistic update through an explicit method.
5. The updated state is saved to the local cache and rendered.
6. Online operations are sent to the appropriate repository. Offline operations are added to the queue.
7. A network failure is treated as an offline result and keeps the optimistic change queued.
8. A validation, permission, or non-network persistence failure rolls the optimistic change back and presents a safe message.

UI code receives a typed result and does not interpret raw Supabase errors.

## Offline queue design

Each persisted operation includes:

```ts
type OfflineOperation = {
  id: string;
  type: OperationType;
  payload: unknown;
  createdAt: string;
  retryCount: number;
};
```

The operation payload is validated according to its operation type before execution.

Queue rules:

- Cache and queue keys are scoped to the authenticated user ID.
- Operations execute in creation order.
- Only one sync execution may run at a time.
- An operation is removed only after confirmed persistence.
- Network failures remain queued and increment retry metadata.
- Validation, permission, and other permanent failures do not retry forever.
- Multiple pending updates for the same entity may be coalesced when doing so preserves behavior.
- A pending delete supersedes older pending updates for the same entity.
- Operation IDs provide client-side idempotency; database constraints remain responsible for preventing duplicate entities.
- Reloading during pending work reconstructs the visible state from the validated cache and queued operations.

The initial refactor will preserve the current last-write-wins behavior. More advanced multi-device conflict resolution is deferred to the cross-device phase.

## Error model

Infrastructure errors are mapped to application errors:

- `NetworkError`
- `ValidationError`
- `AuthenticationError`
- `PermissionError`
- `PersistenceError`

Expected errors return typed results. Unexpected programming errors may throw and are handled at an application boundary. User messages must be safe and understandable; raw database details are retained only for development diagnostics and must not expose secrets.

Destructive bulk operations such as import and reset are online-only. Imported data is fully validated before deletion begins. The implementation plan must evaluate a transactional Supabase RPC or equivalent atomic database operation so partial replacement cannot leave cloud data in an unintended intermediate state.

## Supabase and security boundaries

- Keep the existing Supabase project and user data.
- Only the project URL and publishable key may be included in frontend output.
- Never expose a service-role key, database password, access token, or committed `.env` file.
- Use `.env.example` for required variable names and local ignored environment files for values.
- Configure GitHub deployment with environment-specific public values.
- Repositories include the authenticated user scope where appropriate; RLS remains the authoritative security boundary.
- Existing tables, indexes, foreign keys, cascades, and RLS policies must be inspected before a baseline migration is written.
- The repository should ultimately contain reproducible Supabase migrations without applying destructive schema changes to production during the architecture refactor.

## Migration strategy

This is a controlled migration, not a blank-slate rewrite:

1. Add Vite, TypeScript, linting, tests, and the production build without changing the product UI.
2. Capture baseline behavior with characterization tests and manual checks.
3. Introduce domain models, schemas, and the typed store.
4. Extract Supabase repositories, cache access, the offline queue, synchronization, and backup behavior.
5. Migrate features in this order: auth, trackers, logs, dashboard, history, settings, backup/import/reset.
6. Verify behavior after each migrated slice.
7. Keep legacy runtime files available until the new entry point has full parity.
8. Remove the CDN loader and numbered `app-*.js` files only after automated and manual acceptance checks pass.
9. Build and validate the GitHub Pages artifact before merging `dev` into `main`.

Feature work and unrelated refactoring are excluded from the migration. Any discovered behavioral change is either corrected to match the baseline or proposed separately for approval.

## Testing strategy

### Unit tests

Vitest covers:

- Tracker, log, settings, cache, queue, and import validation.
- State normalization and explicit store transitions.
- Daily totals, date keys, time-zone-sensitive formatting boundaries, and sorting.
- Supabase row-to-domain and domain-to-row mapping.
- Queue ordering, retry classification, coalescing, deletion supersession, and successful removal.
- Optimistic updates and rollback.
- Import ID remapping and invalid relationship rejection.
- CSV escaping and export transformations.
- Theme and settings defaults.

Repositories are expressed behind interfaces so unit tests can use in-memory fakes and never mutate the production database.

### Browser tests

Playwright covers critical flows in an isolated or mocked test environment:

- Auth screen visibility and authenticated startup.
- Tracker and log create, update, and delete.
- Quick and manual logging.
- History filters.
- Light and dark themes.
- Offline save, refresh recovery, and reconnect sync.
- JSON export and import validation.
- Representative mobile, tablet, and desktop layouts.

Destructive automated tests must not run against the production Supabase project.

### Required checks

```text
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
git diff --check
```

Manual verification remains required for authentication, CRUD, persistence, offline recovery, responsive layouts, themes, import/export, undo, sample data, clear/reset operations, and existing user data.

## Deployment design

- Development occurs on `dev`; `dev` does not deploy to the production Pages site.
- Pull requests and relevant branch pushes run type checking, linting, tests, and the production build.
- Only `main` deploys to production.
- GitHub Actions installs locked dependencies with `npm ci`, builds with Vite, and publishes `dist/` to GitHub Pages.
- Vite's `base` configuration matches the GitHub Pages repository path or custom domain.
- Deployment does not require a persistent Node server; the final application remains static hosting.
- The existing `main` branch and `v0.1.0` tag remain the rollback baseline until the migration is accepted.

## Definition of done

The foundation refactor is complete only when:

- Current UI and intended behavior have no unapproved changes.
- Existing Supabase user data remains intact and usable.
- Supabase is a pinned npm dependency rather than a runtime CDN global.
- The numbered script loader and application globals are removed.
- Module responsibilities and dependency rules are enforced through explicit imports.
- Supabase calls are confined to the client/repository boundary.
- State changes go through the typed store and services.
- Cache, import, and cloud data are validated at runtime boundaries.
- Offline queue and rollback behavior have automated coverage.
- Required automated checks pass.
- Manual acceptance checks pass in light and dark modes and representative responsive sizes.
- The production Vite artifact works under the configured GitHub Pages path.
- Production deployment from `main` succeeds.

## Risks and mitigations

- **Behavioral regression during extraction:** migrate one feature slice at a time and retain legacy files until parity is proven.
- **Existing data mismatch:** validate mappings against current rows and avoid schema changes until the live contract is understood.
- **Offline data loss:** characterize current behavior first, test cache and queue recovery, and never remove a queued operation before confirmed persistence.
- **GitHub Pages path failures:** validate the Vite `base` setting and built artifact before production deployment.
- **Tooling complexity:** use the minimum stack in this decision and defer UI frameworks and cross-device tooling.
- **Partial destructive imports:** require complete pre-validation and design an atomic database operation before replacing the current multi-request implementation.
