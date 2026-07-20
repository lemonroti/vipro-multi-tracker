function renderDashboard() {
  const today = localDateKey();
  const todaysLogs = state.logs.filter(log => localDateKey(log.occurredAt) === today);
  const newest = logsNewest()[0];
  $('#statTodayEntries').textContent = todaysLogs.length;
  $('#statTodayCaption').textContent = todaysLogs.length ? `${formatValue(todaysLogs.reduce((sum, log) => sum + Number(log.value), 0))} total value logged` : 'Nothing logged yet';
  $('#statActiveTrackers').textContent = activeTrackers().length;
  $('#statLastActivity').textContent = newest ? timeAgo(newest.occurredAt) : 'No activity';
  $('#statLastCaption').textContent = newest ? `${getTracker(newest.trackerId)?.name || 'Unknown tracker'} · ${formatDateTime(newest.occurredAt)}` : 'Start with a quick button below';

  const grid = $('#dashboardTrackerGrid');
  const trackers = activeTrackers();
  grid.classList.toggle('three-up', trackers.length >= 3);
  grid.innerHTML = trackers.length ? trackers.map(trackerCardHtml).join('') : emptyState('◫', 'No active trackers', 'Create or reactivate a tracker to start recording.');
  grid.querySelectorAll('[data-quick-log]').forEach(button => button.addEventListener('click', () => { void addLog(button.dataset.quickLog, Number(button.dataset.value)); }));
  grid.querySelectorAll('[data-custom-log]').forEach(button => button.addEventListener('click', () => openLogModal({ trackerId: button.dataset.customLog })));
  grid.querySelectorAll('[data-edit-from-card]').forEach(button => button.addEventListener('click', () => openTrackerModal(button.dataset.editFromCard)));

  const recent = logsNewest().slice(0, 6);
  $('#dashboardActivity').innerHTML = recent.length ? recent.map(log => activityRowHtml(log, false)).join('') : emptyState('＋', 'No records yet', 'Use a quick record button to create your first entry.');
  renderChartOptions();
  renderDashboardChart();
}

function trackerCardHtml(tracker) {
  const total = totalToday(tracker.id);
  const latest = logsNewest().find(log => log.trackerId === tracker.id);
  const percent = tracker.goal ? Math.min(100, Math.round((total / tracker.goal) * 100)) : Math.min(100, total * 8);
  const goalText = tracker.goal ? `Goal ${formatValue(tracker.goal)} ${escapeHtml(pluralUnit(tracker.unit, tracker.goal))}` : 'No daily goal';
  return `<article class="card tracker-card"><div class="tracker-top"><div class="tracker-heading"><div class="tracker-ident"><div class="tracker-icon" style="background:${tracker.color}1c;color:${tracker.color}">${escapeHtml(tracker.icon)}</div><div><h3>${escapeHtml(tracker.name)}</h3><p>${latest ? `Last ${timeAgo(latest.occurredAt)}` : 'No entry yet'}</p></div></div><button class="row-action" data-edit-from-card="${escapeHtml(tracker.id)}" title="Edit tracker">•••</button></div><div class="today-total"><div><span class="number">${formatValue(total)}</span> <span class="unit">${escapeHtml(pluralUnit(tracker.unit, total))}</span></div><div class="goal-copy">${goalText}</div></div><div class="progress-track"><div class="progress-fill" style="width:${percent}%;background:${tracker.color}"></div></div></div><div class="quick-actions">${tracker.presets.map(value => `<button class="button quick-button" style="background:${tracker.color}" data-quick-log="${escapeHtml(tracker.id)}" data-value="${value}">+${formatValue(value)}${tracker.unit.toLowerCase() === 'minute' ? ' min' : ''}</button>`).join('')}<button class="button custom-button" data-custom-log="${escapeHtml(tracker.id)}">Custom</button></div></article>`;
}

function activityRowHtml(log, withActions = true) {
  const tracker = getTracker(log.trackerId);
  if (!tracker) return '';
  return `<div class="activity-row"><div class="activity-main"><div class="activity-icon" style="color:${tracker.color}">${escapeHtml(tracker.icon)}</div><div style="min-width:0"><p class="activity-name">${escapeHtml(tracker.name)}</p><p class="activity-meta">${formatDateTime(log.occurredAt)}${log.note ? ` · ${escapeHtml(log.note)}` : ''}</p></div></div><div style="display:flex;align-items:center;gap:8px"><div class="activity-value">+${formatValue(log.value)} <span>${escapeHtml(pluralUnit(tracker.unit, log.value))}</span></div>${withActions ? `<div class="row-actions"><button class="row-action" data-edit-log="${escapeHtml(log.id)}" title="Edit">✎</button><button class="row-action" data-delete-log="${escapeHtml(log.id)}" title="Delete">✕</button></div>` : ''}</div></div>`;
}

function renderChartOptions() {
  const select = $('#dashboardChartTracker');
  const previous = select.value;
  select.innerHTML = activeTrackers().map(tracker => `<option value="${escapeHtml(tracker.id)}">${escapeHtml(tracker.name)}</option>`).join('');
  if (activeTrackers().some(tracker => tracker.id === previous)) select.value = previous;
}

