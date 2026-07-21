export type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return new Date(value instanceof Date ? value.getTime() : value);
}

export function localDateKey(date: DateInput = new Date()): string {
  const localDate = toDate(date);
  return `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
}

export function toLocalInputValue(date: DateInput): string {
  const localDate = toDate(date);
  return new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function formatDateTime(date: DateInput): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(toDate(date));
}

export function formatDateHeading(date: DateInput): string {
  const localDate = toDate(date);
  const key = localDateKey(localDate);
  if (key === localDateKey()) return 'Today';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === localDateKey(yesterday)) return 'Yesterday';

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(localDate);
}

export function timeAgo(date: DateInput): string {
  const seconds = Math.max(0, Math.floor((Date.now() - toDate(date).getTime()) / 1_000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
