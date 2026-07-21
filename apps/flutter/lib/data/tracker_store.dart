import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../database/app_database.dart';
import '../domain/models.dart';

class TrackerStore {
  TrackerStore({
    required this.database,
    required this.client,
    required this.userId,
    Uuid? uuid,
    DateTime Function()? clock,
  }) : _uuid = uuid ?? const Uuid(),
       _clock = clock ?? DateTime.now;

  final AppDatabase database;
  final SupabaseClient client;
  final String userId;
  final Uuid _uuid;
  final DateTime Function() _clock;
  Future<void>? _syncing;

  Stream<List<LocalTracker>> get trackers => database.watchTrackers(userId);
  Stream<List<LocalTrackingLog>> get logs => database.watchLogs(userId);
  Stream<LocalUserSetting?> get settings => database.watchSettings(userId);
  Stream<int> get pendingCount => database.watchPendingCount(userId);

  Future<void> initialize() async {
    final now = _clock().toUtc();
    final existing = await (database.select(
      database.localUserSettings,
    )..where((row) => row.userId.equals(userId))).getSingleOrNull();
    if (existing == null) {
      await database
          .into(database.localUserSettings)
          .insert(
            LocalUserSettingsCompanion.insert(
              userId: userId,
              updatedAt: now,
              syncState: 'synced',
            ),
          );
    }
    await sync();
  }

  Future<void> createTracker(TrackerInput raw) async {
    final input = validateTrackerInput(raw);
    final now = _clock().toUtc();
    final id = _uuid.v4();
    final tracker = TrackerModel(
      id: id,
      userId: userId,
      name: input.name,
      unit: input.unit,
      icon: input.icon,
      color: input.color,
      goal: input.goal,
      presets: input.presets,
      active: input.active,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      syncState: EntitySyncState.pending,
    );
    await database.writeTrackerAndOperation(
      _trackerCompanion(tracker),
      _operation(PendingOperationType.upsertTracker, id, tracker.toJson()),
    );
    unawaited(sync());
  }

  Future<void> updateTracker(LocalTracker current, TrackerInput raw) async {
    final input = validateTrackerInput(raw);
    final now = _clock().toUtc();
    final tracker = TrackerModel(
      id: current.id,
      userId: userId,
      name: input.name,
      unit: input.unit,
      icon: input.icon,
      color: input.color,
      goal: input.goal,
      presets: input.presets,
      active: input.active,
      sortOrder: current.sortOrder,
      createdAt: current.createdAt,
      updatedAt: now,
      syncState: EntitySyncState.pending,
    );
    await database.writeTrackerAndOperation(
      _trackerCompanion(tracker),
      _operation(
        PendingOperationType.upsertTracker,
        current.id,
        tracker.toJson(),
      ),
    );
    unawaited(sync());
  }

  Future<void> deleteTracker(LocalTracker tracker) async {
    final now = _clock().toUtc();
    await database.markTrackerDeletedAndQueue(
      userId,
      tracker.id,
      now,
      _operation(PendingOperationType.deleteTracker, tracker.id, {
        'id': tracker.id,
        'userId': userId,
      }),
    );
    unawaited(sync());
  }

  Future<void> addLog({
    required String trackerId,
    required double value,
    required DateTime occurredAt,
    String note = '',
    String source = 'android',
  }) async {
    final input = validateLogInput(
      LogInput(
        trackerId: trackerId,
        value: value,
        occurredAt: occurredAt,
        note: note,
      ),
    );
    final now = _clock().toUtc();
    final id = _uuid.v4();
    final log = TrackingLogModel(
      id: id,
      userId: userId,
      trackerId: input.trackerId,
      value: input.value,
      occurredAt: input.occurredAt.toUtc(),
      note: input.note,
      source: source,
      updatedAt: now,
      syncState: EntitySyncState.pending,
    );
    await database.writeLogAndOperation(
      _logCompanion(log),
      _operation(PendingOperationType.upsertLog, id, log.toJson()),
    );
    unawaited(sync());
  }

