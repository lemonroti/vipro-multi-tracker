import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'app_database.g.dart';

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
  Set<Column<Object>> get primaryKey => {id};
}

class LocalTrackingLogs extends Table {
  TextColumn get id => text()();
  TextColumn get userId => text()();
  TextColumn get trackerId => text()();
  RealColumn get value => real()();
  DateTimeColumn get occurredAt => dateTime()();
  TextColumn get note => text().withDefault(const Constant(''))();
  TextColumn get source => text().withDefault(const Constant('android'))();
  DateTimeColumn get updatedAt => dateTime()();
  TextColumn get syncState => text()();
  DateTimeColumn get deletedAt => dateTime().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class LocalUserSettings extends Table {
  TextColumn get userId => text()();
  TextColumn get theme => text().withDefault(const Constant('system'))();
  BoolColumn get confirmDelete => boolean().withDefault(const Constant(true))();
  DateTimeColumn get updatedAt => dateTime()();
  TextColumn get syncState => text()();

  @override
  Set<Column<Object>> get primaryKey => {userId};
}

class PendingSyncOperations extends Table {
  TextColumn get id => text()();
  TextColumn get userId => text()();
  TextColumn get operationType => text()();
  TextColumn get entityId => text().nullable()();
  TextColumn get payloadJson => text()();
  DateTimeColumn get createdAt => dateTime()();
  IntColumn get retryCount => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class WidgetConfigurations extends Table {
  IntColumn get appWidgetId => integer()();
  TextColumn get userId => text()();
  TextColumn get trackerId => text()();
  TextColumn get title => text().withDefault(const Constant(''))();
  RealColumn get value => real()();
  TextColumn get unit => text()();
  TextColumn get icon => text()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {appWidgetId};
}

@DriftDatabase(tables: [
  LocalTrackers,
  LocalTrackingLogs,
  LocalUserSettings,
  PendingSyncOperations,
  WidgetConfigurations,
])
final class AppDatabase extends _$AppDatabase {
  AppDatabase([QueryExecutor? executor])
      : super(executor ?? driftDatabase(name: 'vipro_multi_tracker'));

  @override
  int get schemaVersion => 1;

  Stream<List<LocalTracker>> watchTrackers(String userId) {
    final query = select(localTrackers)
      ..where((row) => row.userId.equals(userId) & row.deletedAt.isNull())
      ..orderBy([
        (row) => OrderingTerm.asc(row.sortOrder),
        (row) => OrderingTerm.asc(row.createdAt),
      ]);
    return query.watch();
  }

  Stream<List<LocalTrackingLog>> watchLogs(String userId) {
    final query = select(localTrackingLogs)
      ..where((row) => row.userId.equals(userId) & row.deletedAt.isNull())
      ..orderBy([(row) => OrderingTerm.desc(row.occurredAt)]);
    return query.watch();
  }

  Stream<LocalUserSetting?> watchSettings(String userId) {
    final query = select(localUserSettings)
      ..where((row) => row.userId.equals(userId));
    return query.watchSingleOrNull();
  }

  Stream<int> watchPendingCount(String userId) {
    final count = pendingSyncOperations.id.count();
    final query = selectOnly(pendingSyncOperations)
      ..addColumns([count])
      ..where(pendingSyncOperations.userId.equals(userId));
    return query.map((row) => row.read(count) ?? 0).watchSingle();
  }

  Future<void> writeTrackerAndOperation(
    LocalTrackersCompanion tracker,
    PendingSyncOperationsCompanion operation,
  ) => transaction(() async {
    await into(localTrackers).insertOnConflictUpdate(tracker);
    await compactAndInsert(operation);
  });

  Future<void> writeLogAndOperation(
    LocalTrackingLogsCompanion log,
    PendingSyncOperationsCompanion operation,
  ) => transaction(() async {
    await into(localTrackingLogs).insertOnConflictUpdate(log);
    await compactAndInsert(operation);
  });

  Future<void> writeSettingsAndOperation(
    LocalUserSettingsCompanion settings,
    PendingSyncOperationsCompanion operation,
  ) => transaction(() async {
    await into(localUserSettings).insertOnConflictUpdate(settings);
    await compactAndInsert(operation);
  });

  Future<void> markTrackerDeletedAndQueue(
    String userId,
    String trackerId,
    DateTime deletedAt,
    PendingSyncOperationsCompanion operation,
  ) => transaction(() async {
    await (update(localTrackers)
          ..where((row) => row.id.equals(trackerId) & row.userId.equals(userId)))
        .write(LocalTrackersCompanion(
      deletedAt: Value(deletedAt),
      updatedAt: Value(deletedAt),
      syncState: const Value('pending'),
    ));
    await compactAndInsert(operation);
  });

  Future<void> markLogDeletedAndQueue(
    String userId,
    String logId,
    DateTime deletedAt,
    PendingSyncOperationsCompanion operation,
  ) => transaction(() async {
    await (update(localTrackingLogs)
          ..where((row) => row.id.equals(logId) & row.userId.equals(userId)))
        .write(LocalTrackingLogsCompanion(
      deletedAt: Value(deletedAt),
      updatedAt: Value(deletedAt),
      syncState: const Value('pending'),
    ));
    await compactAndInsert(operation);
  });

  Future<void> compactAndInsert(PendingSyncOperationsCompanion operation) async {
    final userId = operation.userId.value;
    final entityId = operation.entityId.present ? operation.entityId.value : null;
    final type = operation.operationType.value;
    if (entityId != null) {
      await (delete(pendingSyncOperations)
            ..where((row) =>
                row.userId.equals(userId) & row.entityId.equals(entityId)))
          .go();
    } else if (type == 'saveSettings') {
      await (delete(pendingSyncOperations)
            ..where((row) => row.userId.equals(userId) &
                row.operationType.equals('saveSettings')))
          .go();
    }
    await into(pendingSyncOperations).insert(operation);
  }

  Future<List<PendingSyncOperation>> pendingForUser(String userId) {
    final query = select(pendingSyncOperations)
      ..where((row) => row.userId.equals(userId))
      ..orderBy([(row) => OrderingTerm.asc(row.createdAt)]);
    return query.get();
  }

  Future<void> removePending(String id) =>
      (delete(pendingSyncOperations)..where((row) => row.id.equals(id))).go();

  Future<void> failPending(String id, String error, {bool increment = true}) async {
    final current = await (select(pendingSyncOperations)
          ..where((row) => row.id.equals(id)))
        .getSingleOrNull();
    if (current == null) return;
    await (update(pendingSyncOperations)..where((row) => row.id.equals(id))).write(
      PendingSyncOperationsCompanion(
        retryCount: Value(current.retryCount + (increment ? 1 : 0)),
        lastError: Value(error),
      ),
    );
  }

  Future<void> replaceCloudSnapshot({
    required String userId,
    required Iterable<LocalTrackersCompanion> trackers,
    required Iterable<LocalTrackingLogsCompanion> logs,
    LocalUserSettingsCompanion? settings,
  }) => transaction(() async {
    await (delete(localTrackingLogs)..where((row) => row.userId.equals(userId))).go();
    await (delete(localTrackers)..where((row) => row.userId.equals(userId))).go();
    for (final tracker in trackers) {
      await into(localTrackers).insert(tracker);
    }
    for (final log in logs) {
      await into(localTrackingLogs).insert(log);
    }
    if (settings != null) {
      await into(localUserSettings).insertOnConflictUpdate(settings);
    }
  });
}
