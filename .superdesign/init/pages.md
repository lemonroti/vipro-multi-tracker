# Page Dependency Trees

All views share `index.html`, `src/styles/app.css`, `src/main.ts`, the application store, and the
shell controller. The trees below include every local UI-touching dependency for each view; pure
repository and persistence dependencies are omitted because they do not affect visual reproduction.

## Authentication

Entry: `index.html#authScreen`

- `index.html`
- `src/styles/app.css`
- `src/main.ts`
  - `src/features/auth/index.ts`
    - `src/shared/dom.ts`
  - `src/features/shell/index.ts`
    - `src/shared/dom.ts`

## Dashboard (`#view-dashboard`)

Entry: `index.html#view-dashboard`

- `index.html`
- `src/styles/app.css`
- `src/main.ts`
  - `src/features/shell/index.ts`
    - `src/shared/dom.ts`
  - `src/features/dashboard/index.ts`
    - `src/domain/models.ts`
    - `src/shared/dates.ts`
    - `src/shared/dom.ts`
    - `src/shared/formatting.ts`
  - `src/state/app-store.ts`
    - `src/domain/models.ts`

## History (`#view-history`)

Entry: `index.html#view-history`

- `index.html`
- `src/styles/app.css`
- `src/main.ts`
  - `src/features/shell/index.ts`
    - `src/shared/dom.ts`
  - `src/features/history/index.ts`
    - `src/domain/models.ts`
    - `src/shared/dates.ts`
    - `src/shared/dom.ts`
    - `src/shared/formatting.ts`
  - `src/features/logs/index.ts`
    - `src/domain/models.ts`
    - `src/shared/dates.ts`
    - `src/shared/dom.ts`
  - `src/state/app-store.ts`

## Trackers (`#view-trackers`)

Entry: `index.html#view-trackers`

- `index.html`
- `src/styles/app.css`
- `src/main.ts`
  - `src/features/shell/index.ts`
    - `src/shared/dom.ts`
  - `src/features/trackers/index.ts`
    - `src/domain/models.ts`
    - `src/shared/dom.ts`
    - `src/shared/formatting.ts`
  - `src/features/logs/index.ts`
    - `src/shared/dates.ts`
    - `src/shared/dom.ts`
  - `src/state/app-store.ts`

## Settings (`#view-settings`)

Entry: `index.html#view-settings`

- `index.html`
- `src/styles/app.css`
- `src/main.ts`
  - `src/features/shell/index.ts`
    - `src/shared/dom.ts`
  - `src/features/settings/index.ts`
    - `src/domain/models.ts`
    - `src/shared/dom.ts`
  - `src/state/app-store.ts`

## Tracker and log modals

- `index.html#trackerModal`
  - `src/features/trackers/index.ts`
  - `src/features/shell/index.ts`
  - `src/styles/app.css`
- `index.html#logModal`
  - `src/features/logs/index.ts`
  - `src/features/shell/index.ts`
  - `src/styles/app.css`
