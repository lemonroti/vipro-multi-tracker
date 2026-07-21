import 'dart:convert';

enum ThemePreference { system, light, dark }

enum EntitySyncState { synced, pending, failed }

enum PendingOperationType {
  upsertTracker,
  deleteTracker,
  upsertLog,
  deleteLog,
  saveSettings,
}

class TrackerModel {
  const TrackerModel({
    required this.id,
    required this.userId,
    required this.name,
    required this.unit,
    required this.icon,
    required this.color,
    required this.goal,
    required this.presets,
    required this.active,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
    required this.syncState,
    this.deletedAt,
  });

  final String id;
  final String userId;
  final String name;
  final String unit;
  final String icon;
  final String color;
  final double? goal;
  final List<double> presets;
  final bool active;
  final int sortOrder;
  final DateTime createdAt;
  final DateTime updatedAt;
  final EntitySyncState syncState;
  final DateTime? deletedAt;

  TrackerModel copyWith({
    String? name,
    String? unit,
    String? icon,
    String? color,
    double? goal,
    bool clearGoal = false,
    List<double>? presets,
    bool? active,
    int? sortOrder,
    DateTime? updatedAt,
    EntitySyncState? syncState,
    DateTime? deletedAt,
    bool clearDeletedAt = false,
  }) => TrackerModel(
    id: id,
    userId: userId,
    name: name ?? this.name,
    unit: unit ?? this.unit,
    icon: icon ?? this.icon,
    color: color ?? this.color,
    goal: clearGoal ? null : (goal ?? this.goal),
    presets: presets ?? this.presets,
    active: active ?? this.active,
    sortOrder: sortOrder ?? this.sortOrder,
    createdAt: createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
    syncState: syncState ?? this.syncState,
    deletedAt: clearDeletedAt ? null : (deletedAt ?? this.deletedAt),
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'userId': userId,
    'name': name,
    'unit': unit,
    'icon': icon,
    'color': color,
    'goal': goal,
    'presets': presets,
    'active': active,
    'sortOrder': sortOrder,
    'createdAt': createdAt.toIso8601String(),
    'updatedAt': updatedAt.toIso8601String(),
    'syncState': syncState.name,
    'deletedAt': deletedAt?.toIso8601String(),
  };

  factory TrackerModel.fromJson(Map<String, dynamic> json) => TrackerModel(
    id: json['id'] as String,
    userId: json['userId'] as String,
    name: json['name'] as String,
    unit: json['unit'] as String,
    icon: json['icon'] as String,
    color: json['color'] as String,
    goal: (json['goal'] as num?)?.toDouble(),
    presets: (json['presets'] as List)
        .map((value) => (value as num).toDouble())
        .toList(),
    active: json['active'] as bool,
    sortOrder: json['sortOrder'] as int,
    createdAt: DateTime.parse(json['createdAt'] as String),
    updatedAt: DateTime.parse(json['updatedAt'] as String),
    syncState: EntitySyncState.values.byName(json['syncState'] as String),
    deletedAt: json['deletedAt'] == null
        ? null
        : DateTime.parse(json['deletedAt'] as String),
  );
}

class TrackingLogModel {
  const TrackingLogModel({
    required this.id,
    required this.userId,
    required this.trackerId,
    required this.value,
    required this.occurredAt,
    required this.note,
    required this.source,
    required this.updatedAt,
    required this.syncState,
    this.deletedAt,
  });

  final String id;
  final String userId;
  final String trackerId;
  final double value;
  final DateTime occurredAt;
  final String note;
  final String source;
  final DateTime updatedAt;
  final EntitySyncState syncState;
  final DateTime? deletedAt;

  TrackingLogModel copyWith({
    double? value,
    DateTime? occurredAt,
    String? note,
    String? source,
    DateTime? updatedAt,
    EntitySyncState? syncState,
    DateTime? deletedAt,
    bool clearDeletedAt = false,
  }) => TrackingLogModel(
    id: id,
    userId: userId,
    trackerId: trackerId,
    value: value ?? this.value,
    occurredAt: occurredAt ?? this.occurredAt,
    note: note ?? this.note,
    source: source ?? this.source,
    updatedAt: updatedAt ?? this.updatedAt,
    syncState: syncState ?? this.syncState,
    deletedAt: clearDeletedAt ? null : (deletedAt ?? this.deletedAt),
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'userId': userId,
    'trackerId': trackerId,
    'value': value,
    'occurredAt': occurredAt.toIso8601String(),
    'note': note,
    'source': source,
    'updatedAt': updatedAt.toIso8601String(),
    'syncState': syncState.name,
    'deletedAt': deletedAt?.toIso8601String(),
  };

