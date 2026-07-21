// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/unbound-method */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type {
  AppState,
  OptionTracker,
  OptionTrackingLog,
  UnitTracker,
  UnitTrackingLog
} from '../../domain/models';
import { createDashboardController, type DashboardDependencies } from './index';

const NOW = new Date(2026, 6, 21, 12, 0, 0);

function tracker(overrides: Partial<UnitTracker> = {}): UnitTracker {
  return {
    id: 'water',
    name: 'Water',
    unit: 'glass',
    icon: '💧',
    color: '#2563eb',
    goal: 10,
    presets: [2, 5],
    inputType: 'unit',
    options: [],
    active: true,
    sortOrder: 0,
    createdAt: NOW.toISOString(),
    ...overrides
  };
}

function log(
  id: string,
  dayOffset: number,
  value: number,
  overrides: Partial<UnitTrackingLog> = {}
): UnitTrackingLog {
  const occurredAt = new Date(NOW);
  occurredAt.setDate(occurredAt.getDate() + dayOffset);
  occurredAt.setHours(11, 0, 0, 0);
  return {
    id,
    trackerId: 'water',
    value,
    recordType: 'unit',
    optionId: null,
    occurredAt: occurredAt.toISOString(),
    note: '',
    source: 'website',
    ...overrides
  };
}

function optionTracker(): OptionTracker {
  return {
    id: 'sleep-tracker',
    name: 'Sleep',
    icon: '☾',
    color: '#7c3aed',
    inputType: 'option',
    unit: null,
    goal: null,
    presets: [],
    options: [
      { id: 'sleep-id', label: 'Sleep', sortOrder: 0, createdAt: NOW.toISOString() },
      { id: 'wake-id', label: 'Wake', sortOrder: 1, createdAt: NOW.toISOString() }
    ],
    active: true,
    sortOrder: 1,
    createdAt: NOW.toISOString()
  };
}

function optionLog(
  id: string,
  dayOffset: number,
  optionId: string,
  hour: number
): OptionTrackingLog {
  const occurredAt = new Date(NOW);
  occurredAt.setDate(occurredAt.getDate() + dayOffset);
  occurredAt.setHours(hour, 0, 0, 0);
  return {
    id,
    trackerId: 'sleep-tracker',
    value: null,
    recordType: 'option',
    optionId,
    occurredAt: occurredAt.toISOString(),
    note: '',
    source: 'website'
  };
}

function state(overrides: Partial<AppState> = {}): AppState {
  return {
    version: 4,
    trackers: [tracker()],
    logs: [log('today-1', 0, 2), log('today-2', 0, 3), log('old', -6, 4)],
    settings: { theme: 'system', confirmDelete: true },
    ...overrides
  };
}

function installDom(): void {
  document.body.innerHTML = `
    <span id="statTodayEntries"></span>
    <span id="statTodayCaption"></span>
    <span id="statActiveTrackers"></span>
    <span id="statLastActivity"></span>
    <span id="statLastCaption"></span>
    <div id="dashboardTrackerGrid"></div>
    <div id="dashboardActivity"></div>
    <select id="dashboardChartTracker"></select>
    <div id="dashboardChart"></div>
  `;
}

function dependencies(): DashboardDependencies {
  return {
    addQuickLog: vi.fn().mockResolvedValue(undefined),
    addQuickOptionLog: vi.fn().mockResolvedValue(undefined),
    openCustomLog: vi.fn(),
    openTrackerEditor: vi.fn()
  };
}

