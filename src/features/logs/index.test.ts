// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AppState, Tracker, TrackingLog } from '../../domain/models';
import type { LogInput, OperationResult } from '../../services/sync-service';
import { createLogController, type LogControllerDependencies } from './index';

const TRACKER: Tracker = {
  id: 'water', name: 'Water', unit: 'glass', icon: '💧', color: '#2563eb',
  goal: 8, presets: [2, 5], active: true, sortOrder: 0,
  inputType: 'unit', options: [],
  createdAt: '2026-07-20T00:00:00.000Z'
};
const LOG: TrackingLog = {
  id: 'log-1', trackerId: 'water', value: 3,
  recordType: 'unit', optionId: null,
  occurredAt: new Date(2026, 6, 21, 14, 30).toISOString(),
  note: ' Afternoon ', source: 'website'
};
const OPTION_TRACKER: Tracker = {
  id: 'routine', name: 'Routine', inputType: 'option', unit: null, icon: '✦',
  color: '#334155', goal: null, presets: [], options: [
    {
      id: 'wake', label: 'Wake', sortOrder: 0, createdAt: '2026-07-20T00:00:00.000Z'
    },
    {
      id: 'sleep', label: '<Sleep & rest>', sortOrder: 1,
      createdAt: '2026-07-20T00:00:00.000Z'
    }
  ],
  active: true, sortOrder: 1, createdAt: '2026-07-20T00:00:00.000Z'
};
const OPTION_LOG: TrackingLog = {
  id: 'log-option', trackerId: 'routine', recordType: 'option', value: null,
  optionId: 'sleep', occurredAt: new Date(2026, 6, 21, 8, 45).toISOString(),
  note: ' Rested ', source: 'website'
};

function state(overrides: Partial<AppState> = {}): AppState {
  return {
    version: 4,
    trackers: [TRACKER],
    logs: [LOG],
    settings: { theme: 'system', confirmDelete: true },
    ...overrides
  };
}

function installDom(): void {
  document.body.innerHTML = `
    <button data-open-log>Add</button>
    <button id="headerAction" data-action-type="log"></button>
    <div id="logModal" hidden>
      <h2 id="logModalTitle"></h2>
      <form id="logForm">
        <input id="logEditId" />
        <select id="logTracker"></select>
        <div id="logValueField"><input id="logValue" type="number" /></div>
        <div id="logOptionField" hidden><select id="logOption"></select></div>
        <input id="logDateTime" type="datetime-local" />
        <textarea id="logNote"></textarea>
      </form>
    </div>
    <div id="toast"><button id="toastUndo" hidden>Undo</button></div>
  `;
}