  factory TrackingLogModel.fromJson(Map<String, dynamic> json) =>
      TrackingLogModel(
        id: json['id'] as String,
        userId: json['userId'] as String,
        trackerId: json['trackerId'] as String,
        value: (json['value'] as num).toDouble(),
        occurredAt: DateTime.parse(json['occurredAt'] as String),
        note: json['note'] as String? ?? '',
        source: json['source'] as String? ?? 'android',
        updatedAt: DateTime.parse(json['updatedAt'] as String),
        syncState: EntitySyncState.values.byName(json['syncState'] as String),
        deletedAt: json['deletedAt'] == null
            ? null
            : DateTime.parse(json['deletedAt'] as String),
      );
}

class UserSettingsModel {
  const UserSettingsModel({
    required this.userId,
    required this.theme,
    required this.confirmDelete,
    required this.updatedAt,
    required this.syncState,
  });

  final String userId;
  final ThemePreference theme;
  final bool confirmDelete;
  final DateTime updatedAt;
  final EntitySyncState syncState;

  UserSettingsModel copyWith({
    ThemePreference? theme,
    bool? confirmDelete,
    DateTime? updatedAt,
    EntitySyncState? syncState,
  }) => UserSettingsModel(
    userId: userId,
    theme: theme ?? this.theme,
    confirmDelete: confirmDelete ?? this.confirmDelete,
    updatedAt: updatedAt ?? this.updatedAt,
    syncState: syncState ?? this.syncState,
  );

  Map<String, Object?> toJson() => {
    'userId': userId,
    'theme': theme.name,
    'confirmDelete': confirmDelete,
    'updatedAt': updatedAt.toIso8601String(),
    'syncState': syncState.name,
  };
}

class PendingOperation {
  const PendingOperation({
    required this.id,
    required this.userId,
    required this.type,
    required this.entityId,
    required this.payload,
    required this.createdAt,
    this.retryCount = 0,
    this.lastError,
  });

  final String id;
  final String userId;
  final PendingOperationType type;
  final String? entityId;
  final Map<String, Object?> payload;
  final DateTime createdAt;
  final int retryCount;
  final String? lastError;

  String encodePayload() => jsonEncode(payload);
}

class TrackerInput {
  const TrackerInput({
    required this.name,
    required this.unit,
    required this.icon,
    required this.color,
    required this.goal,
    required this.presets,
    required this.active,
  });

  final String name;
  final String unit;
  final String icon;
  final String color;
  final double? goal;
  final List<double> presets;
  final bool active;
}

class LogInput {
  const LogInput({
    required this.trackerId,
    required this.value,
    required this.occurredAt,
    required this.note,
  });

  final String trackerId;
  final double value;
  final DateTime occurredAt;
  final String note;
}

TrackerInput validateTrackerInput(TrackerInput input) {
  final name = input.name.trim();
  final unit = input.unit.trim();
  final icon = input.icon.trim();
  final presets =
      input.presets
          .where((value) => value.isFinite && value > 0)
          .toSet()
          .toList()
        ..sort();
  if (name.isEmpty || name.length > 80) {
    throw const FormatException('Tracker name must contain 1–80 characters.');
  }
  if (unit.isEmpty || unit.length > 30) {
    throw const FormatException('Unit must contain 1–30 characters.');
  }
  if (icon.isEmpty || icon.runes.length > 8) {
    throw const FormatException('Icon must contain 1–8 characters.');
  }
  if (presets.isEmpty) {
    throw const FormatException('Add at least one positive quick value.');
  }
  if (input.goal != null && (!input.goal!.isFinite || input.goal! <= 0)) {
    throw const FormatException('Daily goal must be positive.');
  }
  return TrackerInput(
    name: name,
    unit: unit,
    icon: icon,
    color: input.color,
    goal: input.goal,
    presets: presets,
    active: input.active,
  );
}

LogInput validateLogInput(LogInput input) {
  if (!input.value.isFinite || input.value <= 0) {
    throw const FormatException('Value must be positive.');
  }
  final note = input.note.trim();
  if (note.length > 500) {
    throw const FormatException('Note cannot exceed 500 characters.');
  }
  return LogInput(
    trackerId: input.trackerId,
    value: input.value,
    occurredAt: input.occurredAt,
    note: note,
  );
}
