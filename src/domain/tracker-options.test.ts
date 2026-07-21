import { describe, expect, it } from 'vitest';
import type { TrackerOption } from './models';
import {
  OptionValidationError,
  parseOptionLabels,
  reconcileTrackerOptions
} from './tracker-options';

const NOW = '2026-07-21T00:00:00.000Z';

describe('parseOptionLabels', () => {
  it('splits, trims, and removes empty option labels', () => {
    expect(parseOptionLabels(' Sleep, , Wake ,Go to bed,')).toEqual([
      'Sleep',
      'Wake',
      'Go to bed'
    ]);
  });

  it.each([
    ['', 'at least one'],
    ['One,Two,Three,Four,Five,Six,Seven,Eight,Nine', 'at most eight'],
    [`${'a'.repeat(81)},Short`, '80 characters'],
    ['Sleep,sLeEp', 'unique']
  ])('rejects invalid labels in %j', (raw, expectedMessage) => {
    expect(() => parseOptionLabels(raw)).toThrowError(OptionValidationError);
    expect(() => parseOptionLabels(raw)).toThrow(expectedMessage);
  });
});

describe('reconcileTrackerOptions', () => {
  it('preserves matching identities before reusing unmatched identities', () => {
    const existing: TrackerOption[] = [
      { id: 'sleep-id', label: 'Sleep', sortOrder: 0, createdAt: NOW },
      { id: 'wake-id', label: 'Wake', sortOrder: 1, createdAt: NOW }
    ];
    let nextId = 0;

    expect(reconcileTrackerOptions(
      existing,
      ['Wake', 'Go to bed'],
      () => `new-${nextId++}`,
      () => NOW
    )).toEqual([
      { id: 'wake-id', label: 'Wake', sortOrder: 0, createdAt: NOW },
      { id: 'sleep-id', label: 'Go to bed', sortOrder: 1, createdAt: NOW }
    ]);
  });

  it('matches case-insensitively and creates identities only for surplus labels', () => {
    const existing: TrackerOption[] = [
      { id: 'sleep-id', label: 'Sleep', sortOrder: 0, createdAt: 'created-before' }
    ];

    expect(reconcileTrackerOptions(
      existing,
      ['sleep', 'Wake'],
      () => 'wake-id',
      () => NOW
    )).toEqual([
      { id: 'sleep-id', label: 'sleep', sortOrder: 0, createdAt: 'created-before' },
      { id: 'wake-id', label: 'Wake', sortOrder: 1, createdAt: NOW }
    ]);
  });
});
