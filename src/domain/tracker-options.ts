import type { TrackerOption } from './models';

const MAX_OPTIONS = 8;
const MAX_LABEL_LENGTH = 80;

export class OptionValidationError extends Error {}

export function parseOptionLabels(raw: string): string[] {
  const labels = raw
    .split(',')
    .map(label => label.trim())
    .filter(label => label.length > 0);

  if (labels.length === 0) {
    throw new OptionValidationError('Enter at least one option.');
  }
  if (labels.length > MAX_OPTIONS) {
    throw new OptionValidationError('Enter at most eight options.');
  }
  if (labels.some(label => label.length > MAX_LABEL_LENGTH)) {
    throw new OptionValidationError('Option labels must be 80 characters or fewer.');
  }

  const normalized = labels.map(label => label.toLowerCase());
  if (new Set(normalized).size !== labels.length) {
    throw new OptionValidationError('Option labels must be unique.');
  }

  return labels;
}

export function reconcileTrackerOptions(
  existing: TrackerOption[],
  labels: string[],
  createId: () => string,
  now: () => string
): TrackerOption[] {
  const existingByLabel = new Map(
    existing.map(option => [option.label.toLowerCase(), option])
  );
  const matchedIds = new Set(
    labels
      .map(label => existingByLabel.get(label.toLowerCase())?.id)
      .filter((id): id is string => id !== undefined)
  );
  const unmatched = existing.filter(option => !matchedIds.has(option.id));

  return labels.map((label, sortOrder) => {
    const matched = existingByLabel.get(label.toLowerCase());
    const reused = matched ?? unmatched.shift();

    return {
      id: reused?.id ?? createId(),
      label,
      sortOrder,
      createdAt: reused?.createdAt ?? now()
    };
  });
}
