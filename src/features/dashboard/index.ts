import type {
  AppState,
  OptionTrackingLog,
  Tracker,
  TrackerOption,
  TrackingLog,
  UnitTracker,
  UnitTrackingLog
} from '../../domain/models';
import {
  formatDateTime,
  localDateKey,
  timeAgo
} from '../../shared/dates';
import { getElement } from '../../shared/dom';
import { escapeHtml, formatValue, pluralUnit } from '../../shared/formatting';
import { renderIcons } from '../../shared/icons';

export interface DashboardDependencies {
  addQuickLog(trackerId: string, value: number): Promise<void>;
  addQuickOptionLog(trackerId: string, optionId: string): Promise<void>;
  openCustomLog(trackerId: string): void;
  openTrackerEditor(trackerId: string): void;
}

export interface DashboardController {
  render(state: Readonly<AppState>): void;
  destroy(): void;
}

function emptyState(icon: string, title: string, text: string): string {
  return `<div class="empty-state"><div class="emoji">${icon}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`;
}

function optionForLog(
  state: Readonly<AppState>,
  log: OptionTrackingLog
): TrackerOption | undefined {
  const tracker = state.trackers.find(candidate => (
    candidate.id === log.trackerId && candidate.inputType === 'option'
  ));
  return tracker?.options.find(option => option.id === log.optionId);
}

function trackerForLog(
  state: Readonly<AppState>,
  log: TrackingLog
): Tracker | undefined {
  const tracker = state.trackers.find(candidate => candidate.id === log.trackerId);
  if (!tracker || tracker.inputType !== log.recordType) return undefined;
  if (log.recordType === 'option' && !optionForLog(state, log)) return undefined;
  return tracker;
}

