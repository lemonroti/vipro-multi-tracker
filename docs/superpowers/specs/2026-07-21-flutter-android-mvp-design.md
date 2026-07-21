# Flutter Android MVP Design

## Status

Approved scope for the `flutter-android-mvp` branch. The `main` branch remains unchanged and continues to host the existing TypeScript web application.

## Goal

Add an Android-first Flutter client to the existing repository. The first APK must provide a reliable daily tracker experience with Supabase cloud sync, offline recording, and a configurable one-tap Android home-screen widget.

## Branch and repository boundaries

- All Flutter work is isolated to `flutter-android-mvp`.
- The existing web app remains in the repository unchanged for reference and continued production use.
- The Flutter project lives under `apps/flutter/`.
- Shared Supabase migrations remain under the existing root `supabase/` directory.
- No commits are made to `main` during this project.

## First release scope

The first Android APK includes:

- Email/password sign in and sign up using the existing Supabase project.
- Tracker list and tracker create/edit/delete.
- Quick recording from the app.
- Manual record entry with value, date/time, and optional note.
- History list with edit and delete.
- Local-first offline recording.
- Automatic synchronization when connectivity returns.
- Visible pending-sync state.
- Configurable single-tracker Android home-screen widget.
- One-tap widget recording without opening the full app.
- Light, dark, and system theme support.

The first APK excludes:

- Notifications and reminders.
- Flutter Web deployment.
- iOS build and release work.
- Charts.
- JSON import/export and CSV export.
- Sample-data and reset tools.
- Multi-tracker widgets.

## Technology

- Flutter and Dart.
- Riverpod for state and dependency management.
- `go_router` for application navigation.
- `supabase_flutter` for authentication and cloud persistence.
- Drift for the local relational database.
- Connectivity monitoring for sync triggers.
- Android AppWidget implementation integrated with Flutter through a small platform channel or a maintained widget bridge package.
- GitHub Actions for Android verification and APK artifact builds.

## Application structure

```text
apps/flutter/
├── android/
├── lib/
│   ├── app/
│   ├── auth/
│   ├── database/
│   ├── trackers/
│   ├── logs/
│   ├── history/
│   ├── sync/
│   ├── widget/
│   └── shared/
├── test/
├── integration_test/
└── pubspec.yaml
```

Each feature owns its UI and application logic. Database, synchronization, Supabase adapters, and widget integration are isolated behind interfaces so that platform-specific details do not leak into feature screens.

## Local data model

The Flutter client mirrors the existing Supabase domain model:

### Tracker

- `id`
- `name`
- `unit`
- `icon`
- `color`
- `goal`
- `presets`
- `active`
- `sortOrder`
- `createdAt`
- local sync metadata

### Tracking log

- `id`
- `trackerId`
- `value`
- `occurredAt`
- `note`
- `source`
- local sync metadata

### User settings

- `theme`
- `confirmDelete`

### Pending operation

- operation ID
- operation type
- entity ID
- serialized payload
- creation time
- retry count
- last error

Client-created UUIDs are generated before local insertion. The same UUID is later sent to Supabase, preventing duplicate records after retries.

## Local-first write flow

All app and widget writes use this sequence:

```text
User action
→ validate input
→ write to Drift transaction
→ append pending operation
→ update UI/widget immediately
→ attempt Supabase sync when online
→ remove pending operation after successful cloud write
```

The UI never waits for Supabase before confirming a local record. A successful local transaction is enough to show that the action was recorded. Pending state remains visible until cloud synchronization completes.

## Cloud synchronization

Synchronization is user-scoped and uses the existing Supabase tables and RLS policies.

The synchronization engine:

1. Authenticates the current user.
2. Drains local pending operations in creation order.
3. Uses idempotent upserts for tracker and log writes.
4. Sends deletes only for the authenticated user's entities.
5. Stops on the first retryable failure and retries later.
6. Pulls current cloud trackers, logs, and settings after pending writes succeed.
7. Reconciles cloud state into Drift.

