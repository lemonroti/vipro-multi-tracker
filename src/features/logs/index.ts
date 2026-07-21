import type { AppState, Tracker } from '../../domain/models';
import type { LogService } from '../../services/log-service';
import type { OperationResult } from '../../services/sync-service';
import type { AppStore } from '../../state/app-store';
import type { ShellController } from '../shell';
import { toLocalInputValue } from '../../shared/dates';
import { getElement, getElements } from '../../shared/dom';
import { escapeHtml, formatValue } from '../../shared/formatting';

export interface OpenLogOptions {
  trackerId?: string;
  logId?: string;
}

export interface LogControllerDependencies {
  service: Pick<LogService, 'add' | 'update' | 'delete' | 'undoLast'>;
  store: Pick<AppStore, 'getState'>;
  shell: Pick<ShellController, 'openModal' | 'closeModal' | 'showToast' | 'switchView'>;
}

export interface LogController {
  populateTrackerOptions(): void;
  openModal(options?: OpenLogOptions): void;
  addQuickLog(trackerId: string, value: number): Promise<void>;
  deleteLog(logId: string): Promise<void>;
  renderUndo(): void;
  destroy(): void;
}

function trackerById(state: Readonly<AppState>, id: string): Tracker | undefined {
  return state.trackers.find(tracker => tracker.id === id);
}

function successful(
  result: OperationResult,
  shell: Pick<ShellController, 'showToast'>,
  message: string,
  canUndo = false
): boolean {
  if (!result.ok) {
    shell.showToast(result.error.message);
    return false;
  }
  const copy = `${message}${result.queued ? ' offline' : ''}`;
  if (canUndo) shell.showToast(copy, true);
  else shell.showToast(copy);
  return true;
}

