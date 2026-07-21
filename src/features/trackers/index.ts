import type { AppState, Tracker } from '../../domain/models';
import { parseOptionLabels } from '../../domain/tracker-options';
import type { TrackerService } from '../../services/tracker-service';
import type { OperationResult, TrackerInput } from '../../services/sync-service';
import type { ShellController } from '../shell';
import type { AppStore } from '../../state/app-store';
import { getElement, getElements } from '../../shared/dom';
import { escapeHtml, formatValue } from '../../shared/formatting';

export const TRACKER_COLORS = [
  '#334155', '#6d4aff', '#0f766e', '#c2410c', '#be185d', '#2563eb', '#7c2d12'
] as const;

export interface TrackerControllerDependencies {
  service: Pick<TrackerService, 'analyze' | 'save' | 'toggle' | 'delete'>;
  store: Pick<AppStore, 'getState'>;
  shell: Pick<ShellController, 'openModal' | 'closeModal' | 'showToast'>;
  openLog(trackerId: string): void;
}

export interface TrackerController {
  render(state: Readonly<AppState>): void;
  openModal(trackerId?: string): void;
  destroy(): void;
}

function emptyState(): string {
  return '<div class="empty-state"><div class="emoji">◫</div><h3>No trackers</h3><p>Create your first tracker to begin.</p></div>';
}

function trackerById(state: Readonly<AppState>, id: string): Tracker | undefined {
  return state.trackers.find(tracker => tracker.id === id);
}

function operationMessage(
  result: OperationResult,
  shell: Pick<ShellController, 'showToast'>,
  success: string
): boolean {
  if (!result.ok) {
    shell.showToast(result.error.message);
    return false;
  }
  shell.showToast(`${success}${result.queued ? ' offline' : ''}`);
  return true;
}

function managementHtml(state: Readonly<AppState>, tracker: Tracker): string {
  const count = state.logs.filter(log => log.trackerId === tracker.id).length;
  const details = tracker.inputType === 'option'
    ? `Option · ${count} ${count === 1 ? 'record' : 'records'} · Options: ${tracker.options.map(option => escapeHtml(option.label)).join(', ')}`
    : `${escapeHtml(tracker.unit)} · ${count} ${count === 1 ? 'record' : 'records'} · Quick values: ${tracker.presets.map(formatValue).join(', ')}`;
  return `<article class="card manage-card ${tracker.active ? '' : 'inactive'}"><div class="manage-head"><div class="manage-details"><div class="tracker-icon" style="background:${tracker.color}1c;color:${tracker.color}">${escapeHtml(tracker.icon)}</div><div><h3>${escapeHtml(tracker.name)}</h3><p>${details}</p></div></div><button class="toggle ${tracker.active ? 'on' : ''}" data-toggle-tracker="${escapeHtml(tracker.id)}" aria-label="Toggle tracker"></button></div><div class="manage-actions"><button class="button outline small" data-edit-tracker="${escapeHtml(tracker.id)}">Edit</button><button class="button outline small" data-add-for-tracker="${escapeHtml(tracker.id)}">Add record</button><button class="button danger small" data-delete-tracker="${escapeHtml(tracker.id)}">Delete</button></div></article>`;
}