For the MVP, conflicts use last-write-wins based on the latest known update time. Deletes take precedence when a delete operation is still pending. The sync layer must never silently discard a pending local write.

## Authentication and account isolation

The Flutter app uses the existing Supabase URL and publishable key. No service-role key, database password, or other secret is embedded in the app.

Supabase Auth sessions are persisted securely by `supabase_flutter`. Local Drift rows and pending operations are partitioned by authenticated user ID. Signing out clears the active in-memory session and prevents one account from viewing another account's local data.

## Android home-screen widget

The widget is a configurable single-action widget.

During widget configuration, the user selects:

- one tracker;
- one quick value;
- an optional display title.

The widget displays:

- tracker icon;
- tracker name or custom title;
- quick value and unit;
- current status or last-record feedback.

On tap:

1. Android receives the widget action without opening the full Flutter UI.
2. A tracking log with a UUID and current device timestamp is written locally.
3. A pending Supabase upsert is created.
4. The widget briefly displays success feedback such as `Recorded +15 min`.
5. Sync runs immediately when possible or waits until the app/background sync next runs.

Multiple widget instances are allowed. Each widget instance stores its own tracker and quick-value configuration.

The widget must still record while offline. If the user is signed out or the configured tracker no longer exists, the widget must not create a record and should display an action-required state.

## Android background behavior

The MVP does not promise continuous background execution. Sync is triggered by:

- app startup;
- app resume;
- restored connectivity while the app is active;
- manual sync;
- widget action when Android permits network work;
- an opportunistic background worker for pending operations.

Local recording remains reliable even when Android delays background networking.

## UI and navigation

The Android MVP uses a mobile-first Material interface inspired by the current approved tracker design rather than reproducing desktop web layouts exactly.

Primary navigation:

- Home: active trackers and quick-record actions.
- History: records with edit/delete.
- Trackers: create and configure trackers.
- Settings: account, theme, and sync status.

The widget configuration screen is launched by Android when a widget is added and can also be reopened from app settings.

## Error handling

- Validation errors remain inline and do not alter local state.
- Offline writes succeed locally and show a pending-sync indicator.
- Authentication and permission errors stop synchronization and require user action.
- Retryable network failures remain queued.
- Permanent rejected operations expose an error state rather than retrying forever.
- Database transactions keep entity writes and queue writes atomic.
- Widget failures show an action-required status instead of claiming success.

## Testing

### Dart unit tests

- Domain validation.
- Drift repositories.
- Queue compaction and retry behavior.
- Sync reconciliation and idempotency.
- Account isolation.
- Widget configuration logic.

### Flutter widget tests

- Auth forms.
- Tracker list and editor.
- Quick record interaction.
- History editing/deletion.
- Pending-sync indicators.
- Light and dark themes.

### Android integration tests

- Sign in against a controlled test environment.
- Offline record then reconnect and sync.
- Widget configuration.
- One-tap widget record while online.
- One-tap widget record while offline followed by later sync.

### Build verification

GitHub Actions must run formatting checks, static analysis, unit/widget tests, and an Android debug APK build. The APK is uploaded as a workflow artifact for download.

## Delivery

The first deliverable is a debug APK built from `flutter-android-mvp`. It is intended for direct installation and testing, not Play Store publication.

A later release phase may add signed release builds, Play Store configuration, notifications, richer widgets, Flutter Web, and iOS.

## Success criteria

The MVP is successful when:

- it installs on a supported Android phone;
- the user can sign in to the existing Supabase account;
- current trackers and records load correctly;
- tracker and log CRUD work;
- records can be created offline and later appear in Supabase once synced;
- one configurable widget instance can record the selected value with one tap;
- widget records work offline and sync later;
- the current `main` branch and production web app remain unchanged;
- GitHub Actions produces a downloadable debug APK artifact.
