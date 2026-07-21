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
        <input id="logValue" type="number" />
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
    expect(added).toMatchObject({ trackerId: 'water', value: 2, note: '' });
    expect(Number.isNaN(Date.parse(added?.occurredAt ?? ''))).toBe(false);
    expect(deps.shell.showToast).toHaveBeenCalledWith('Water: +2 recorded', true);
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
    expect(added).toMatchObject({ trackerId: 'water', value: 2, note: '' });
    expect(Number.isNaN(Date.parse(added?.occurredAt ?? ''))).toBe(false);
    expect(deps.shell.showToast).toHaveBeenCalledWith('Water: +2 recorded', true);

    controller.destroy();
    document.querySelector<HTMLButtonElement>('#toastUndo')?.click();
    await settle();
    expect(deps.service.undoLast).not.toHaveBeenCalled();
  });
});
