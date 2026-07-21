import type {
  AppState,
  OptionTrackingLog,
  Tracker,
  TrackerOption,
  TrackingLog,
  UnitTrackingLog
} from '../../domain/models';
import { formatDateHeading, formatDateTime, localDateKey } from '../../shared/dates';
import { getElement } from '../../shared/dom';
import { escapeHtml, formatValue, pluralUnit } from '../../shared/formatting';
import { renderIcons } from '../../shared/icons';

export interface HistoryFilters {
  trackerId: string;
  date: string;
  search: string;
}

export interface HistoryDependencies {
  openLogEditor(logId: string): void;
  deleteLog(logId: string): Promise<void>;
}

export interface HistoryController {
  render(state: Readonly<AppState>): void;
  destroy(): void;
}

function emptyState(icon: string, title: string, text: string): string {
  return `<div class="empty-state"><div class="emoji">${icon}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`;
}

function trackerById(state: Readonly<AppState>, id: string): Tracker | undefined {
  return state.trackers.find(tracker => tracker.id === id);
}

function optionForLog(
  state: Readonly<AppState>,
  log: OptionTrackingLog
): TrackerOption | undefined {
  const tracker = trackerById(state, log.trackerId);
  if (tracker?.inputType !== 'option') return undefined;
  return tracker.options.find(option => option.id === log.optionId);
}