  Future<void> updateLog(
    LocalTrackingLog current, {
    required double value,
    required DateTime occurredAt,
    required String note,
  }) async {
    final input = validateLogInput(
      LogInput(
        trackerId: current.trackerId,
        value: value,
        occurredAt: occurredAt,
        note: note,
      ),
    );
    final now = _clock().toUtc();
    final log = TrackingLogModel(
      id: current.id,
      userId: userId,
      trackerId: current.trackerId,
      value: input.value,
      occurredAt: input.occurredAt.toUtc(),
      note: input.note,
      source: current.source,
      updatedAt: now,
      syncState: EntitySyncState.pending,
    );
    await database.writeLogAndOperation(
      _logCompanion(log),
      _operation(PendingOperationType.upsertLog, current.id, log.toJson()),
    );
    unawaited(sync());
  }

  Future<void> deleteLog(LocalTrackingLog log) async {
    final now = _clock().toUtc();
    await database.markLogDeletedAndQueue(
      userId,
      log.id,
      now,
      _operation(PendingOperationType.deleteLog, log.id, {
        'id': log.id,
        'userId': userId,
      }),
    );
    unawaited(sync());
  }

  Future<void> saveTheme(String theme) async {
    final now = _clock().toUtc();
    final companion = LocalUserSettingsCompanion(
      userId: Value(userId),
      theme: Value(theme),
      confirmDelete: const Value(true),
      updatedAt: Value(now),
      syncState: const Value('pending'),
    );
    await database.writeSettingsAndOperation(
      companion,
      _operation(PendingOperationType.saveSettings, null, {
        'userId': userId,
        'theme': theme,
        'confirmDelete': true,
        'updatedAt': now.toIso8601String(),
      }),
    );
    unawaited(sync());
  }

  Future<void> sync() {
    final current = _syncing;
    if (current != null) return current;
    final future = _performSync().whenComplete(() => _syncing = null);
    _syncing = future;
    return future;
  }

  Future<void> _performSync() async {
    final operations = await database.pendingForUser(userId);
    for (final operation in operations) {
      try {
        await _push(operation);
        await database.removePending(operation.id);
      } on PostgrestException catch (error) {
        await database.failPending(operation.id, error.message);
        return;
      } catch (error) {
        await database.failPending(operation.id, error.toString());
        return;
      }
    }
    await _pull();
  }

  Future<void> _push(PendingSyncOperation operation) async {
    final payload = jsonDecode(operation.payloadJson) as Map<String, dynamic>;
    switch (operation.operationType) {
      case 'upsertTracker':
        await client.from('trackers').upsert(_trackerCloud(payload));
      case 'deleteTracker':
        await client
            .from('trackers')
            .delete()
            .eq('id', operation.entityId!)
            .eq('user_id', userId);
      case 'upsertLog':
        await client.from('tracking_logs').upsert(_logCloud(payload));
      case 'deleteLog':
        await client
            .from('tracking_logs')
            .delete()
            .eq('id', operation.entityId!)
            .eq('user_id', userId);
      case 'saveSettings':
        await client.from('user_settings').upsert({
          'user_id': userId,
          'theme': payload['theme'],
          'preferences': {'confirmDelete': payload['confirmDelete'] ?? true},
          'dashboard_layout': <String, dynamic>{},
        });
    }
  }

  Future<void> _pull() async {
    final trackerRows = await client
        .from('trackers')
        .select()
        .eq('user_id', userId)
        .order('sort_order');
    final logRows = await client
        .from('tracking_logs')
        .select()
        .eq('user_id', userId)
        .order('occurred_at', ascending: false);
    final settingsRow = await client
        .from('user_settings')
        .select()
        .eq('user_id', userId)
        .maybeSingle();
    final trackers = (trackerRows as List).cast<Map<String, dynamic>>().map(
      _trackerFromCloud,
    );
    final logs = (logRows as List).cast<Map<String, dynamic>>().map(
      _logFromCloud,
    );
    LocalUserSettingsCompanion? settings;
    if (settingsRow != null) {
      final preferences =
          settingsRow['preferences'] as Map<String, dynamic>? ?? const {};
      settings = LocalUserSettingsCompanion(
        userId: Value(userId),
        theme: Value(settingsRow['theme'] as String? ?? 'system'),
        confirmDelete: Value(preferences['confirmDelete'] as bool? ?? true),
        updatedAt: Value(
          DateTime.parse(settingsRow['updated_at'] as String).toUtc(),
        ),
        syncState: const Value('synced'),
      );
    }
    await database.replaceCloudSnapshot(
      userId: userId,
      trackers: trackers,
      logs: logs,
      settings: settings,
    );
  }

