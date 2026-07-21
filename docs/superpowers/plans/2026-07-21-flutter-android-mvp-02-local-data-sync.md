# Part 2 — Local Database and Supabase Synchronization

## Task 5: Add backward-compatible sync timestamps

**Files:**
- Create: `supabase/migrations/20260721xxxxxx_add_sync_timestamps.sql`
- Test: `tests/migrations.test.ts`

**Produces:** `updated_at` columns and automatic timestamp updates required for deterministic reconciliation.

- [ ] Extend migration contract tests to assert `trackers`, `tracking_logs`, and `user_settings` contain `updated_at timestamptz not null`.

- [ ] Create migration:

```sql
alter table public.trackers
  add column if not exists updated_at timestamptz not null default now();

alter table public.tracking_logs
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_settings
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trackers_set_updated_at on public.trackers;
create trigger trackers_set_updated_at
before update on public.trackers
for each row execute function public.set_updated_at();

drop trigger if exists tracking_logs_set_updated_at on public.tracking_logs;
create trigger tracking_logs_set_updated_at
before update on public.tracking_logs
for each row execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();
```

- [ ] Replay locally:

```bash
npm ci
npx supabase db start
npx supabase db reset --local --no-seed
npx supabase db lint --local --level warning --fail-on error
npm run test -- tests/migrations.test.ts
npx supabase stop --no-backup
```

Expected: migration replay and tests pass. Do not push this migration to production during this task.

- [ ] Commit:

```bash
git add supabase/migrations tests/migrations.test.ts
git commit -m "feat(db): add sync timestamps"
```

## Task 6: Create Drift schema and user-scoped repositories

**Files:**
- Create: `apps/flutter/lib/database/tables.dart`
- Create: `apps/flutter/lib/database/app_database.dart`
- Create: `apps/flutter/lib/database/database_provider.dart`
- Create: `apps/flutter/lib/database/local_repositories.dart`
- Test: `apps/flutter/test/database/app_database_test.dart`

**Produces:** `AppDatabase`, `LocalTrackerRepository`, `LocalLogRepository`, `LocalSettingsRepository`, `PendingOperationRepository`.

- [ ] Write failing in-memory database tests proving:
  - data is filtered by `userId`;
  - tracker/log records exclude soft-deleted rows from normal watches;
  - entity and pending operation can be written in one transaction;
  - deleting an account's local data does not affect another account.

- [ ] Define Drift tables:

```dart
class LocalTrackers extends Table {
  TextColumn get id => text()();
  TextColumn get userId => text()();
  TextColumn get name => text()();
  TextColumn get unit => text()();
  TextColumn get icon => text()();
  TextColumn get color => text()();
  RealColumn get goal => real().nullable()();
  TextColumn get presetsJson => text()();
  BoolColumn get active => boolean().withDefault(const Constant(true))();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
  TextColumn get syncState => text()();
  DateTimeColumn get deletedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}
```

Add equivalent `LocalTrackingLogs`, `LocalUserSettings`, `PendingOperations`, and `WidgetConfigurations`. `WidgetConfigurations` uses Android `appWidgetId` as primary key and stores user ID, tracker ID, title, value, unit, icon, and updated timestamp.

- [ ] Configure database:

```dart
@DriftDatabase(tables: [
  LocalTrackers,
  LocalTrackingLogs,
  LocalUserSettings,
  PendingOperations,
  WidgetConfigurations,
])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(driftDatabase(name: 'vipro_multi_tracker'));

  @visibleForTesting
  AppDatabase.forTesting(QueryExecutor executor) : super(executor);

  @override
  int get schemaVersion => 1;
}
```

- [ ] Generate Drift code:

```bash
dart run build_runner build --delete-conflicting-outputs
```

- [ ] Implement user-scoped watch/read methods and atomic transaction methods:

```dart
Future<void> upsertTrackerWithOperation(
  TrackerModel tracker,
  PendingOperation operation,
);

Future<void> upsertLogWithOperation(
  TrackingLogModel log,
  PendingOperation operation,
);

Future<void> markTrackerDeletedWithOperation(
  String userId,
  String trackerId,
  PendingOperation operation,
);

Future<void> markLogDeletedWithOperation(
  String userId,
  String logId,
  PendingOperation operation,
);
```

Each method must use `database.transaction` and either commit both writes or neither.

- [ ] Verify:

```bash
flutter test test/database/app_database_test.dart
flutter analyze
```

- [ ] Commit:

```bash
git add apps/flutter/lib/database apps/flutter/test/database
git commit -m "feat(flutter): add local Drift storage"
```

## Task 7: Implement local-first tracker and log services

**Files:**
- Create: `apps/flutter/lib/trackers/tracker_service.dart`
- Create: `apps/flutter/lib/logs/log_service.dart`
- Test: `apps/flutter/test/trackers/tracker_service_test.dart`
- Test: `apps/flutter/test/logs/log_service_test.dart`

**Produces:**

```dart
Future<TrackerModel> createTracker(ValidatedTrackerInput input);
Future<void> updateTracker(String id, ValidatedTrackerInput input);
Future<void> deleteTracker(String id);
Future<TrackingLogModel> addLog(ValidatedLogInput input, {String source});
Future<void> updateLog(String id, ValidatedLogInput input);
Future<void> deleteLog(String id);
```

