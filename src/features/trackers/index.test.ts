// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AppState, Tracker } from '../../domain/models';
import type { OperationResult, TrackerInput } from '../../services/sync-service';
import {
  createTrackerController,
  TRACKER_COLORS,
  type TrackerControllerDependencies
} from './index';

function tracker(overrides: Partial<Tracker> = {}): Tracker {
  return {
    id: 'water',
    name: 'Water',
    unit: 'glass',
    icon: '💧',
    color: '#2563eb',
    goal: 8,
    presets: [1, 2],
    active: false,
    sortOrder: 3,
    createdAt: '2026-07-20T00:00:00.000Z',
    ...overrides
  };
}

function state(overrides: Partial<AppState> = {}): AppState {
  return {
    version: 3,
    trackers: [tracker()],
    logs: [{
      id: 'log-1', trackerId: 'water', value: 1,
      occurredAt: '2026-07-21T00:00:00.000Z', note: '', source: 'website'
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
        <input id="trackerUnit" maxlength="30" />
        <input id="trackerGoal" type="number" />
        <input id="trackerPresets" />
        <div id="trackerColors"></div>
      </form>
    </div>
  `;
}

function dependencies(snapshot = state()): TrackerControllerDependencies & {
  service: {
    save: ReturnType<typeof vi.fn<(input: TrackerInput) => Promise<OperationResult>>>;
    toggle: ReturnType<typeof vi.fn<(id: string) => Promise<OperationResult>>>;
    delete: ReturnType<typeof vi.fn<(id: string) => Promise<OperationResult>>>;
  };
} {
  const success = { ok: true, queued: false } satisfies OperationResult;
  return {
    service: {
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
      name: 'Hydration',
      unit: 'cup',
      icon: '💧',
      color: '#2563eb',
      goal: 8,
      presets: [1, 2, 3, 4, 5, 6, 7, 8]
    });
    expect(deps.shell.closeModal).toHaveBeenCalledWith('trackerModal');
    expect(deps.shell.showToast).toHaveBeenCalledWith('Tracker updated');
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
