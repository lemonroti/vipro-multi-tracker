function emptyState(icon, title, text) { return `<div class="empty-state"><div class="emoji">${icon}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`; }

async function addLog(trackerId, value, options = {}) {
  const tracker = getTracker(trackerId);
  if (!tracker || !Number.isFinite(Number(value)) || Number(value) <= 0) return;
  const before = clone(state);
  const log = { id: uid(), trackerId, value: Number(value), occurredAt: options.occurredAt || new Date().toISOString(), note: options.note || '', source: 'website' };
  const operation = { id: uid(), type: 'upsertLog', payload: log, queuedAt: new Date().toISOString() };
  applyOperationLocally(operation);
  saveCache(); renderAll();
  const result = await persistOperation(operation);
  if (result.error) { state = before; saveCache(); renderAll(); showToast(result.error.message); return; }
  lastUndo = { type: 'remove-created-log', log: clone(log) };
  showToast(`${tracker.name}: +${formatValue(value)} recorded${result.queued ? ' offline' : ''}`, true);
}

async function updateLog(logId, data) {
  const existing = state.logs.find(log => log.id === logId); if (!existing) return false;
  const before = clone(state);
  const updated = { ...existing, ...data };
  return commitOptimistic({ id: uid(), type: 'upsertLog', payload: updated, queuedAt: new Date().toISOString() }, 'Record updated', before);
}

async function deleteLog(logId) {
  const log = state.logs.find(item => item.id === logId); if (!log) return;
  if (state.settings.confirmDelete !== false && !confirm('Delete this record?')) return;
  const before = clone(state);
  const operation = { id: uid(), type: 'deleteLog', payload: { id: log.id }, queuedAt: new Date().toISOString() };
  applyOperationLocally(operation); saveCache(); renderAll();
  const result = await persistOperation(operation);
  if (result.error) { state = before; saveCache(); renderAll(); showToast(result.error.message); return; }
  lastUndo = { type: 'restore-deleted-log', log: clone(log) };
  showToast(`Record deleted${result.queued ? ' offline' : ''}`, true);
}

async function toggleTracker(trackerId) {
  const tracker = getTracker(trackerId); if (!tracker) return;
  const before = clone(state);
  const updated = { ...tracker, active: !tracker.active };
  await commitOptimistic({ id: uid(), type: 'upsertTracker', payload: updated, queuedAt: new Date().toISOString() }, updated.active ? 'Tracker activated' : 'Tracker hidden', before);
}

async function deleteTracker(trackerId) {
  const tracker = getTracker(trackerId); if (!tracker) return;
  const relatedLogs = logsForTracker(trackerId);
  const message = relatedLogs.length ? `Delete ${tracker.name} and its ${relatedLogs.length} records?` : `Delete ${tracker.name}?`;
  if (state.settings.confirmDelete !== false && !confirm(message)) return;
  const before = clone(state);
  await commitOptimistic({ id: uid(), type: 'deleteTracker', payload: { id: tracker.id }, queuedAt: new Date().toISOString() }, 'Tracker deleted', before);
}

function openTrackerModal(trackerId = '') {
  const tracker = trackerId ? getTracker(trackerId) : null;
  $('#trackerModalTitle').textContent = tracker ? 'Edit tracker' : 'Create tracker';
  $('#trackerEditId').value = tracker?.id || '';
  $('#trackerName').value = tracker?.name || '';
  $('#trackerIcon').value = tracker?.icon || '✦';
  $('#trackerUnit').value = tracker?.unit || '';
  $('#trackerGoal').value = tracker?.goal ?? '';
  $('#trackerPresets').value = tracker?.presets?.join(', ') || '1';
  selectedTrackerColor = tracker?.color || COLORS[state.trackers.length % COLORS.length];
  renderColorOptions(); openModal('trackerModal');
  setTimeout(() => $('#trackerName').focus(), 50);
}

function renderColorOptions() {
  $('#trackerColors').innerHTML = COLORS.map(color => `<button type="button" class="color-option ${color === selectedTrackerColor ? 'selected' : ''}" style="background:${color}" data-color="${color}" aria-label="Choose ${color}"></button>`).join('');
  $('#trackerColors').querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', () => { selectedTrackerColor = button.dataset.color; renderColorOptions(); }));
}

function populateLogTrackerOptions() {
  const select = $('#logTracker');
  const previous = select.value;
  select.innerHTML = state.trackers.map(tracker => `<option value="${escapeHtml(tracker.id)}">${escapeHtml(tracker.name)} (${escapeHtml(tracker.unit)})</option>`).join('');
  if (state.trackers.some(tracker => tracker.id === previous)) select.value = previous;
}

function openLogModal({ trackerId = '', logId = '' } = {}) {
  if (!state.trackers.length) { showToast('Create a tracker first'); switchView('trackers'); return; }
  const log = logId ? state.logs.find(item => item.id === logId) : null;
  $('#logModalTitle').textContent = log ? 'Edit record' : 'Add record';
  $('#logEditId').value = log?.id || '';
  populateLogTrackerOptions();
  $('#logTracker').value = log?.trackerId || trackerId || state.trackers[0].id;
  const tracker = getTracker($('#logTracker').value);
  $('#logValue').value = log?.value ?? tracker?.presets?.[0] ?? 1;
  $('#logDateTime').value = toLocalInputValue(log?.occurredAt || new Date());
  $('#logNote').value = log?.note || '';
  openModal('logModal'); setTimeout(() => $('#logValue').focus(), 50);
}

function openModal(id) { document.body.style.overflow = 'hidden'; $(`#${id}`).hidden = false; }
function closeModal(id) { document.body.style.overflow = ''; $(`#${id}`).hidden = true; }

function showToast(message, canUndo = false) {
  clearTimeout(toastTimer);
  $('#toastMessage').textContent = message;
  $('#toastUndo').hidden = !canUndo;
  $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3000);
}
