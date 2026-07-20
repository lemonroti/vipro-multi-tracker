import { describe, expect, it } from 'vitest';
import { csvEscape, escapeHtml, formatValue, pluralUnit } from './formatting';

describe('formatValue', () => {
  it('renders integers without decimal places', () => {
    expect(formatValue(2)).toBe('2');
    expect(formatValue(-0)).toBe('0');
  });

  it('renders non-integers with two decimal places', () => {
    expect(formatValue(2.5)).toBe('2.50');
    expect(formatValue(2.345)).toBe('2.35');
  });

  it('preserves legacy numeric coercion and non-finite output', () => {
    expect(formatValue('3')).toBe('3');
    expect(formatValue(null)).toBe('0');
    expect(formatValue(Number.NaN)).toBe('NaN');
    expect(formatValue(Number.POSITIVE_INFINITY)).toBe('Infinity');
  });
});

describe('pluralUnit', () => {
  it('singularizes and pluralizes minute', () => {
    expect(pluralUnit('minute', 1)).toBe('minute');
    expect(pluralUnit('minute', 2)).toBe('minutes');
  });

  it('supports legacy cigarette and time units case-insensitively', () => {
    expect(pluralUnit('Cigarette', '1')).toBe('cigarette');
    expect(pluralUnit('TIME', 0)).toBe('times');
  });

  it('returns unsupported units unchanged', () => {
    expect(pluralUnit('Sessions', 1)).toBe('Sessions');
  });
});

describe('csvEscape', () => {
  it('quotes fields containing commas', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('quotes fields containing line feeds or quotes and doubles quotes', () => {
    expect(csvEscape('a\nb')).toBe('"a\nb"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('preserves legacy null and carriage-return handling', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape('a\rb')).toBe('a\rb');
  });
});

describe('escapeHtml', () => {
  it('escapes HTML-sensitive characters', () => {
    expect(escapeHtml('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    expect(escapeHtml('&\'')).toBe('&amp;&#039;');
  });

  it('coerces primitive values and treats nullish values as empty', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('leaves ordinary text unchanged', () => {
    expect(escapeHtml('safe text')).toBe('safe text');
  });
});