function dependencies(snapshot = state()): LogControllerDependencies & {
  service: {
    add: ReturnType<typeof vi.fn<(input: LogInput) => Promise<OperationResult>>>;
    update: ReturnType<typeof vi.fn<(id: string, input: LogInput) => Promise<OperationResult>>>;
    delete: ReturnType<typeof vi.fn<(id: string) => Promise<OperationResult>>>;
    undoLast: ReturnType<typeof vi.fn<() => Promise<OperationResult | null>>>;
  };
} {
  const success = { ok: true, queued: false } satisfies OperationResult;
  return {
    service: {
      add: vi.fn().mockResolvedValue(success),
      update: vi.fn().mockResolvedValue(success),
      delete: vi.fn().mockResolvedValue(success),
      undoLast: vi.fn().mockResolvedValue(success)
    },
    store: { getState: () => structuredClone(snapshot) },
    shell: {
      openModal: vi.fn(),
      closeModal: vi.fn(),
      showToast: vi.fn(),
      switchView: vi.fn()
    }
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('LogController', () => {
  beforeEach(installDom);

  test('lists both tracker types with type-aware labels and fields', () => {
    const deps = dependencies(state({ trackers: [TRACKER, OPTION_TRACKER] }));
    const controller = createLogController(deps);

    controller.openModal({ trackerId: 'water' });

    const options = [...document.querySelectorAll<HTMLOptionElement>('#logTracker option')];
    expect(options.map(option => [option.value, option.textContent])).toEqual([
      ['water', 'Water (glass)'],
      ['routine', 'Routine']
    ]);
    expect(document.querySelector<HTMLElement>('#logValueField')?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('#logOptionField')?.hidden).toBe(true);

    const trackerSelect = document.querySelector<HTMLSelectElement>('#logTracker')!;
    trackerSelect.value = 'routine';
    trackerSelect.dispatchEvent(new Event('change'));

    expect(document.querySelector<HTMLElement>('#logValueField')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#logOptionField')?.hidden).toBe(false);
    expect(document.querySelector<HTMLSelectElement>('#logOption')?.value).toBe('wake');
    expect([...document.querySelectorAll<HTMLOptionElement>('#logOption option')]
      .map(option => option.textContent)).toEqual(['Wake', '<Sleep & rest>']);
    expect(document.querySelector('#logOption img')).toBeNull();

    trackerSelect.value = 'water';
    trackerSelect.dispatchEvent(new Event('change'));
    expect(document.querySelector<HTMLInputElement>('#logValue')?.value).toBe('2');
  });

  test('populates tracker options and preserves an edited log using local datetime input', () => {
    const deps = dependencies();
    const controller = createLogController(deps);

    controller.openModal({ logId: 'log-1' });

    expect(document.querySelector('#logModalTitle')?.textContent).toBe('Edit record');
    expect(document.querySelector('#logTracker')?.textContent).toContain('Water (glass)');
    expect(document.querySelector<HTMLInputElement>('#logDateTime')?.value).toBe(
      '2026-07-21T14:30'
    );
    expect(document.querySelector<HTMLTextAreaElement>('#logNote')?.value).toBe(' Afternoon ');
    expect(deps.shell.openModal).toHaveBeenCalledWith('logModal');
  });

  test('converts local datetime on edit and validates positive values', async () => {
    const deps = dependencies();
    const controller = createLogController(deps);
    controller.openModal({ logId: 'log-1' });
    document.querySelector<HTMLInputElement>('#logValue')!.value = '4.5';
    document.querySelector<HTMLInputElement>('#logDateTime')!.value = '2026-07-22T09:15';
    document.querySelector<HTMLTextAreaElement>('#logNote')!.value = ' updated ';

    document.querySelector<HTMLFormElement>('#logForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect(deps.service.update).toHaveBeenCalledWith('log-1', {
      recordType: 'unit',
      trackerId: 'water',
      value: 4.5,
      occurredAt: new Date(2026, 6, 22, 9, 15).toISOString(),
      note: 'updated'
    });
    expect(deps.shell.showToast).toHaveBeenCalledWith('Record updated');

    document.querySelector<HTMLInputElement>('#logValue')!.value = '0';
    document.querySelector<HTMLFormElement>('#logForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(deps.shell.showToast).toHaveBeenCalledWith('Enter a valid value');
    expect(deps.service.update).toHaveBeenCalledOnce();
  });

  test('adds a manual record with the tracker-specific legacy toast', async () => {
    const deps = dependencies();
    const controller = createLogController(deps);
    controller.openModal({ trackerId: 'water' });

    document.querySelector<HTMLFormElement>('#logForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    const added = deps.service.add.mock.calls[0]?.[0];
    expect(added).toMatchObject({
      recordType: 'unit', trackerId: 'water', value: 2, note: ''
    });
    expect(Number.isNaN(Date.parse(added?.occurredAt ?? ''))).toBe(false);
    expect(deps.shell.showToast).toHaveBeenCalledWith('Water: +2 recorded', true);
  });

  test('adds and edits manual Option records with their exact variant', async () => {
    const addDeps = dependencies(state({ trackers: [TRACKER, OPTION_TRACKER] }));
    const addController = createLogController(addDeps);
    addController.openModal({ trackerId: 'routine' });
    document.querySelector<HTMLSelectElement>('#logOption')!.value = 'sleep';
    document.querySelector<HTMLInputElement>('#logDateTime')!.value = '2026-07-22T09:15';
    document.querySelector<HTMLTextAreaElement>('#logNote')!.value = ' rested ';

    document.querySelector<HTMLFormElement>('#logForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect(addDeps.service.add).toHaveBeenCalledWith({
      recordType: 'option', trackerId: 'routine', optionId: 'sleep',
      occurredAt: new Date(2026, 6, 22, 9, 15).toISOString(), note: 'rested'
    });
    expect(addDeps.shell.showToast).toHaveBeenCalledWith(
      'Routine: <Sleep & rest> recorded',
      true
    );

    installDom();
    const editDeps = dependencies(state({
      trackers: [TRACKER, OPTION_TRACKER],
      logs: [LOG, OPTION_LOG]
    }));
    const editController = createLogController(editDeps);
    editController.openModal({ logId: 'log-option' });

    expect(document.querySelector<HTMLElement>('#logValueField')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#logOptionField')?.hidden).toBe(false);
    expect(document.querySelector<HTMLSelectElement>('#logOption')?.value).toBe('sleep');
    document.querySelector<HTMLSelectElement>('#logOption')!.value = 'wake';
    document.querySelector<HTMLFormElement>('#logForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect(editDeps.service.update).toHaveBeenCalledWith('log-option', {
      recordType: 'option', trackerId: 'routine', optionId: 'wake',
      occurredAt: OPTION_LOG.occurredAt, note: 'Rested'
    });
    expect(editDeps.shell.showToast).toHaveBeenCalledWith('Record updated');
  });

  test('rejects a manual Option selection that is no longer owned by the tracker', async () => {
    let current = state({ trackers: [TRACKER, OPTION_TRACKER] });
    const deps = dependencies(current);
    deps.store.getState = () => structuredClone(current);
    const controller = createLogController(deps);
    controller.openModal({ trackerId: 'routine' });
    current = state({
      trackers: [TRACKER, { ...OPTION_TRACKER, options: [OPTION_TRACKER.options[0]!] }]
    });
    document.querySelector<HTMLSelectElement>('#logOption')!.value = 'sleep';

    document.querySelector<HTMLFormElement>('#logForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect(deps.service.add).not.toHaveBeenCalled();
    expect(deps.shell.showToast).toHaveBeenCalledWith('Select a valid option');
    expect(deps.shell.closeModal).not.toHaveBeenCalled();
  });

  test('confirms deletion and exposes undo only after a successful mutation', async () => {
    const deps = dependencies();
    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const controller = createLogController(deps);

    await controller.deleteLog('log-1');
    expect(confirmDelete).toHaveBeenCalledWith('Delete this record?');
    expect(deps.service.delete).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLButtonElement>('#toastUndo')?.hidden).toBe(true);

    await controller.deleteLog('log-1');
    expect(deps.service.delete).toHaveBeenCalledWith('log-1');
    expect(deps.shell.showToast).toHaveBeenCalledWith('Record deleted', true);
    controller.renderUndo();
    expect(document.querySelector<HTMLButtonElement>('#toastUndo')?.hidden).toBe(false);

    document.querySelector<HTMLButtonElement>('#toastUndo')?.click();
    await settle();
    expect(deps.service.add).toHaveBeenCalledWith({
      recordType: 'unit',
      trackerId: 'water',
      value: 3,
      occurredAt: LOG.occurredAt,
      note: ' Afternoon '
    });
    expect(deps.service.undoLast).not.toHaveBeenCalled();
    expect(deps.shell.showToast).toHaveBeenCalledWith('Undone');
    confirmDelete.mockRestore();
  });

  test('records quick values through the service and removes owned listeners', async () => {
    const deps = dependencies();
    const controller = createLogController(deps);

    await controller.addQuickLog('water', 2);
    const added = deps.service.add.mock.calls[0]?.[0];
    expect(added).toMatchObject({
      recordType: 'unit', trackerId: 'water', value: 2, note: ''
    });
    expect(Number.isNaN(Date.parse(added?.occurredAt ?? ''))).toBe(false);
    expect(deps.shell.showToast).toHaveBeenCalledWith('Water: +2 recorded', true);

    controller.destroy();
    document.querySelector<HTMLButtonElement>('#toastUndo')?.click();
    await settle();
    expect(deps.service.undoLast).not.toHaveBeenCalled();
  });

  test('records an owned Option immediately with the current timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T03:04:05.000Z'));
    try {
      const deps = dependencies(state({ trackers: [TRACKER, OPTION_TRACKER] }));
      const controller = createLogController(deps);

      await controller.addQuickOptionLog('routine', 'sleep');

      expect(deps.service.add).toHaveBeenCalledWith({
        recordType: 'option', trackerId: 'routine', optionId: 'sleep',
        occurredAt: '2026-07-21T03:04:05.000Z', note: ''
      });
      expect(deps.shell.showToast).toHaveBeenCalledWith(
        'Routine: <Sleep & rest> recorded',
        true
      );

      await controller.addQuickOptionLog('routine', 'missing');
      await controller.addQuickOptionLog('water', 'sleep');
      expect(deps.service.add).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test('recreates the original Option record variant when deletion is undone', async () => {
    const deps = dependencies(state({
      trackers: [TRACKER, OPTION_TRACKER],
      logs: [LOG, OPTION_LOG]
    }));
    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const controller = createLogController(deps);

    await controller.deleteLog('log-option');
    document.querySelector<HTMLButtonElement>('#toastUndo')?.click();
    await settle();

    expect(deps.service.add).toHaveBeenCalledWith({
      recordType: 'option', trackerId: 'routine', optionId: 'sleep',
      occurredAt: OPTION_LOG.occurredAt, note: ' Rested '
    });
    confirmDelete.mockRestore();
  });
});