function newestLogs(state: Readonly<AppState>): TrackingLog[] {
  return state.logs.filter(log => trackerForLog(state, log) !== undefined).sort(
    (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
  );
}

function getTracker(state: Readonly<AppState>, id: string): Tracker | undefined {
  return state.trackers.find(tracker => tracker.id === id);
}

function dailyMetric(
  state: Readonly<AppState>,
  tracker: Tracker,
  dateKey: string
): number {
  if (tracker.inputType === 'unit') {
    return state.logs
      .filter((log): log is UnitTrackingLog => (
        log.recordType === 'unit'
        && log.trackerId === tracker.id
        && localDateKey(log.occurredAt) === dateKey
      ))
      .reduce((total, log) => total + log.value, 0);
  }
  return state.logs.filter(log => (
    log.recordType === 'option'
    && log.trackerId === tracker.id
    && localDateKey(log.occurredAt) === dateKey
    && optionForLog(state, log) !== undefined
  )).length;
}

function activityRowHtml(state: Readonly<AppState>, log: TrackingLog): string {
  const tracker = trackerForLog(state, log);
  if (!tracker) return '';
  const value = tracker.inputType === 'unit' && log.recordType === 'unit'
    ? `+${formatValue(log.value)} <span>${escapeHtml(pluralUnit(tracker.unit, log.value))}</span>`
    : log.recordType === 'option'
      ? escapeHtml(optionForLog(state, log)?.label ?? '')
      : '';
  if (!value) return '';
  return `<div class="activity-row"><div class="activity-main"><div class="activity-icon" style="color:${tracker.color}">${escapeHtml(tracker.icon)}</div><div style="min-width:0"><p class="activity-name">${escapeHtml(tracker.name)}</p><p class="activity-meta">${formatDateTime(log.occurredAt)}${log.note ? ` · ${escapeHtml(log.note)}` : ''}</p></div></div><div style="display:flex;align-items:center;gap:8px"><div class="activity-value">${value}</div></div></div>`;
}

function unitTrackerCardHtml(
  state: Readonly<AppState>,
  sortedLogs: readonly TrackingLog[],
  tracker: UnitTracker
): string {
  const total = dailyMetric(state, tracker, localDateKey());
  const latest = sortedLogs.find((log): log is UnitTrackingLog => (
    log.trackerId === tracker.id && log.recordType === 'unit'
  ));
  const percent = tracker.goal
    ? Math.min(100, Math.round((total / tracker.goal) * 100))
    : Math.min(100, total * 8);
  const goalText = tracker.goal
    ? `Goal ${formatValue(tracker.goal)} ${escapeHtml(pluralUnit(tracker.unit, tracker.goal))}`
    : 'No daily goal';
  const quickActions = tracker.presets.map(value => (
    `<button class="button quick-button" style="background:${tracker.color}" data-quick-log="${escapeHtml(tracker.id)}" data-value="${value}">+${formatValue(value)}${tracker.unit.toLowerCase() === 'minute' ? ' min' : ''}</button>`
  )).join('');

  return `<article class="card tracker-card"><div class="tracker-top"><div class="tracker-heading"><div class="tracker-ident"><div class="tracker-icon" style="background:${tracker.color}1c;color:${tracker.color}">${escapeHtml(tracker.icon)}</div><div><h3>${escapeHtml(tracker.name)}</h3><p>${latest ? `Last ${timeAgo(latest.occurredAt)}` : 'No entry yet'}</p></div></div><button class="row-action" data-edit-from-card="${escapeHtml(tracker.id)}" title="Edit tracker" aria-label="Edit tracker"><i data-lucide="ellipsis"></i></button></div><div class="today-total"><div><span class="number">${formatValue(total)}</span> <span class="unit">${escapeHtml(pluralUnit(tracker.unit, total))}</span></div><div class="goal-copy">${goalText}</div></div><div class="progress-track"><div class="progress-fill" style="width:${percent}%;background:${tracker.color}"></div></div></div><div class="quick-actions">${quickActions}<button class="button custom-button" data-custom-log="${escapeHtml(tracker.id)}">Custom</button></div></article>`;
}

function optionTrackerCardHtml(
  state: Readonly<AppState>,
  sortedLogs: readonly TrackingLog[],
  tracker: Extract<Tracker, { inputType: 'option' }>
): string {
  const total = dailyMetric(state, tracker, localDateKey());
  const latest = sortedLogs.find((log): log is OptionTrackingLog => (
    log.trackerId === tracker.id
    && log.recordType === 'option'
    && optionForLog(state, log) !== undefined
  ));
  const latestOption = latest ? optionForLog(state, latest) : undefined;
  const quickActions = tracker.options.map(option => (
    `<button class="button quick-button option-quick-button" style="background:${tracker.color}" data-quick-option="${escapeHtml(tracker.id)}" data-option-id="${escapeHtml(option.id)}">${escapeHtml(option.label)}</button>`
  )).join('');
  const latestCopy = latest && latestOption
    ? `${escapeHtml(latestOption.label)} · ${timeAgo(latest.occurredAt)}`
    : 'No entry yet';

  return `<article class="card tracker-card"><div class="tracker-top"><div class="tracker-heading"><div class="tracker-ident"><div class="tracker-icon" style="background:${tracker.color}1c;color:${tracker.color}">${escapeHtml(tracker.icon)}</div><div><h3>${escapeHtml(tracker.name)}</h3><p>${latestCopy}</p></div></div><button class="row-action" data-edit-from-card="${escapeHtml(tracker.id)}" title="Edit tracker" aria-label="Edit tracker"><i data-lucide="ellipsis"></i></button></div><div class="today-total"><div><span class="number">${formatValue(total)}</span> <span class="unit">${total === 1 ? 'record today' : 'records today'}</span></div></div></div><div class="quick-actions">${quickActions}<button class="button custom-button" data-custom-log="${escapeHtml(tracker.id)}">Custom</button></div></article>`;
}

function trackerCardHtml(
  state: Readonly<AppState>,
  sortedLogs: readonly TrackingLog[],
  tracker: Tracker
): string {
  return tracker.inputType === 'unit'
    ? unitTrackerCardHtml(state, sortedLogs, tracker)
    : optionTrackerCardHtml(state, sortedLogs, tracker);
}

export function createDashboardController(
  dependencies: DashboardDependencies
): DashboardController {
  const trackerGrid = getElement<HTMLElement>('#dashboardTrackerGrid');
  const chartTracker = getElement<HTMLSelectElement>('#dashboardChartTracker');
  let currentState: Readonly<AppState> | null = null;

  const renderChart = (): void => {
    if (currentState === null) return;
    const activeTrackers = currentState.trackers.filter(tracker => tracker.active);
    const trackerId = chartTracker.value || activeTrackers[0]?.id;
    const tracker = trackerId === undefined
      ? undefined
      : getTracker(currentState, trackerId);
    const chart = getElement('#dashboardChart');
    if (!tracker) {
      chart.innerHTML = emptyState('⌁', 'No chart available', 'Add an active tracker first.');
      return;
    }

    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        date,
        total: dailyMetric(currentState as Readonly<AppState>, tracker, localDateKey(date))
      };
    });
    const maximum = Math.max(...days.map(day => day.total), 1);
    chart.innerHTML = days.map(day => {
      const height = Math.max(
        day.total ? 8 : 3,
        Math.round((day.total / maximum) * 100)
      );
      const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day.date);
      const metricLabel = tracker.inputType === 'unit'
        ? `${formatValue(day.total)} ${escapeHtml(pluralUnit(tracker.unit, day.total))}`
        : `${formatValue(day.total)} ${day.total === 1 ? 'record' : 'records'}`;
      return `<div class="chart-column"><div class="bar-area"><div class="bar" style="height:${height}%;background:${tracker.color}" data-label="${metricLabel}"></div></div><div class="bar-label">${dayLabel}</div></div>`;
    }).join('');
  };

  const handleTrackerClick = (event: Event): void => {
    if (!(event.target instanceof Element)) return;
    const quickLog = event.target.closest<HTMLElement>('[data-quick-log]');
    if (quickLog?.dataset.quickLog) {
      const value = Number(quickLog.dataset.value);
      if (Number.isFinite(value)) {
        void dependencies.addQuickLog(quickLog.dataset.quickLog, value);
      }
      return;
    }

    const quickOption = event.target.closest<HTMLElement>('[data-quick-option]');
    if (quickOption?.dataset.quickOption && quickOption.dataset.optionId) {
      void dependencies.addQuickOptionLog(
        quickOption.dataset.quickOption,
        quickOption.dataset.optionId
      );
      return;
    }

    const customLog = event.target.closest<HTMLElement>('[data-custom-log]');
    if (customLog?.dataset.customLog) {
      dependencies.openCustomLog(customLog.dataset.customLog);
      return;
    }

    const editTracker = event.target.closest<HTMLElement>('[data-edit-from-card]');
    if (editTracker?.dataset.editFromCard) {
      dependencies.openTrackerEditor(editTracker.dataset.editFromCard);
    }
  };

  trackerGrid.addEventListener('click', handleTrackerClick);
  chartTracker.addEventListener('change', renderChart);

  return {
    render(state) {
      currentState = state;
      const today = localDateKey();
      const todaysLogs = state.logs.filter(log => (
        localDateKey(log.occurredAt) === today && trackerForLog(state, log) !== undefined
      ));
      const sortedLogs = newestLogs(state);
      const newest = sortedLogs[0];
      const activeTrackers = state.trackers.filter(tracker => tracker.active);

      getElement('#statTodayEntries').textContent = String(todaysLogs.length);
      getElement('#statTodayCaption').textContent = todaysLogs.length
        ? todaysLogs.every((log): log is UnitTrackingLog => log.recordType === 'unit')
          ? `${formatValue(todaysLogs.reduce((total, log) => total + log.value, 0))} total value logged`
          : `${todaysLogs.length} ${todaysLogs.length === 1 ? 'record' : 'records'} logged today`
        : 'Nothing logged yet';
      getElement('#statActiveTrackers').textContent = String(activeTrackers.length);
      getElement('#statLastActivity').textContent = newest
        ? timeAgo(newest.occurredAt)
        : 'No activity';
      getElement('#statLastCaption').textContent = newest
        ? `${getTracker(state, newest.trackerId)?.name || 'Unknown tracker'} · ${formatDateTime(newest.occurredAt)}`
        : 'Start with a quick button below';

      trackerGrid.classList.toggle('three-up', activeTrackers.length >= 3);
      trackerGrid.innerHTML = activeTrackers.length
        ? activeTrackers.map(tracker => trackerCardHtml(state, sortedLogs, tracker)).join('')
        : emptyState(
          '◫',
          'No active trackers',
          'Create or reactivate a tracker to start recording.'
        );
      renderIcons(trackerGrid);

      const recent = sortedLogs.slice(0, 6);
      getElement('#dashboardActivity').innerHTML = recent.length
        ? recent.map(log => activityRowHtml(state, log)).join('')
        : emptyState(
          '＋',
          'No records yet',
          'Use a quick record button to create your first entry.'
        );

      const previousTracker = chartTracker.value;
      chartTracker.innerHTML = activeTrackers.map(tracker => (
        `<option value="${escapeHtml(tracker.id)}">${escapeHtml(tracker.name)}</option>`
      )).join('');
      if (activeTrackers.some(tracker => tracker.id === previousTracker)) {
        chartTracker.value = previousTracker;
      }
      renderChart();
    },
    destroy() {
      trackerGrid.removeEventListener('click', handleTrackerClick);
      chartTracker.removeEventListener('change', renderChart);
      currentState = null;
    }
  };
}
