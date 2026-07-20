import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatDateHeading,
  formatDateTime,
  localDateKey,
  timeAgo,
  toLocalInputValue
} from './dates';

afterEach(() => {
  vi.useRealTimers();
});

describe('localDateKey', () => {
  it('formats a local calendar date with zero-padded month and day', () => {
    expect(localDateKey(new Date(2026, 6, 21, 23, 30))).toBe('2026-07-21');
    expect(localDateKey(new Date(2026, 0, 2, 0, 0))).toBe('2026-01-02');
  });

  it('uses the current local calendar date when omitted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 21, 23, 30));

    expect(localDateKey()).toBe('2026-07-21');
  });

  it('preserves the legacy invalid-date key', () => {
    expect(localDateKey('not-a-date')).toBe('NaN-NaN-NaN');
  });
});

describe('toLocalInputValue', () => {
  it('formats local date and time for a datetime-local input', () => {
    expect(toLocalInputValue(new Date(2026, 6, 21, 23, 30, 45)))
      .toBe('2026-07-21T23:30');
  });

  it('throws for an invalid date', () => {
    expect(() => toLocalInputValue('not-a-date')).toThrow(RangeError);
  });
});

describe('formatDateTime', () => {
  it('uses the legacy localized date and time fields', () => {
    const date = new Date(2026, 6, 21, 23, 30);
    const expected = new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);

    expect(formatDateTime(date)).toBe(expected);
  });

  it('throws for an invalid date', () => {
    expect(() => formatDateTime('not-a-date')).toThrow(RangeError);
  });
});

describe('formatDateHeading', () => {
  it('labels the current local date as Today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 1));

    expect(formatDateHeading(new Date(2026, 0, 1, 23, 59))).toBe('Today');
  });

  it('labels the previous local date as Yesterday across a year boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 1));

    expect(formatDateHeading(new Date(2025, 11, 31, 23, 59))).toBe('Yesterday');
  });

  it('formats older dates with the legacy localized heading fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 21, 12));
    const date = new Date(2026, 6, 19, 12);
    const expected = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);

    expect(formatDateHeading(date)).toBe(expected);
  });

  it('throws for an invalid date', () => {
    expect(() => formatDateHeading('not-a-date')).toThrow(RangeError);
  });
});

describe('timeAgo', () => {
  it.each([
    ['a future date', 1_000, 'just now'],
    ['nine seconds', -9_000, 'just now'],
    ['ten seconds', -10_000, '10s ago'],
    ['fifty-nine seconds', -59_000, '59s ago'],
    ['one minute', -60_000, '1m ago'],
    ['fifty-nine minutes', -3_599_000, '59m ago'],
    ['one hour', -3_600_000, '1h ago'],
    ['twenty-three hours', -86_399_000, '23h ago'],
    ['one day', -86_400_000, '1d ago']
  ])('formats %s at the legacy threshold', (_label, offset, expected) => {
    vi.useFakeTimers();
    const now = new Date(2026, 6, 21, 12).getTime();
    vi.setSystemTime(now);

    expect(timeAgo(new Date(now + offset))).toBe(expected);
  });

  it('preserves the legacy invalid-date result', () => {
    expect(timeAgo('not-a-date')).toBe('NaNd ago');
  });
});
