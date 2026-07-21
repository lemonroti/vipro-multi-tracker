import type {
  AppState,
  OptionTracker,
  Tracker,
  TrackingLog,
  UnitTracker
} from '../../domain/models';
import type { LogService } from '../../services/log-service';
import type { LogInput, OperationResult } from '../../services/sync-service';
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
  addQuickOptionLog(trackerId: string, optionId: string): Promise<void>;
  deleteLog(logId: string): Promise<void>;
  renderUndo(): void;
  destroy(): void;
}

function trackerById(state: Readonly<AppState>, id: string): Tracker | undefined {
  return state.trackers.find(tracker => tracker.id === id);
}

function unitTrackerById(state: Readonly<AppState>, id: string): UnitTracker | undefined {
  const tracker = trackerById(state, id);
  return tracker?.inputType === 'unit' ? tracker : undefined;
}

function optionTrackerById(state: Readonly<AppState>, id: string): OptionTracker | undefined {
  const tracker = trackerById(state, id);
  return tracker?.inputType === 'option' ? tracker : undefined;
}

function inputForLog(log: TrackingLog): LogInput {
  return log.recordType === 'unit'
    ? {
        recordType: 'unit',
        trackerId: log.trackerId,
        value: log.value,
        occurredAt: log.occurredAt,
        note: log.note
      }
    : {
        recordType: 'option',
        trackerId: log.trackerId,
        optionId: log.optionId,
        occurredAt: log.occurredAt,
        note: log.note
      };
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
  const valueField = getElement<HTMLElement>('#logValueField');
  const valueInput = getElement<HTMLInputElement>('#logValue');
  const optionField = getElement<HTMLElement>('#logOptionField');
  const optionSelect = getElement<HTMLSelectElement>('#logOption');
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
    const trackers = state.trackers;
    trackerSelect.innerHTML = trackers.map(tracker => (
      `<option value="${escapeHtml(tracker.id)}">${escapeHtml(tracker.name)}${tracker.inputType === 'unit' ? ` (${escapeHtml(tracker.unit)})` : ''}</option>`
    )).join('');
    if (trackers.some(tracker => tracker.id === previous)) trackerSelect.value = previous;
  };

  const renderTypeFields = (selectedOptionId?: string): Tracker | undefined => {
    const tracker = trackerById(dependencies.store.getState(), trackerSelect.value);
    const isOption = tracker?.inputType === 'option';
    valueField.hidden = isOption;
    valueInput.required = !isOption;
    optionField.hidden = !isOption;
    optionSelect.required = isOption;

    if (tracker?.inputType === 'option') {
      const options = [...tracker.options].sort((left, right) => left.sortOrder - right.sortOrder);
      optionSelect.innerHTML = options.map(option => (
        `<option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>`
      )).join('');
      optionSelect.value = options.some(option => option.id === selectedOptionId)
        ? selectedOptionId ?? ''
        : options[0]?.id ?? '';
    } else {
      optionSelect.innerHTML = '';
    }

    return tracker;
  };

  const openModal = (options: OpenLogOptions = {}): void => {
    const state = dependencies.store.getState();
    const trackers = state.trackers;
    if (trackers.length === 0) {
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
    trackerSelect.value = log?.trackerId ?? options.trackerId ?? trackers[0]?.id ?? '';
    const tracker = renderTypeFields(log?.recordType === 'option' ? log.optionId : undefined);
    valueInput.value = String(
      log?.recordType === 'unit'
        ? log.value
        : tracker?.inputType === 'unit'
          ? tracker.presets[0] ?? 1
          : 1
    );
    getElement<HTMLInputElement>('#logDateTime').value = toLocalInputValue(
      log?.occurredAt ?? new Date()
    );
    getElement<HTMLTextAreaElement>('#logNote').value = log?.note ?? '';
    dependencies.shell.openModal('logModal');
    setTimeout(() => {
      if (tracker?.inputType === 'option') optionSelect.focus();
      else valueInput.focus();
    }, 50);
  };

  const submitLog = async (event: Event): Promise<void> => {
    event.preventDefault();
    const localDateTime = getElement<HTMLInputElement>('#logDateTime').value;
    const occurredAt = new Date(localDateTime);
    if (!localDateTime || Number.isNaN(occurredAt.getTime())) {
      dependencies.shell.showToast('Enter a valid date and time');
      return;
    }
    const state = dependencies.store.getState();
    const tracker = trackerById(state, trackerSelect.value);
    if (!tracker) {
      dependencies.shell.showToast('Select a valid tracker');
      return;
    }
    const note = getElement<HTMLTextAreaElement>('#logNote').value.trim();
    let input: LogInput;
    let addMessage: string;
    if (tracker.inputType === 'unit') {
      const value = Number(valueInput.value);
      if (!Number.isFinite(value) || value <= 0) {
        dependencies.shell.showToast('Enter a valid value');
        return;
      }
      input = {
        recordType: 'unit',
        trackerId: tracker.id,
        value,
        occurredAt: occurredAt.toISOString(),
        note
      };
      addMessage = `${tracker.name}: +${formatValue(value)} recorded`;
    } else {
      const option = tracker.options.find(candidate => candidate.id === optionSelect.value);
      if (!option) {
        dependencies.shell.showToast('Select a valid option');
        return;
      }
      input = {
        recordType: 'option',
        trackerId: tracker.id,
        optionId: option.id,
        occurredAt: occurredAt.toISOString(),
        note
      };
      addMessage = `${tracker.name}: ${option.label} recorded`;
    }
    const id = getElement<HTMLInputElement>('#logEditId').value;
    const existingIds = id
      ? null
      : new Set(state.logs.map(log => log.id));
    const result = id
      ? await dependencies.service.update(id, input)
      : await dependencies.service.add(input);
    const message = id
      ? 'Record updated'
      : addMessage;
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
    const tracker = unitTrackerById(dependencies.store.getState(), trackerId);
    if (!tracker || !Number.isFinite(value) || value <= 0) return;
    const existingIds = new Set(dependencies.store.getState().logs.map(log => log.id));
    const result = await dependencies.service.add({
      recordType: 'unit',
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

  const addQuickOptionLog = async (trackerId: string, optionId: string): Promise<void> => {
    const state = dependencies.store.getState();
    const tracker = optionTrackerById(state, trackerId);
    const option = tracker?.options.find(candidate => candidate.id === optionId);
    if (!tracker || !option) return;
    const existingIds = new Set(state.logs.map(log => log.id));
    const result = await dependencies.service.add({
      recordType: 'option',
      trackerId,
      optionId,
      occurredAt: new Date().toISOString(),
      note: ''
    });
    if (successful(
      result,
      dependencies.shell,
      `${tracker.name}: ${option.label} recorded`,
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
    if (!log) return;
    if (state.settings.confirmDelete && !confirm('Delete this record?')) return;
    const result = await dependencies.service.delete(logId);
    if (successful(result, dependencies.shell, 'Record deleted', true)) {
      hasUndo = true;
      undoAction = () => dependencies.service.add(inputForLog(log));
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

  const updateNewFields = (): void => {
    const isEdit = Boolean(getElement<HTMLInputElement>('#logEditId').value);
    const tracker = renderTypeFields();
    if (!isEdit && tracker?.inputType === 'unit') {
      valueInput.value = String(tracker.presets[0] ?? 1);
    }
  };
  const handleOpen = (): void => openModal();
  const handleHeader = (): void => {
    if (headerAction.dataset.actionType === 'log') openModal();
  };
  const handleSubmit = (event: Event): void => void submitLog(event);
  const handleUndo = (): void => void undoLast();

  form.addEventListener('submit', handleSubmit);
  trackerSelect.addEventListener('change', updateNewFields);
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
    addQuickOptionLog,
    deleteLog,
    renderUndo,
    destroy() {
      form.removeEventListener('submit', handleSubmit);
      trackerSelect.removeEventListener('change', updateNewFields);
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
