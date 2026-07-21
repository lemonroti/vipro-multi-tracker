type Formattable = string | number | boolean | bigint | null | undefined;

export function pluralUnit(unit: string, value: unknown): string {
  const lower = unit.toLowerCase();
  if (lower === 'minute') return Number(value) === 1 ? 'minute' : 'minutes';
  if (lower === 'cigarette') return Number(value) === 1 ? 'cigarette' : 'cigarettes';
  if (lower === 'time') return Number(value) === 1 ? 'time' : 'times';
  return unit;
}

export function formatValue(value: unknown): string {
  const numericValue = Number(value);
  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(2).replace(/\.00$/, '');
}

export function csvEscape(value: Formattable): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function escapeHtml(value: Formattable): string {
  return String(value ?? '').replace(
    /[&<>'"]/g,
    character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#039;',
      '"': '&quot;'
    })[character] ?? character
  );
}
