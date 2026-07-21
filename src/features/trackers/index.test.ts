// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AppState, OptionTracker, UnitTracker } from '../../domain/models';
import type { TrackerAnalysisResult } from '../../services/tracker-service';
import type { OperationResult, TrackerInput } from '../../services/sync-service';
import {
  createTrackerController,
  TRACKER_COLORS,
  type TrackerControllerDependencies
} from './index';

function tracker(overrides: Partial<UnitTracker> = {}): UnitTracker {
  return {
    id: 'water',
    name: 'Water',
    unit: 'glass',
    icon: '💧',
    color: '#2563eb',
    goal: 8,
    presets: [1, 2],
    inputType: 'unit',
    options: [],
    active: false,
    sortOrder: 3,
    createdAt: '2026-07-20T00:00:00.000Z',
    ...overrides
  };
}

function optionTracker(overrides: Partial<OptionTracker> = {}): OptionTracker {
  return {
    id: 'routine',
    name: 'Routine',
    unit: null,
    icon: '✦',
    color: '#6d4aff',
    goal: null,
    presets: [],
    inputType: 'option',
    options: [
      { id: 'sleep', label: 'Sleep', sortOrder: 0, createdAt: '2026-07-20T00:00:00.000Z' },
      { id: 'wake', label: 'Wake', sortOrder: 1, createdAt: '2026-07-20T00:00:00.000Z' }
    ],
    active: true,
    sortOrder: 4,
    createdAt: '2026-07-20T00:00:00.000Z',
    ...overrides
  };
}

function state(overrides: Partial<AppState> = {}): AppState {
  return {
    version: 4,
    trackers: [tracker()],
    logs: [{
      id: 'log-1', trackerId: 'water', value: 1,
      occurredAt: '2026-07-21T00:00:00.000Z', note: '', source: 'website',
      recordType: 'unit', optionId: null
    }],
    settings: { theme: 'system', confirmDelete: true },
    ...overrides
  };
}

function installDom(): void {
  document.body.innerHTML = `
    <button data-open-tracker>New</button>
    <button id="headerAction" data-action-type="tracker"></button>
    <div id="trackerManageList"></div>
    <div id="trackerModal" hidden>
      <h2 id="trackerModalTitle"></h2>
      <form id="trackerForm">
        <input id="trackerEditId" />
        <input id="trackerName" maxlength="80" />
        <input id="trackerIcon" maxlength="4" />
        <select id="trackerInputType">
          <option value="unit">Unit</option>
          <option value="option">Option</option>
        </select>
        <p id="trackerInputTypeHelp"></p>
        <div id="trackerUnitFields">
          <input id="trackerUnit" maxlength="30" />
          <input id="trackerGoal" type="number" />
          <input id="trackerPresets" />
        </div>
        <div id="trackerOptionFields" hidden>
          <input id="trackerOptions" />
        </div>
        <div id="trackerColors"></div>
      </form>
    </div>
  `;
}