- [ ] Write failing tests confirming every service call:
  - generates UUID before insertion;
  - stores `EntitySyncState.pending`;
  - writes matching pending operation atomically;
  - preserves manual `occurredAt` values;
  - uses source `android` for app records and `android-widget` for widget records;
  - compacts repeated upserts of the same entity;
  - replaces an unsynced upsert with delete when that same entity is deleted.

- [ ] Implement operation compaction in `PendingOperationRepository.enqueue`:

```text
same entity + upsert → keep newest upsert
pending upsert + delete → keep delete only
same settings user + save → keep newest save
```

- [ ] Use injected `Uuid` and clock functions so tests are deterministic.

- [ ] Verify:

```bash
flutter test test/trackers/tracker_service_test.dart test/logs/log_service_test.dart
```

- [ ] Commit:

```bash
git add apps/flutter/lib/trackers/tracker_service.dart apps/flutter/lib/logs/log_service.dart apps/flutter/test/trackers apps/flutter/test/logs
git commit -m "feat(flutter): add local-first tracker services"
```

## Task 8: Build Supabase adapters and synchronization engine

**Files:**
- Create: `apps/flutter/lib/sync/cloud_repository.dart`
- Create: `apps/flutter/lib/sync/sync_models.dart`
- Create: `apps/flutter/lib/sync/sync_engine.dart`
- Create: `apps/flutter/lib/sync/sync_controller.dart`
- Test: `apps/flutter/test/sync/sync_engine_test.dart`

**Produces:** `CloudRepository`, `SupabaseCloudRepository`, `SyncEngine.syncUser(String userId)`, and observable `SyncStatus`.

- [ ] Write failing tests with fake local/cloud repositories covering:
  - queue drain order;
  - idempotent retry of an upsert;
  - stop-on-first retryable network failure;
  - permanent validation/permission failure marked failed;
  - cloud pull only after pending writes succeed;
  - user isolation;
  - pending local delete wins over pulled cloud row;
  - newer `updatedAt` wins when neither side has pending work.

- [ ] Define cloud interface:

```dart
abstract interface class CloudRepository {
  Future<void> upsertTracker(String userId, TrackerModel tracker);
  Future<void> deleteTracker(String userId, String trackerId);
  Future<void> upsertLog(String userId, TrackingLogModel log);
  Future<void> deleteLog(String userId, String logId);
  Future<void> saveSettings(String userId, UserSettingsModel settings);
  Future<CloudSnapshot> loadSnapshot(String userId);
}
```

- [ ] Map current Supabase columns exactly:

```text
trackers: id, user_id, name, unit, icon, color, daily_goal,
quick_values, is_active, sort_order, created_at, updated_at

tracking_logs: id, user_id, tracker_id, value, occurred_at,
note, source, client_id, updated_at

user_settings: user_id, theme, preferences, dashboard_layout, updated_at
```

Every Supabase query must include `.eq('user_id', userId)` where applicable; RLS remains the final authorization boundary.

- [ ] Implement `SyncEngine.syncUser`:

```dart
Future<SyncReport> syncUser(String userId) async {
  final operations = await pendingOperations.listOrdered(userId);
  for (final operation in operations) {
    try {
      await _execute(operation);
      await pendingOperations.remove(operation.id);
      await local.markEntitySynced(operation);
    } on RetryableSyncException catch (error) {
      await pendingOperations.incrementRetry(operation.id, error.message);
      return SyncReport.blocked(error.message);
    } on PermanentSyncException catch (error) {
      await pendingOperations.markFailed(operation.id, error.message);
      return SyncReport.failed(error.message);
    }
  }
  final snapshot = await cloud.loadSnapshot(userId);
  await local.reconcile(userId, snapshot);
  return const SyncReport.synced();
}
```

- [ ] Implement `SyncController` triggers for app startup, app resume, connectivity restoration, and manual sync. Ensure concurrent calls share one in-flight future.

- [ ] Verify:

```bash
flutter test test/sync/sync_engine_test.dart
flutter analyze
```

- [ ] Commit:

```bash
git add apps/flutter/lib/sync apps/flutter/test/sync
git commit -m "feat(flutter): add Supabase synchronization"
```

## Task 9: Enforce local account isolation and sign-out behavior

**Files:**
- Modify: `apps/flutter/lib/auth/auth_controller.dart`
- Create: `apps/flutter/lib/shared/providers.dart`
- Test: `apps/flutter/test/auth/account_isolation_test.dart`

**Produces:** active user-scoped provider graph and safe account switching.

- [ ] Write tests proving user A rows never appear in user B streams, pending operations are user-scoped, and sign-out disposes active watches.

- [ ] Scope repositories/services by authenticated user ID using Riverpod provider families.

- [ ] On sign-out:
  - stop sync subscriptions;
  - clear in-memory selected tracker/navigation state;
  - keep encrypted/session storage owned by `supabase_flutter` only;
  - retain local rows partitioned by user so the same user can reopen offline after a persisted session;
  - never display those rows without a matching active user ID.

- [ ] Verify:

```bash
flutter test test/auth/account_isolation_test.dart
```

- [ ] Commit:

```bash
git add apps/flutter/lib/auth apps/flutter/lib/shared apps/flutter/test/auth
git commit -m "fix(flutter): isolate local data by account"
```
