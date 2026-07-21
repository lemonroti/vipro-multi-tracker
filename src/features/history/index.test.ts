// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/unbound-method */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AppState, UnitTracker, UnitTrackingLog } from '../../domain/models';
import {
  createHistoryController,
  filterHistoryLogs,
  type HistoryDependencies
} from './index';

const JULY_21 = new Date(2026, 6, 21, 12, 0, 0);
const JULY_20 = new Date(2026, 6, 20, 12, 0, 0);

function tracker(id: string, name: string): UnitTracker {
  return {
    id,
    name,
    unit: 'time',
    icon: '✦',
    color: '#334155',
    goal: null,
    presets: [1],
    inputType: 'unit',
    options: [],
    active: true,
    sortOrder: 0,
    createdAt: JULY_20.toISOString()
  };
}

function log(
  id: string,
  trackerId: string,
  occurredAt: Date,
  note: string,
  value = 1
): UnitTrackingLog {
  return {
    id,
    trackerId,
    value,
    recordType: 'unit',
    optionId: null,
    occurredAt: occurredAt.toISOString(),
    note,
    source: 'website'
  };
}

function state(): AppState {
  return {
    version: 4,
    trackers: [tracker('alpha', 'Alpha <script>'), tracker('beta', 'Beta')],
    logs: [
      log('today-alpha', 'alpha', JULY_21, '<img onerror=alert(1)> hello', 2),
      log('today-beta', 'beta', new Date(2026, 6, 21, 10), 'meeting', 3),
      log('yesterday-alpha', 'alpha', JULY_20, 'older note', 4)
    ],
    settings: { theme: 'system', confirmDelete: true }
  };
}

function installDom(): void {
  document.body.innerHTML = `
    <select id="historyTracker"></select>
    <input id="historyDate" type="date" />
    <input id="historySearch" />
    <div id="historySummary"></div>
    <div id="historyGroups"></div>
  `;
}

function dependencies(): HistoryDependencies {
  return {
    openLogEditor: vi.fn(),
    deleteLog: vi.fn().mockResolvedValue(undefined)
  };
}

describe('filterHistoryLogs', () => {
  test('filters newest-first by tracker, local date, and tracker or note search', () => {
    const snapshot = state();

    expect(filterHistoryLogs(snapshot, {
      trackerId: 'alpha',
      date: '2026-07-21',
      search: 'HELLO'
    }).map(candidate => candidate.id)).toEqual(['today-alpha']);

    expect(filterHistoryLogs(snapshot, {
      trackerId: 'all',
      date: '',
      search: 'beta'
    }).map(candidate => candidate.id)).toEqual(['today-beta']);
  });
});

describe('HistoryController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(JULY_21);
    installDom();
  });

  afterEach(() => vi.useRealTimers());

  test('renders filter options, summaries, local-date groups, and escaped user text', () => {
    const controller = createHistoryController(dependencies());

    controller.render(state());

    expect(document.querySelector('#historyTracker')?.textContent).toContain('All trackers');
    expect(document.querySelector('#historyTracker')?.textContent).toContain('Alpha <script>');
    expect(document.querySelector('#historySummary')?.textContent).toContain('3 records');
    expect(document.querySelector('#historySummary')?.textContent).toContain('9 combined value');
    expect(document.querySelectorAll('.history-date')).toHaveLength(2);
    expect(document.querySelector('#historyGroups')?.textContent).toContain('Today');
    expect(document.querySelector('#historyGroups')?.textContent).toContain('Yesterday');
    expect(document.querySelector('#historyGroups script')).toBeNull();
    expect(document.querySelector('#historyGroups img')).toBeNull();
    expect(document.querySelector('#historyGroups')?.innerHTML).toContain(
      'Alpha &lt;script&gt;'
    );
    expect(document.querySelector('#historyGroups')?.innerHTML).toContain(
      '&lt;img onerror=alert(1)&gt; hello'
    );
  });

  test('renders explicit accessible labels for record actions', () => {
    const controller = createHistoryController(dependencies());

    controller.render(state());

    expect(
      document.querySelector<HTMLButtonElement>('[data-edit-log]')?.getAttribute('aria-label')
    ).toBe('Edit record');
    expect(
      document.querySelector<HTMLButtonElement>('[data-delete-log]')?.getAttribute('aria-label')
    ).toBe('Delete record');
  });

  test('reacts to all three filters while preserving their selected values', () => {
    const controller = createHistoryController(dependencies());
    controller.render(state());
    const trackerSelect = document.querySelector<HTMLSelectElement>('#historyTracker');
    const dateInput = document.querySelector<HTMLInputElement>('#historyDate');
    const searchInput = document.querySelector<HTMLInputElement>('#historySearch');
    if (!trackerSelect || !dateInput || !searchInput) throw new Error('Missing filters.');

    trackerSelect.value = 'alpha';
    trackerSelect.dispatchEvent(new Event('change', { bubbles: true }));
    dateInput.value = '2026-07-21';
    dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    searchInput.value = 'hello';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelector('#historySummary')?.textContent).toContain('1 record');
    expect(document.querySelector('#historyGroups')?.textContent).toContain('hello');
    expect(document.querySelector('#historyGroups')?.textContent).not.toContain('older note');
    expect(trackerSelect.value).toBe('alpha');
    expect(dateInput.value).toBe('2026-07-21');
    expect(searchInput.value).toBe('hello');
  });

  test('delegates row actions once and removes the listener on destroy', () => {
    const callbacks = dependencies();
    const controller = createHistoryController(callbacks);
    controller.render(state());
    controller.render(state());

    document.querySelector<HTMLButtonElement>('[data-edit-log]')?.click();
    document.querySelector<HTMLButtonElement>('[data-delete-log]')?.click();

    expect(callbacks.openLogEditor).toHaveBeenCalledOnce();
    expect(callbacks.openLogEditor).toHaveBeenCalledWith('today-alpha');
    expect(callbacks.deleteLog).toHaveBeenCalledOnce();
    expect(callbacks.deleteLog).toHaveBeenCalledWith('today-alpha');

    controller.destroy();
    document.querySelector<HTMLButtonElement>('[data-delete-log]')?.click();
    expect(callbacks.deleteLog).toHaveBeenCalledOnce();
  });

  test('renders the existing empty state when no log matches', () => {
    const controller = createHistoryController(dependencies());
    const snapshot = state();
    snapshot.logs = [];

    controller.render(snapshot);

    expect(document.querySelector('#historySummary')?.textContent).toContain('0 records');
    expect(document.querySelector('#historyGroups')?.textContent).toContain(
      'No matching records'
    );
  });
});