export function createLogController(
  dependencies: LogControllerDependencies
): LogController {
  const form = getElement<HTMLFormElement>('#logForm');
  const trackerSelect = getElement<HTMLSelectElement>('#logTracker');
  const undoButton = getElement<HTMLButtonElement>('#toastUndo');
  const headerAction = getElement<HTMLButtonElement>('#headerAction');
  let hasUndo = false;
  let undoAction: (() => Promise<OperationResult | null>) | null = null;

  const renderUndo = (): void => {
    undoButton.hidden = !hasUndo;
  };

  const populateTrackerOptions = (): void => {
    const state = dependencies.store.getState();
    const previous = trackerSelect.value;
    trackerSelect.innerHTML = state.trackers.map(tracker => (
      `<option value="${escapeHtml(tracker.id)}">${escapeHtml(tracker.name)} (${escapeHtml(tracker.unit)})</option>`
    )).join('');
    if (state.trackers.some(tracker => tracker.id === previous)) trackerSelect.value = previous;
  };

  const openModal = (options: OpenLogOptions = {}): void => {
    const state = dependencies.store.getState();
    if (state.trackers.length === 0) {
      dependencies.shell.showToast('Create a tracker first');
      dependencies.shell.switchView('trackers');
      return;
    }
    const log = options.logId
      ? state.logs.find(candidate => candidate.id === options.logId)
      : undefined;
    getElement('#logModalTitle').textContent = log ? 'Edit record' : 'Add record';
    getElement<HTMLInputElement>('#logEditId').value = log?.id ?? '';
    populateTrackerOptions();
    trackerSelect.value = log?.trackerId ?? options.trackerId ?? state.trackers[0]?.id ?? '';
    const tracker = trackerById(state, trackerSelect.value);
    getElement<HTMLInputElement>('#logValue').value = String(
      log?.value ?? tracker?.presets[0] ?? 1
    );
    getElement<HTMLInputElement>('#logDateTime').value = toLocalInputValue(
      log?.occurredAt ?? new Date()
    );
    getElement<HTMLTextAreaElement>('#logNote').value = log?.note ?? '';
    dependencies.shell.openModal('logModal');
    setTimeout(() => getElement<HTMLInputElement>('#logValue').focus(), 50);
  };

  const submitLog = async (event: Event): Promise<void> => {
    event.preventDefault();
    const value = Number(getElement<HTMLInputElement>('#logValue').value);
    if (!Number.isFinite(value) || value <= 0) {
      dependencies.shell.showToast('Enter a valid value');
      return;
    }
    const localDateTime = getElement<HTMLInputElement>('#logDateTime').value;
    const occurredAt = new Date(localDateTime);
    if (!localDateTime || Number.isNaN(occurredAt.getTime())) {
      dependencies.shell.showToast('Enter a valid date and time');
      return;
    }
    const input = {
      trackerId: trackerSelect.value,
      value,
      occurredAt: occurredAt.toISOString(),
      note: getElement<HTMLTextAreaElement>('#logNote').value.trim()
    };
    const id = getElement<HTMLInputElement>('#logEditId').value;
    const tracker = trackerById(dependencies.store.getState(), input.trackerId);
    const existingIds = id
      ? null
      : new Set(dependencies.store.getState().logs.map(log => log.id));
    const result = id
      ? await dependencies.service.update(id, input)
      : await dependencies.service.add(input);
    const message = id
      ? 'Record updated'
      : tracker
        ? `${tracker.name}: +${formatValue(value)} recorded`
        : 'Record added';
    if (successful(result, dependencies.shell, message, !id)) {
      hasUndo = !id;
      if (!id) {
        const created = dependencies.store.getState().logs.find(log => !existingIds?.has(log.id));
        undoAction = created
          ? () => dependencies.service.delete(created.id)
          : () => dependencies.service.undoLast();
      }
      renderUndo();
      dependencies.shell.closeModal('logModal');
    }
  };

  const addQuickLog = async (trackerId: string, value: number): Promise<void> => {
    const tracker = trackerById(dependencies.store.getState(), trackerId);
    if (!tracker || !Number.isFinite(value) || value <= 0) return;
    const existingIds = new Set(dependencies.store.getState().logs.map(log => log.id));
    const result = await dependencies.service.add({
      trackerId,
      value,
      occurredAt: new Date().toISOString(),
      note: ''
    });
    if (successful(
      result,
      dependencies.shell,
      `${tracker.name}: +${formatValue(value)} recorded`,
      true
    )) {
      hasUndo = true;
      const created = dependencies.store.getState().logs.find(log => !existingIds.has(log.id));
      undoAction = created
        ? () => dependencies.service.delete(created.id)
        : () => dependencies.service.undoLast();
      renderUndo();
    }
  };

  const deleteLog = async (logId: string): Promise<void> => {
    const state = dependencies.store.getState();
    const log = state.logs.find(candidate => candidate.id === logId);
    if (!log || log.recordType !== 'unit') return;
    if (state.settings.confirmDelete && !confirm('Delete this record?')) return;
    const result = await dependencies.service.delete(logId);
    if (successful(result, dependencies.shell, 'Record deleted', true)) {
      hasUndo = true;
      undoAction = () => dependencies.service.add({
        trackerId: log.trackerId,
        value: log.value,
        occurredAt: log.occurredAt,
        note: log.note
      });
      renderUndo();
    }
  };

  const undoLast = async (): Promise<void> => {
    if (!hasUndo || undoAction === null) return;
    const action = undoAction;
    hasUndo = false;
    undoAction = null;
    renderUndo();
    const result = await action();
    if (result === null) return;
    if (!result.ok) {
      dependencies.shell.showToast(result.error.message);
      return;
    }
    getElement('#toast').classList.remove('show');
    dependencies.shell.showToast('Undone');
  };

  const updateNewValue = (): void => {
    if (getElement<HTMLInputElement>('#logEditId').value) return;
    const tracker = trackerById(dependencies.store.getState(), trackerSelect.value);
    if (tracker) {
      getElement<HTMLInputElement>('#logValue').value = String(tracker.presets[0] ?? 1);
    }
  };
  const handleOpen = (): void => openModal();
  const handleHeader = (): void => {
    if (headerAction.dataset.actionType === 'log') openModal();
  };
  const handleSubmit = (event: Event): void => void submitLog(event);
  const handleUndo = (): void => void undoLast();

  form.addEventListener('submit', handleSubmit);
  trackerSelect.addEventListener('change', updateNewValue);
  undoButton.addEventListener('click', handleUndo);
  getElements<HTMLElement>('[data-open-log]').forEach(button => (
    button.addEventListener('click', handleOpen)
  ));
  headerAction.addEventListener('click', handleHeader);
  renderUndo();

  return {
    populateTrackerOptions,
    openModal,
    addQuickLog,
    deleteLog,
    renderUndo,
    destroy() {
      form.removeEventListener('submit', handleSubmit);
      trackerSelect.removeEventListener('change', updateNewValue);
      undoButton.removeEventListener('click', handleUndo);
      getElements<HTMLElement>('[data-open-log]').forEach(button => (
        button.removeEventListener('click', handleOpen)
      ));
      headerAction.removeEventListener('click', handleHeader);
      hasUndo = false;
      undoAction = null;
    }
  };
}
