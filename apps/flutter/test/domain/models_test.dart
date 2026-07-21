import 'package:flutter_test/flutter_test.dart';
import 'package:vipro_multi_tracker/domain/models.dart';

void main() {
  test('tracker validation trims and compacts presets', () {
    final input = validateTrackerInput(const TrackerInput(
      name: ' Water ',
      unit: ' ml ',
      icon: '💧',
      color: '#2563eb',
      goal: 2000,
      presets: [250, 250, 500],
      active: true,
    ));
    expect(input.name, 'Water');
    expect(input.presets, [250, 500]);
  });

  test('tracker validation rejects empty names', () {
    expect(
      () => validateTrackerInput(const TrackerInput(
        name: ' ',
        unit: 'count',
        icon: '✓',
        color: '#334155',
        goal: null,
        presets: [1],
        active: true,
      )),
      throwsFormatException,
    );
  });

  test('log validation rejects non-positive values and long notes', () {
    expect(
      () => validateLogInput(LogInput(
        trackerId: 't',
        value: 0,
        occurredAt: DateTime.now(),
        note: '',
      )),
      throwsFormatException,
    );
    expect(
      () => validateLogInput(LogInput(
        trackerId: 't',
        value: 1,
        occurredAt: DateTime.now(),
        note: List.filled(501, 'x').join(),
      )),
      throwsFormatException,
    );
  });
}
