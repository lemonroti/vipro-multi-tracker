import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vipro_multi_tracker/database/app_database.dart';

void main() {
  late AppDatabase database;

  setUp(() {
    database = AppDatabase(NativeDatabase.memory());
  });

  tearDown(() => database.close());

  test('tracker streams are isolated by user', () async {
    final now = DateTime.utc(2026, 7, 21);
    await database
        .into(database.localTrackers)
        .insert(
          LocalTrackersCompanion.insert(
            id: 'a',
            userId: 'user-a',
            name: 'A',
            unit: 'count',
            icon: 'A',
            color: '#000000',
            presetsJson: '[1]',
            createdAt: now,
            updatedAt: now,
            syncState: 'synced',
          ),
        );
    await database
        .into(database.localTrackers)
        .insert(
          LocalTrackersCompanion.insert(
            id: 'b',
            userId: 'user-b',
            name: 'B',
            unit: 'count',
            icon: 'B',
            color: '#000000',
            presetsJson: '[1]',
            createdAt: now,
            updatedAt: now,
            syncState: 'synced',
          ),
        );
    final rows = await database.watchTrackers('user-a').first;
    expect(rows.map((row) => row.id), ['a']);
  });

  test('entity and pending operation are atomic', () async {
    final now = DateTime.utc(2026, 7, 21);
    await database.writeTrackerAndOperation(
      LocalTrackersCompanion.insert(
        id: 'a',
        userId: 'user-a',
        name: 'A',
        unit: 'count',
        icon: 'A',
        color: '#000000',
        presetsJson: '[1]',
        createdAt: now,
        updatedAt: now,
        syncState: 'pending',
      ),
      PendingSyncOperationsCompanion.insert(
        id: 'op-a',
        userId: 'user-a',
        operationType: 'upsertTracker',
        payloadJson: '{}',
        createdAt: now,
        entityId: const Value('a'),
      ),
    );
    expect(await database.watchTrackers('user-a').first, hasLength(1));
    expect(await database.pendingForUser('user-a'), hasLength(1));
  });
}
