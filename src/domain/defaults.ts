import type { Tracker } from './models';

export function makeDefaultTrackers(
  createId: () => string,
  now: () => string
): Tracker[] {
  const createdAt = now();
  return [
    {
      id: createId(), name: 'Smoking', unit: 'cigarette', icon: '🚬',
      color: '#334155', goal: 8, presets: [1], active: true,
      sortOrder: 0, createdAt, inputType: 'unit', options: []
    },
    {
      id: createId(), name: '觀世音菩薩聖號', unit: 'minute', icon: '🙏',
      color: '#6d4aff', goal: 30, presets: [5, 10, 15], active: true,
      sortOrder: 1, createdAt, inputType: 'unit', options: []
    }
  ];
}