describe('DashboardController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    installDom();
  });

  afterEach(() => vi.useRealTimers());

  test('renders statistics, recent activity, goal progress, quick values, and seven local days', () => {
    const controller = createDashboardController(dependencies());

    controller.render(state());

    expect(document.querySelector('#statTodayEntries')?.textContent).toBe('2');
    expect(document.querySelector('#statTodayCaption')?.textContent).toBe(
      '5 total value logged'
    );
    expect(document.querySelector('#statActiveTrackers')?.textContent).toBe('1');
    expect(document.querySelector('#statLastActivity')?.textContent).toBe('1h ago');
    expect(document.querySelector('#statLastCaption')?.textContent).toContain('Water ·');
    expect(document.querySelector('#dashboardActivity')?.textContent).toContain('+3 glass');
    expect(document.querySelector<HTMLElement>('.progress-fill')?.style.width).toBe('50%');
    expect(document.querySelector('#dashboardTrackerGrid')?.textContent).toContain('+2');
    expect(document.querySelector('#dashboardTrackerGrid')?.textContent).toContain('+5');
    const bars = [...document.querySelectorAll<HTMLElement>('#dashboardChart .bar')];
    expect(bars).toHaveLength(7);
    expect(bars[0]?.dataset.label).toBe('4 glass');
    expect(bars[6]?.dataset.label).toBe('5 glass');
  });

  test('delegates tracker card actions once and removes the listener on destroy', () => {
    const callbacks = dependencies();
    const controller = createDashboardController(callbacks);
    controller.render(state());
    controller.render(state());

    document.querySelector<HTMLButtonElement>('[data-quick-log]')?.click();
    document.querySelector<HTMLButtonElement>('[data-custom-log]')?.click();
    document.querySelector<HTMLButtonElement>('[data-edit-from-card]')?.click();

    expect(callbacks.addQuickLog).toHaveBeenCalledOnce();
    expect(callbacks.addQuickLog).toHaveBeenCalledWith('water', 2);
    expect(callbacks.openCustomLog).toHaveBeenCalledWith('water');
    expect(callbacks.openTrackerEditor).toHaveBeenCalledWith('water');

    controller.destroy();
    document.querySelector<HTMLButtonElement>('[data-quick-log]')?.click();
    expect(callbacks.addQuickLog).toHaveBeenCalledOnce();
  });

  test('renders option trackers with count metrics and delegates option quick actions', () => {
    const callbacks = dependencies();
    const controller = createDashboardController(callbacks);
    controller.render(state({
      trackers: [optionTracker()],
      logs: [
        optionLog('sleep-today', 0, 'sleep-id', 8),
        optionLog('wake-today', 0, 'wake-id', 11),
        optionLog('wake-old', -6, 'wake-id', 9)
      ]
    }));

    const grid = document.querySelector<HTMLElement>('#dashboardTrackerGrid');
    if (!grid) throw new Error('Missing tracker grid.');
    expect(grid.innerHTML).toContain('data-quick-option="sleep-tracker"');
    expect(grid.innerHTML).toContain('data-option-id="wake-id"');
    expect(grid.textContent).toContain('2 records today');
    expect(grid.textContent).toContain('Wake');
    expect(grid.innerHTML).not.toContain('progress-fill');
    expect(document.querySelector('#dashboardActivity')?.textContent).toContain('Wake');
    const bars = [...document.querySelectorAll<HTMLElement>('#dashboardChart .bar')];
    expect(bars[0]?.dataset.label).toBe('1 record');
    expect(bars[6]?.dataset.label).toBe('2 records');

    document.querySelector<HTMLButtonElement>('[data-option-id="wake-id"]')?.click();
    expect(callbacks.addQuickOptionLog).toHaveBeenCalledWith('sleep-tracker', 'wake-id');
  });

  test('renders the existing empty states without an active tracker or record', () => {
    const controller = createDashboardController(dependencies());

    controller.render(state({ trackers: [], logs: [] }));

    expect(document.querySelector('#dashboardTrackerGrid')?.textContent).toContain(
      'No active trackers'
    );
    expect(document.querySelector('#dashboardActivity')?.textContent).toContain(
      'No records yet'
    );
    expect(document.querySelector('#dashboardChart')?.textContent).toContain(
      'No chart available'
    );
  });
});