export function filterHistoryLogs(
  state: Readonly<AppState>,
  filters: Readonly<HistoryFilters>
): TrackingLog[] {
  const search = filters.search.trim().toLowerCase();
  return [...state.logs]
    .sort(
      (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
    )
    .filter(log => (
      (filters.trackerId === 'all' || log.trackerId === filters.trackerId)
      && (!filters.date || localDateKey(log.occurredAt) === filters.date)
      && (
        !search
        || log.note.toLowerCase().includes(search)
        || (trackerById(state, log.trackerId)?.name ?? '').toLowerCase().includes(search)
      )
    ));
}

function activityRowHtml(
  state: Readonly<AppState>,
  log: TrackingLog
): string {
  const tracker = trackerById(state, log.trackerId);
  if (!tracker || tracker.inputType !== log.recordType) return '';
  const value = tracker.inputType === 'unit' && log.recordType === 'unit'
    ? `+${formatValue(log.value)} <span>${escapeHtml(pluralUnit(tracker.unit, log.value))}</span>`
    : log.recordType === 'option'
      ? escapeHtml(optionForLog(state, log)?.label ?? '')
      : '';
  if (!value) return '';
  return `<div class="activity-row"><div class="activity-main"><div class="activity-icon" style="color:${tracker.color}">${escapeHtml(tracker.icon)}</div><div style="min-width:0"><p class="activity-name">${escapeHtml(tracker.name)}</p><p class="activity-meta">${formatDateTime(log.occurredAt)}${log.note ? ` · ${escapeHtml(log.note)}` : ''}</p></div></div><div style="display:flex;align-items:center;gap:8px"><div class="activity-value">${value}</div><div class="row-actions"><button class="row-action" data-edit-log="${escapeHtml(log.id)}" title="Edit" aria-label="Edit record"><i data-lucide="pencil"></i></button><button class="row-action" data-delete-log="${escapeHtml(log.id)}" title="Delete" aria-label="Delete record"><i data-lucide="trash-2"></i></button></div></div></div>`;
}

export function createHistoryController(
  dependencies: HistoryDependencies
): HistoryController {
  const trackerFilter = getElement<HTMLSelectElement>('#historyTracker');
  const dateFilter = getElement<HTMLInputElement>('#historyDate');
  const searchFilter = getElement<HTMLInputElement>('#historySearch');
  const groups = getElement<HTMLElement>('#historyGroups');
  let currentState: Readonly<AppState> | null = null;

  const currentFilters = (): HistoryFilters => ({
    trackerId: trackerFilter.value || 'all',
    date: dateFilter.value,
    search: searchFilter.value
  });

  const renderHistory = (): void => {
    if (currentState === null) return;
    const logs = filterHistoryLogs(currentState, currentFilters());
    const unitLogs = logs.filter((log): log is UnitTrackingLog => {
      const tracker = trackerById(currentState as Readonly<AppState>, log.trackerId);
      return log.recordType === 'unit' && tracker?.inputType === 'unit';
    });
    const totalValue = unitLogs.reduce((total, log) => total + log.value, 0);
    const units = new Set(unitLogs.map(log => {
      const tracker = trackerById(currentState as Readonly<AppState>, log.trackerId);
      return tracker?.inputType === 'unit' ? tracker.unit : undefined;
    }));
    const hasCompatibleNumericTotal = unitLogs.length === logs.length && units.size <= 1;
    const valueCaption = hasCompatibleNumericTotal
      ? `${formatValue(totalValue)} combined value`
      : `${logs.length} ${logs.length === 1 ? 'record' : 'records'} shown`;
    const trackerCount = new Set(logs.map(log => log.trackerId)).size;
    getElement('#historySummary').innerHTML = `<span class="summary-chip">${logs.length} ${logs.length === 1 ? 'record' : 'records'}</span><span class="summary-chip">${valueCaption}</span><span class="summary-chip">${trackerCount} ${trackerCount === 1 ? 'tracker' : 'trackers'}</span>`;

    if (!logs.length) {
      groups.innerHTML = emptyState(
        '▤',
        'No matching records',
        'Try changing the filters or add a new record.'
      );
      return;
    }

    const groupedLogs = new Map<string, TrackingLog[]>();
    logs.forEach(log => {
      const dateKey = localDateKey(log.occurredAt);
      const group = groupedLogs.get(dateKey) ?? [];
      group.push(log);
      groupedLogs.set(dateKey, group);
    });
    groups.innerHTML = [...groupedLogs].map(([dateKey, dateLogs]) => (
      `<section><h3 class="history-date">${formatDateHeading(`${dateKey}T12:00:00`)}</h3><div class="activity-list">${dateLogs.map(log => activityRowHtml(currentState as Readonly<AppState>, log)).join('')}</div></section>`
    )).join('');
    renderIcons(groups);
  };

  const handleGroupsClick = (event: Event): void => {
    if (!(event.target instanceof Element)) return;
    const editLog = event.target.closest<HTMLElement>('[data-edit-log]');
    if (editLog?.dataset.editLog) {
      dependencies.openLogEditor(editLog.dataset.editLog);
      return;
    }
    const deleteLog = event.target.closest<HTMLElement>('[data-delete-log]');
    if (deleteLog?.dataset.deleteLog) {
      void dependencies.deleteLog(deleteLog.dataset.deleteLog);
    }
  };
  const handleFilterChange = (): void => renderHistory();

  groups.addEventListener('click', handleGroupsClick);
  trackerFilter.addEventListener('change', handleFilterChange);
  dateFilter.addEventListener('change', handleFilterChange);
  searchFilter.addEventListener('input', handleFilterChange);

  return {
    render(state) {
      currentState = state;
      const previousTracker = trackerFilter.value;
      trackerFilter.innerHTML = `<option value="all">All trackers</option>${state.trackers.map(tracker => (
        `<option value="${escapeHtml(tracker.id)}">${escapeHtml(tracker.name)}</option>`
      )).join('')}`;
      if ([...trackerFilter.options].some(option => option.value === previousTracker)) {
        trackerFilter.value = previousTracker;
      }
      renderHistory();
    },
    destroy() {
      groups.removeEventListener('click', handleGroupsClick);
      trackerFilter.removeEventListener('change', handleFilterChange);
      dateFilter.removeEventListener('change', handleFilterChange);
      searchFilter.removeEventListener('input', handleFilterChange);
      currentState = null;
    }
  };
}
