function setAuthMessage(message) { $('#authMessage').textContent = message || ''; }

async function fetchAllLogs() {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseClient
      .from('tracking_logs')
      .select('*')
      .order('occurred_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { data: rows, error: null };
}

async function loadCloudState() {
  if (!session || !navigator.onLine || isLoading) return;
  isLoading = true;
  setSyncStatus('Syncing...', 'busy');

  const [trackersResult, logsResult, settingsResult] = await Promise.all([
    supabaseClient.from('trackers').select('*').order('sort_order').order('created_at'),
    fetchAllLogs(),
    supabaseClient.from('user_settings').select('*').maybeSingle()
  ]);

  const error = trackersResult.error || logsResult.error || settingsResult.error;
  if (error) {
    setSyncStatus('Using local cache', 'offline');
    showToast(error.message || 'Could not load cloud data');
    isLoading = false;
    return;
  }

  if (!(trackersResult.data || []).length && !settingsResult.data && !loadQueue().length) {
    const defaults = makeDefaultTrackers();
    const { error: seedError } = await supabaseClient.from('trackers').insert(defaults.map(trackerToDb));
    if (!seedError) {
      await supabaseClient.from('user_settings').upsert(settingsToDb({ theme: 'system', confirmDelete: true }), { onConflict: 'user_id' });
      trackersResult.data = defaults.map(tracker => ({ ...trackerToDb(tracker), created_at: tracker.createdAt }));
      settingsResult.data = { theme: 'system', preferences: { confirmDelete: true } };
    }
  }

  const cloud = {
    version: 3,
    trackers: (trackersResult.data || []).map(trackerFromDb),
    logs: (logsResult.data || []).map(logFromDb),
    settings: settingsResult.data ? {
      theme: settingsResult.data.theme || 'system',
      confirmDelete: settingsResult.data.preferences?.confirmDelete !== false
    } : { theme: 'system', confirmDelete: true }
  };

  state = normalizeState(cloud);
  for (const operation of loadQueue()) applyOperationLocally(operation, state);
  saveCache();
  renderAll();
  setSyncStatus(loadQueue().length ? `${loadQueue().length} pending` : 'Synced', loadQueue().length ? 'offline' : 'online');
  isLoading = false;
}

async function executeOperation(operation) {
  const { type, payload } = operation;
  let response;
  if (type === 'upsertTracker') response = await supabaseClient.from('trackers').upsert(trackerToDb(payload), { onConflict: 'id' });
  if (type === 'deleteTracker') response = await supabaseClient.from('trackers').delete().eq('id', payload.id);
  if (type === 'upsertLog') response = await supabaseClient.from('tracking_logs').upsert(logToDb(payload), { onConflict: 'id' });
  if (type === 'deleteLog') response = await supabaseClient.from('tracking_logs').delete().eq('id', payload.id);
  if (type === 'saveSettings') response = await supabaseClient.from('user_settings').upsert(settingsToDb(payload), { onConflict: 'user_id' });
  return response?.error || null;
}

function isNetworkError(error) {
  return !navigator.onLine || /fetch|network|timeout|connection/i.test(error?.message || '');
}

async function persistOperation(operation) {
  if (!navigator.onLine) {
    const queue = loadQueue();
    queue.push(operation);
    saveQueue(queue);
    return { queued: true, error: null };
  }

  const error = await executeOperation(operation);
  if (error && isNetworkError(error)) {
    const queue = loadQueue();
    queue.push(operation);
    saveQueue(queue);
    return { queued: true, error: null };
  }
  return { queued: false, error };
}

async function syncQueue() {
  if (!session || !navigator.onLine) return;
  const queue = loadQueue();
  if (!queue.length) { updateConnectionUI(); return; }

  setSyncStatus(`Syncing ${queue.length} change${queue.length === 1 ? '' : 's'}...`, 'busy');
  const remaining = [];
  for (const operation of queue) {
    const error = await executeOperation(operation);
    if (error) remaining.push(operation);
  }
  saveQueue(remaining);
  if (remaining.length) {
    setSyncStatus(`${remaining.length} pending`, 'offline');
    showToast('Some offline changes still need to sync');
  } else {
    setSyncStatus('Synced', 'online');
    showToast('Offline changes synced');
  }
}

function applyOperationLocally(operation, target = state) {
  const { type, payload } = operation;
  if (type === 'upsertTracker') {
    const index = target.trackers.findIndex(item => item.id === payload.id);
    if (index >= 0) target.trackers[index] = clone(payload); else target.trackers.push(clone(payload));
  }
  if (type === 'deleteTracker') {
    target.trackers = target.trackers.filter(item => item.id !== payload.id);
    target.logs = target.logs.filter(log => log.trackerId !== payload.id);
  }
  if (type === 'upsertLog') {
    const index = target.logs.findIndex(item => item.id === payload.id);
    if (index >= 0) target.logs[index] = clone(payload); else target.logs.push(clone(payload));
  }
  if (type === 'deleteLog') target.logs = target.logs.filter(item => item.id !== payload.id);
  if (type === 'saveSettings') target.settings = clone(payload);
}

async function commitOptimistic(operation, message, rollbackState = null) {
  applyOperationLocally(operation);
  saveCache();
  renderAll();
  const result = await persistOperation(operation);
  if (result.error) {
    if (rollbackState) state = rollbackState;
    saveCache();
    renderAll();
    showToast(result.error.message || 'Could not save change');
    return false;
  }
  showToast(result.queued ? `${message} — saved offline` : message);
  updateConnectionUI();
  return true;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}
function localDateKey(date = new Date()) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function toLocalInputValue(date) { const d = new Date(date); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function activeTrackers() { return state.trackers.filter(tracker => tracker.active); }
function getTracker(id) { return state.trackers.find(tracker => tracker.id === id); }
function logsNewest() { return [...state.logs].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)); }
function logsForTracker(id) { return state.logs.filter(log => log.trackerId === id); }
function totalForDate(trackerId, dateKey) { return state.logs.filter(log => log.trackerId === trackerId && localDateKey(log.occurredAt) === dateKey).reduce((sum, log) => sum + Number(log.value), 0); }
function totalToday(trackerId) { return totalForDate(trackerId, localDateKey()); }
function pluralUnit(unit, value) { const lower = unit.toLowerCase(); if (lower === 'minute') return Number(value) === 1 ? 'minute' : 'minutes'; if (lower === 'cigarette') return Number(value) === 1 ? 'cigarette' : 'cigarettes'; if (lower === 'time') return Number(value) === 1 ? 'time' : 'times'; return unit; }
function formatValue(value) { return Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(2).replace(/\.00$/, ''); }
function formatDateTime(date) { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date)); }
function formatDateHeading(date) { const d = new Date(date); const key = localDateKey(d); if (key === localDateKey()) return 'Today'; const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); if (key === localDateKey(yesterday)) return 'Yesterday'; return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d); }
function timeAgo(date) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000)); if (seconds < 10) return 'just now'; if (seconds < 60) return `${seconds}s ago`; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; return `${Math.floor(hours / 24)}d ago`; }

function updateGreeting() {
  const hour = new Date().getHours();
  $('#pageEyebrow').textContent = currentView === 'dashboard' ? (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') : 'My Tracker';
}

function applyTheme(preference = state.settings.theme || 'system') {
  const resolved = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = resolved;
  if ($('#themeSelect')) $('#themeSelect').value = preference;
}

function switchView(view) {
  if (!pageMeta[view]) return;
  currentView = view;
  $$('.view').forEach(section => { section.hidden = section.id !== `view-${view}`; });
  $$('[data-nav]').forEach(button => button.classList.toggle('active', button.dataset.nav === view));
  $('#pageTitle').textContent = pageMeta[view].title;
  const action = $('#headerAction');
  action.textContent = pageMeta[view].action;
  action.hidden = !pageMeta[view].action;
  action.dataset.actionType = pageMeta[view].actionType;
  updateGreeting();
  if (view === 'history') renderHistory();
  if (view === 'trackers') renderTrackerManagement();
  if (view === 'settings') renderSettings();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAll() {
  applyTheme();
  renderDashboard();
  renderHistoryFilters();
  renderHistory();
  renderTrackerManagement();
  renderSettings();
  populateLogTrackerOptions();
  updateGreeting();
  updateConnectionUI();
}