export function createTrackerController(
  dependencies: TrackerControllerDependencies
): TrackerController {
  const management = getElement('#trackerManageList');
  const form = getElement<HTMLFormElement>('#trackerForm');
  const headerAction = getElement<HTMLButtonElement>('#headerAction');
  const inputType = getElement<HTMLSelectElement>('#trackerInputType');
  const unitFields = getElement<HTMLElement>('#trackerUnitFields');
  const optionFields = getElement<HTMLElement>('#trackerOptionFields');
  let selectedColor: string = TRACKER_COLORS[1];

  const renderInputType = (): void => {
    const isOption = inputType.value === 'option';
    unitFields.hidden = isOption;
    optionFields.hidden = !isOption;
  };

  const renderColors = (): void => {
    const container = getElement('#trackerColors');
    container.innerHTML = TRACKER_COLORS.map(color => (
      `<button type="button" class="color-option ${color === selectedColor ? 'selected' : ''}" style="background:${color}" data-color="${color}" aria-label="Choose ${color}"></button>`
    )).join('');
  };

  const openModal = (trackerId = ''): void => {
    const state = dependencies.store.getState();
    const tracker = trackerId ? trackerById(state, trackerId) : undefined;
    getElement('#trackerModalTitle').textContent = tracker ? 'Edit tracker' : 'Create tracker';
    getElement<HTMLInputElement>('#trackerEditId').value = tracker?.id ?? '';
    getElement<HTMLInputElement>('#trackerName').value = tracker?.name ?? '';
    getElement<HTMLInputElement>('#trackerIcon').value = tracker?.icon ?? '✦';
    inputType.value = tracker?.inputType ?? 'unit';
    getElement<HTMLInputElement>('#trackerUnit').value =
      tracker?.inputType === 'unit' ? tracker.unit : '';
    getElement<HTMLInputElement>('#trackerGoal').value =
      tracker?.inputType === 'unit' ? tracker.goal?.toString() ?? '' : '';
    getElement<HTMLInputElement>('#trackerPresets').value =
      tracker?.inputType === 'unit' ? tracker.presets.join(', ') : '1';
    getElement<HTMLInputElement>('#trackerOptions').value =
      tracker?.inputType === 'option'
        ? tracker.options.map(option => option.label).join(', ')
        : '';
    const typeLocked = tracker !== undefined
      && state.logs.some(log => log.trackerId === tracker.id);
    inputType.disabled = typeLocked;
    getElement('#trackerInputTypeHelp').textContent = typeLocked
      ? 'Tracking type cannot change after records exist.'
      : '';
    renderInputType();
    selectedColor = tracker?.color
      ?? TRACKER_COLORS[state.trackers.length % TRACKER_COLORS.length]
      ?? TRACKER_COLORS[0];
    renderColors();
    dependencies.shell.openModal('trackerModal');
    setTimeout(() => getElement<HTMLInputElement>('#trackerName').focus(), 50);
  };

  const saveTracker = async (event: Event): Promise<void> => {
    event.preventDefault();
    const id = getElement<HTMLInputElement>('#trackerEditId').value;
    const common = {
      ...(id ? { id } : {}),
      name: getElement<HTMLInputElement>('#trackerName').value.trim(),
      icon: getElement<HTMLInputElement>('#trackerIcon').value.trim() || '✦',
      color: selectedColor
    };
    let input: TrackerInput;
    if (inputType.value === 'option') {
      try {
        input = {
          ...common,
          inputType: 'option',
          optionLabels: parseOptionLabels(
            getElement<HTMLInputElement>('#trackerOptions').value
          )
        };
      } catch (error) {
        dependencies.shell.showToast(
          error instanceof Error ? error.message : 'Invalid option labels.'
        );
        return;
      }
    } else {
      const presets = getElement<HTMLInputElement>('#trackerPresets').value
        .split(',')
        .map(value => Number(value.trim()))
        .filter(value => Number.isFinite(value) && value > 0)
        .slice(0, 8);
      if (presets.length === 0) {
        dependencies.shell.showToast('Enter at least one valid quick value');
        return;
      }

      const goalValue = getElement<HTMLInputElement>('#trackerGoal').value;
      const goal = goalValue === '' ? null : Number(goalValue);
      if (goal !== null && (!Number.isFinite(goal) || goal < 0)) {
        dependencies.shell.showToast('Enter a valid daily goal');
        return;
      }
      input = {
        ...common,
        inputType: 'unit',
        unit: getElement<HTMLInputElement>('#trackerUnit').value.trim(),
        goal,
        presets
      };
    }

    const analysis = dependencies.service.analyze(input);
    if (!analysis.ok) {
      dependencies.shell.showToast(analysis.error.message);
      return;
    }
    if (analysis.impact.removedRecordCount > 0) {
      const labels = analysis.impact.removedOptions.map(option => option.label).join(', ');
      if (!confirm(
        `Remove ${labels} and delete ${analysis.impact.removedRecordCount} associated records?`
      )) return;
    }

    const result = await dependencies.service.save(input);
    if (operationMessage(
      result,
      dependencies.shell,
      id ? 'Tracker updated' : 'Tracker created'
    )) {
      dependencies.shell.closeModal('trackerModal');
    }
  };

  const deleteTracker = async (id: string): Promise<void> => {
    const state = dependencies.store.getState();
    const tracker = trackerById(state, id);
    if (!tracker) return;
    const recordCount = state.logs.filter(log => log.trackerId === id).length;
    const message = recordCount
      ? `Delete ${tracker.name} and its ${recordCount} records?`
      : `Delete ${tracker.name}?`;
    if (state.settings.confirmDelete && !confirm(message)) return;
    const result = await dependencies.service.delete(id);
    operationMessage(result, dependencies.shell, 'Tracker deleted');
  };

  const toggleTracker = async (id: string): Promise<void> => {
    const tracker = trackerById(dependencies.store.getState(), id);
    if (!tracker) return;
    const result = await dependencies.service.toggle(id);
    operationMessage(
      result,
      dependencies.shell,
      tracker.active ? 'Tracker hidden' : 'Tracker activated'
    );
  };

  const handleManagementClick = (event: Event): void => {
    if (!(event.target instanceof Element)) return;
    const toggle = event.target.closest<HTMLElement>('[data-toggle-tracker]');
    if (toggle?.dataset.toggleTracker) {
      void toggleTracker(toggle.dataset.toggleTracker);
      return;
    }
    const edit = event.target.closest<HTMLElement>('[data-edit-tracker]');
    if (edit?.dataset.editTracker) {
      openModal(edit.dataset.editTracker);
      return;
    }
    const add = event.target.closest<HTMLElement>('[data-add-for-tracker]');
    if (add?.dataset.addForTracker) {
      dependencies.openLog(add.dataset.addForTracker);
      return;
    }
    const remove = event.target.closest<HTMLElement>('[data-delete-tracker]');
    if (remove?.dataset.deleteTracker) void deleteTracker(remove.dataset.deleteTracker);
  };
  const handleColorClick = (event: Event): void => {
    if (!(event.target instanceof HTMLElement)) return;
    const color = event.target.closest<HTMLElement>('[data-color]')?.dataset.color;
    if (color === undefined || !TRACKER_COLORS.some(candidate => candidate === color)) return;
    selectedColor = color;
    renderColors();
  };
  const handleOpen = (): void => openModal();
  const handleHeader = (): void => {
    if (headerAction.dataset.actionType === 'tracker') openModal();
  };
  const handleInputType = (): void => renderInputType();
  const handleSubmit = (event: Event): void => void saveTracker(event);

  management.addEventListener('click', handleManagementClick);
  getElement('#trackerColors').addEventListener('click', handleColorClick);
  inputType.addEventListener('change', handleInputType);
  form.addEventListener('submit', handleSubmit);
  getElements<HTMLElement>('[data-open-tracker]').forEach(button => (
    button.addEventListener('click', handleOpen)
  ));
  headerAction.addEventListener('click', handleHeader);

  return {
    render(state) {
      management.innerHTML = state.trackers.length
        ? state.trackers.map(tracker => managementHtml(state, tracker)).join('')
        : emptyState();
    },
    openModal,
    destroy() {
      management.removeEventListener('click', handleManagementClick);
      getElement('#trackerColors').removeEventListener('click', handleColorClick);
      inputType.removeEventListener('change', handleInputType);
      form.removeEventListener('submit', handleSubmit);
      getElements<HTMLElement>('[data-open-tracker]').forEach(button => (
        button.removeEventListener('click', handleOpen)
      ));
      headerAction.removeEventListener('click', handleHeader);
    }
  };
}