function dependencies(snapshot = state()): TrackerControllerDependencies & {
  service: {
    analyze: ReturnType<typeof vi.fn<(input: TrackerInput) => TrackerAnalysisResult>>;
    save: ReturnType<typeof vi.fn<(input: TrackerInput) => Promise<OperationResult>>>;
    toggle: ReturnType<typeof vi.fn<(id: string) => Promise<OperationResult>>>;
    delete: ReturnType<typeof vi.fn<(id: string) => Promise<OperationResult>>>;
  };
} {
  const success = { ok: true, queued: false } satisfies OperationResult;
  return {
    service: {
      analyze: vi.fn().mockReturnValue({
        ok: true,
        impact: { removedOptions: [], removedRecordCount: 0 }
      }),
      save: vi.fn().mockResolvedValue(success),
      toggle: vi.fn().mockResolvedValue(success),
      delete: vi.fn().mockResolvedValue(success)
    },
    store: { getState: () => structuredClone(snapshot) },
    shell: {
      openModal: vi.fn(),
      closeModal: vi.fn(),
      showToast: vi.fn()
    },
    openLog: vi.fn()
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('TrackerController', () => {
  beforeEach(installDom);

  test('defaults a new modal to Unit and preserves type-specific drafts while switching', () => {
    const controller = createTrackerController(dependencies(state({ trackers: [], logs: [] })));
    controller.openModal();

    const inputType = document.querySelector<HTMLSelectElement>('#trackerInputType')!;
    const unitFields = document.querySelector<HTMLElement>('#trackerUnitFields')!;
    const optionFields = document.querySelector<HTMLElement>('#trackerOptionFields')!;
    const options = document.querySelector<HTMLInputElement>('#trackerOptions')!;

    expect(inputType.value).toBe('unit');
    expect(unitFields.hidden).toBe(false);
    expect(optionFields.hidden).toBe(true);
    expect(options.value).toBe('');

    document.querySelector<HTMLInputElement>('#trackerUnit')!.value = 'minutes';
    document.querySelector<HTMLInputElement>('#trackerGoal')!.value = '30';
    document.querySelector<HTMLInputElement>('#trackerPresets')!.value = '5, 10';
    inputType.value = 'option';
    inputType.dispatchEvent(new Event('change', { bubbles: true }));

    expect(unitFields.hidden).toBe(true);
    expect(optionFields.hidden).toBe(false);
    options.value = 'Sleep, Wake';

    inputType.value = 'unit';
    inputType.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelector<HTMLInputElement>('#trackerUnit')?.value).toBe('minutes');
    expect(document.querySelector<HTMLInputElement>('#trackerGoal')?.value).toBe('30');
    expect(document.querySelector<HTMLInputElement>('#trackerPresets')?.value).toBe('5, 10');

    inputType.value = 'option';
    inputType.dispatchEvent(new Event('change', { bubbles: true }));
    expect(options.value).toBe('Sleep, Wake');
  });

  test('populates an Option tracker and locks its type when records exist', () => {
    const snapshot = state({
      trackers: [optionTracker()],
      logs: [{
        id: 'log-1', trackerId: 'routine', value: null,
        occurredAt: '2026-07-21T00:00:00.000Z', note: '', source: 'website',
        recordType: 'option', optionId: 'sleep'
      }]
    });
    const controller = createTrackerController(dependencies(snapshot));
    controller.openModal('routine');

    expect(document.querySelector<HTMLSelectElement>('#trackerInputType')).toMatchObject({
      value: 'option',
      disabled: true
    });
    expect(document.querySelector('#trackerInputTypeHelp')?.textContent).toBe(
      'Tracking type cannot change after records exist.'
    );
    expect(document.querySelector<HTMLInputElement>('#trackerOptions')?.value).toBe(
      'Sleep, Wake'
    );
    expect(document.querySelector<HTMLElement>('#trackerUnitFields')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#trackerOptionFields')?.hidden).toBe(false);
  });

  test('parses positive presets up to eight values and preserves an edited tracker id', async () => {
    const deps = dependencies();
    const controller = createTrackerController(deps);
    controller.openModal('water');

    expect(document.querySelector<HTMLInputElement>('#trackerName')?.value).toBe('Water');
    expect(document.querySelector<HTMLInputElement>('#trackerGoal')?.value).toBe('8');
    expect(document.querySelectorAll('[data-color]')).toHaveLength(7);
    expect(TRACKER_COLORS).toHaveLength(7);

    document.querySelector<HTMLInputElement>('#trackerName')!.value = ' Hydration ';
    document.querySelector<HTMLInputElement>('#trackerUnit')!.value = ' cup ';
    document.querySelector<HTMLInputElement>('#trackerPresets')!.value =
      '1, -2, nope, 2, 3, 4, 5, 6, 7, 8, 9';
    document.querySelector<HTMLFormElement>('#trackerForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect(deps.service.save).toHaveBeenCalledWith({
      id: 'water',
      inputType: 'unit',
      name: 'Hydration',
      unit: 'cup',
      icon: '💧',
      color: '#2563eb',
      goal: 8,
      presets: [1, 2, 3, 4, 5, 6, 7, 8]
    });
    expect(deps.service.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'water', inputType: 'unit' })
    );
    expect(deps.service.analyze.mock.invocationCallOrder[0]).toBeLessThan(
      deps.service.save.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(deps.shell.closeModal).toHaveBeenCalledWith('trackerModal');
    expect(deps.shell.showToast).toHaveBeenCalledWith('Tracker updated');
  });

  test.each([
    ['Sleep, sleep', 'Option labels must be unique.'],
    ['One, Two, Three, Four, Five, Six, Seven, Eight, Nine', 'Enter at most eight options.']
  ])('keeps the modal open for invalid Option labels: %s', async (raw, message) => {
    const deps = dependencies(state({ trackers: [], logs: [] }));
    const controller = createTrackerController(deps);
    controller.openModal();
    document.querySelector<HTMLSelectElement>('#trackerInputType')!.value = 'option';
    document.querySelector<HTMLSelectElement>('#trackerInputType')!
      .dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector<HTMLInputElement>('#trackerName')!.value = 'Routine';
    document.querySelector<HTMLInputElement>('#trackerOptions')!.value = raw;

    document.querySelector<HTMLFormElement>('#trackerForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect(deps.shell.showToast).toHaveBeenCalledWith(message);
    expect(deps.service.analyze).not.toHaveBeenCalled();
    expect(deps.service.save).not.toHaveBeenCalled();
    expect(deps.shell.closeModal).not.toHaveBeenCalled();
  });

  test('confirms record deletion before saving removed Option labels', async () => {
    const snapshot = state({ trackers: [optionTracker()], logs: [] });
    const deps = dependencies(snapshot);
    deps.service.analyze.mockReturnValue({
      ok: true,
      impact: {
        removedOptions: [optionTracker().options[0]!],
        removedRecordCount: 2
      }
    });
    const confirmRemoval = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const controller = createTrackerController(deps);
    controller.openModal('routine');
    document.querySelector<HTMLInputElement>('#trackerOptions')!.value = 'Wake';

    document.querySelector<HTMLFormElement>('#trackerForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect(confirmRemoval).toHaveBeenCalledWith(
      'Remove Sleep and delete 2 associated records?'
    );
    expect(deps.service.save).toHaveBeenCalledWith({
      id: 'routine',
      inputType: 'option',
      name: 'Routine',
      icon: '✦',
      color: '#6d4aff',
      optionLabels: ['Wake']
    });
    confirmRemoval.mockRestore();
  });

  test('does not save when removal of Option records is cancelled', async () => {
    const snapshot = state({ trackers: [optionTracker()], logs: [] });
    const deps = dependencies(snapshot);
    deps.service.analyze.mockReturnValue({
      ok: true,
      impact: {
        removedOptions: [optionTracker().options[0]!],
        removedRecordCount: 1
      }
    });
    const confirmRemoval = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const controller = createTrackerController(deps);
    controller.openModal('routine');
    document.querySelector<HTMLInputElement>('#trackerOptions')!.value = 'Wake';

    document.querySelector<HTMLFormElement>('#trackerForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect(deps.service.analyze).toHaveBeenCalledOnce();
    expect(deps.service.save).not.toHaveBeenCalled();
    expect(deps.shell.closeModal).not.toHaveBeenCalled();
    confirmRemoval.mockRestore();
  });

  test('rejects missing presets and a negative goal before calling the service', async () => {
    const deps = dependencies();
    const controller = createTrackerController(deps);
    controller.openModal();
    document.querySelector<HTMLInputElement>('#trackerName')!.value = 'Water';
    document.querySelector<HTMLInputElement>('#trackerUnit')!.value = 'glass';
    document.querySelector<HTMLInputElement>('#trackerGoal')!.value = '-1';
    document.querySelector<HTMLInputElement>('#trackerPresets')!.value = '0, -2, invalid';

    document.querySelector<HTMLFormElement>('#trackerForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect(deps.service.save).not.toHaveBeenCalled();
    expect(deps.shell.showToast).toHaveBeenCalledWith(
      'Enter at least one valid quick value'
    );
  });

  test('renders management actions and confirms tracker deletion with its record count', async () => {
    const deps = dependencies();
    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const controller = createTrackerController(deps);
    controller.render(state());

    expect(document.querySelector('#trackerManageList')?.textContent).toContain(
      'glass · 1 record · Quick values: 1, 2'
    );
    document.querySelector<HTMLButtonElement>('[data-delete-tracker]')?.click();
    await settle();

    expect(confirmDelete).toHaveBeenCalledWith('Delete Water and its 1 records?');
    expect(deps.service.delete).not.toHaveBeenCalled();

    confirmDelete.mockRestore();
  });

  test('renders escaped Option management copy', () => {
    const malicious = optionTracker({
      options: [
        { id: 'sleep', label: '<img src=x onerror=alert(1)>', sortOrder: 0, createdAt: '2026-07-20T00:00:00.000Z' },
        { id: 'wake', label: 'Wake', sortOrder: 1, createdAt: '2026-07-20T00:00:00.000Z' }
      ]
    });
    const snapshot = state({ trackers: [malicious], logs: [] });
    const controller = createTrackerController(dependencies(snapshot));
    controller.render(snapshot);

    expect(document.querySelector('#trackerManageList')?.textContent).toContain(
      'Option · 0 records · Options: <img src=x onerror=alert(1)>, Wake'
    );
    expect(document.querySelector('#trackerManageList img')).toBeNull();
  });

  test('uses services for delegated toggle/delete actions and removes listeners on destroy', async () => {
    const snapshot = state({ settings: { theme: 'system', confirmDelete: false } });
    const deps = dependencies(snapshot);
    const controller = createTrackerController(deps);
    controller.render(snapshot);

    document.querySelector<HTMLButtonElement>('[data-toggle-tracker]')?.click();
    document.querySelector<HTMLButtonElement>('[data-delete-tracker]')?.click();
    await settle();

    expect(deps.service.toggle).toHaveBeenCalledWith('water');
    expect(deps.service.delete).toHaveBeenCalledWith('water');
    controller.destroy();
    document.querySelector<HTMLButtonElement>('[data-toggle-tracker]')?.click();
    expect(deps.service.toggle).toHaveBeenCalledOnce();
  });
});