  PendingSyncOperationsCompanion _operation(
    PendingOperationType type,
    String? entityId,
    Map<String, Object?> payload,
  ) => PendingSyncOperationsCompanion.insert(
    id: _uuid.v4(),
    userId: userId,
    operationType: type.name,
    entityId: Value(entityId),
    payloadJson: jsonEncode(payload),
    createdAt: _clock().toUtc(),
  );

  LocalTrackersCompanion _trackerCompanion(TrackerModel tracker) =>
      LocalTrackersCompanion(
        id: Value(tracker.id),
        userId: Value(tracker.userId),
        name: Value(tracker.name),
        unit: Value(tracker.unit),
        icon: Value(tracker.icon),
        color: Value(tracker.color),
        goal: Value(tracker.goal),
        presetsJson: Value(jsonEncode(tracker.presets)),
        active: Value(tracker.active),
        sortOrder: Value(tracker.sortOrder),
        createdAt: Value(tracker.createdAt),
        updatedAt: Value(tracker.updatedAt),
        syncState: Value(tracker.syncState.name),
        deletedAt: Value(tracker.deletedAt),
      );

  LocalTrackingLogsCompanion _logCompanion(TrackingLogModel log) =>
      LocalTrackingLogsCompanion(
        id: Value(log.id),
        userId: Value(log.userId),
        trackerId: Value(log.trackerId),
        value: Value(log.value),
        occurredAt: Value(log.occurredAt),
        note: Value(log.note),
        source: Value(log.source),
        updatedAt: Value(log.updatedAt),
        syncState: Value(log.syncState.name),
        deletedAt: Value(log.deletedAt),
      );

  LocalTrackersCompanion _trackerFromCloud(Map<String, dynamic> row) =>
      LocalTrackersCompanion(
        id: Value(row['id'] as String),
        userId: Value(userId),
        name: Value(row['name'] as String),
        unit: Value(row['unit'] as String),
        icon: Value(row['icon'] as String),
        color: Value(row['color'] as String),
        goal: Value((row['daily_goal'] as num?)?.toDouble()),
        presetsJson: Value(
          jsonEncode(
            (row['quick_values'] as List? ?? const [1])
                .map((value) => (value as num).toDouble())
                .toList(),
          ),
        ),
        active: Value(row['is_active'] as bool? ?? true),
        sortOrder: Value(row['sort_order'] as int? ?? 0),
        createdAt: Value(DateTime.parse(row['created_at'] as String).toUtc()),
        updatedAt: Value(DateTime.parse(row['updated_at'] as String).toUtc()),
        syncState: const Value('synced'),
        deletedAt: const Value(null),
      );

  LocalTrackingLogsCompanion _logFromCloud(Map<String, dynamic> row) =>
      LocalTrackingLogsCompanion(
        id: Value(row['id'] as String),
        userId: Value(userId),
        trackerId: Value(row['tracker_id'] as String),
        value: Value((row['value'] as num).toDouble()),
        occurredAt: Value(DateTime.parse(row['occurred_at'] as String).toUtc()),
        note: Value(row['note'] as String? ?? ''),
        source: Value(row['source'] as String? ?? 'android'),
        updatedAt: Value(DateTime.parse(row['updated_at'] as String).toUtc()),
        syncState: const Value('synced'),
        deletedAt: const Value(null),
      );

  Map<String, dynamic> _trackerCloud(Map<String, dynamic> item) => {
    'id': item['id'],
    'user_id': userId,
    'name': item['name'],
    'unit': item['unit'],
    'icon': item['icon'],
    'color': item['color'],
    'daily_goal': item['goal'],
    'quick_values': item['presets'],
    'is_active': item['active'],
    'sort_order': item['sortOrder'],
  };

  Map<String, dynamic> _logCloud(Map<String, dynamic> item) => {
    'id': item['id'],
    'user_id': userId,
    'tracker_id': item['trackerId'],
    'value': item['value'],
    'occurred_at': item['occurredAt'],
    'note': (item['note'] as String).isEmpty ? null : item['note'],
    'source': item['source'],
    'client_id': item['id'],
  };
}