function renderDashboardChart() {
  const trackerId = $('#dashboardChartTracker').value || activeTrackers()[0]?.id;
  const tracker = getTracker(trackerId);
  const chart = $('#dashboardChart');
  if (!tracker) { chart.innerHTML = emptyState('⌁', 'No chart available', 'Add an active tracker first.'); return; }
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (6 - index)); return { date, total: totalForDate(tracker.id, localDateKey(date)) }; });
  const max = Math.max(...days.map(day => day.total), 1);
  chart.innerHTML = days.map(day => { const height = Math.max(day.total ? 8 : 3, Math.round((day.total / max) * 100)); const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day.date); return `<div class="chart-column"><div class="bar-area"><div class="bar" style="height:${height}%;background:${tracker.color}" data-label="${formatValue(day.total)} ${escapeHtml(pluralUnit(tracker.unit, day.total))}"></div></div><div class="bar-label">${dayLabel}</div></div>`; }).join('');
}

function renderHistoryFilters() {
  const select = $('#historyTracker');
  const previous = select.value;
  select.innerHTML = `<option value="all">All trackers</option>${state.trackers.map(tracker => `<option value="${escapeHtml(tracker.id)}">${escapeHtml(tracker.name)}</option>`).join('')}`;
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
}

function getFilteredLogs() {
  const trackerId = $('#historyTracker').value || 'all';
  const date = $('#historyDate').value;
  const search = $('#historySearch').value.trim().toLowerCase();
  return logsNewest().filter(log => (trackerId === 'all' || log.trackerId === trackerId) && (!date || localDateKey(log.occurredAt) === date) && (!search || (log.note || '').toLowerCase().includes(search) || (getTracker(log.trackerId)?.name || '').toLowerCase().includes(search)));
}

function renderHistory() {
  const logs = getFilteredLogs();
  const totalValue = logs.reduce((sum, log) => sum + Number(log.value), 0);
  const trackerCount = new Set(logs.map(log => log.trackerId)).size;
  $('#historySummary').innerHTML = `<span class="summary-chip">${logs.length} ${logs.length === 1 ? 'record' : 'records'}</span><span class="summary-chip">${formatValue(totalValue)} combined value</span><span class="summary-chip">${trackerCount} ${trackerCount === 1 ? 'tracker' : 'trackers'}</span>`;
  const container = $('#historyGroups');
  if (!logs.length) { container.innerHTML = emptyState('▤', 'No matching records', 'Try changing the filters or add a new record.'); return; }
  const groups = logs.reduce((map, log) => { const key = localDateKey(log.occurredAt); (map[key] ||= []).push(log); return map; }, {});
  container.innerHTML = Object.entries(groups).map(([dateKey, groupLogs]) => `<section><h3 class="history-date">${formatDateHeading(`${dateKey}T12:00:00`)}</h3><div class="activity-list">${groupLogs.map(log => activityRowHtml(log, true)).join('')}</div></section>`).join('');
  container.querySelectorAll('[data-edit-log]').forEach(button => button.addEventListener('click', () => openLogModal({ logId: button.dataset.editLog })));
  container.querySelectorAll('[data-delete-log]').forEach(button => button.addEventListener('click', () => { void deleteLog(button.dataset.deleteLog); }));
}

function renderTrackerManagement() {
  const container = $('#trackerManageList');
  if (!state.trackers.length) { container.innerHTML = emptyState('◫', 'No trackers', 'Create your first tracker to begin.'); return; }
  container.innerHTML = state.trackers.map(tracker => { const count = logsForTracker(tracker.id).length; return `<article class="card manage-card ${tracker.active ? '' : 'inactive'}"><div class="manage-head"><div class="manage-details"><div class="tracker-icon" style="background:${tracker.color}1c;color:${tracker.color}">${escapeHtml(tracker.icon)}</div><div><h3>${escapeHtml(tracker.name)}</h3><p>${escapeHtml(tracker.unit)} · ${count} ${count === 1 ? 'record' : 'records'} · Quick values: ${tracker.presets.map(formatValue).join(', ')}</p></div></div><button class="toggle ${tracker.active ? 'on' : ''}" data-toggle-tracker="${escapeHtml(tracker.id)}" aria-label="Toggle tracker"></button></div><div class="manage-actions"><button class="button outline small" data-edit-tracker="${escapeHtml(tracker.id)}">Edit</button><button class="button outline small" data-add-for-tracker="${escapeHtml(tracker.id)}">Add record</button><button class="button danger small" data-delete-tracker="${escapeHtml(tracker.id)}">Delete</button></div></article>`; }).join('');
  container.querySelectorAll('[data-toggle-tracker]').forEach(button => button.addEventListener('click', () => { void toggleTracker(button.dataset.toggleTracker); }));
  container.querySelectorAll('[data-edit-tracker]').forEach(button => button.addEventListener('click', () => openTrackerModal(button.dataset.editTracker)));
  container.querySelectorAll('[data-add-for-tracker]').forEach(button => button.addEventListener('click', () => openLogModal({ trackerId: button.dataset.addForTracker })));
  container.querySelectorAll('[data-delete-tracker]').forEach(button => button.addEventListener('click', () => { void deleteTracker(button.dataset.deleteTracker); }));
}

function renderSettings() {
  $('#themeSelect').value = state.settings.theme || 'system';
  $('#confirmDeleteToggle').classList.toggle('on', state.settings.confirmDelete !== false);
  renderStorageInfo();
}

function renderStorageInfo() {
  if (!$('#storageInfo')) return;
  const pending = loadQueue().length;
  const bytes = new Blob([JSON.stringify(state)]).size;
  const size = bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`;
  $('#storageInfo').textContent = `${state.logs.length} records and ${state.trackers.length} trackers are stored in Supabase and cached locally (${size}).`;
  $('#syncInfo').textContent = pending ? `${pending} change${pending === 1 ? '' : 's'} waiting to sync.` : (navigator.onLine ? 'All local changes are synced.' : 'Offline with no pending changes.');
}
