async function resetEverything() {
  if (!confirm('Reset the full tracker? All records and custom trackers will be removed.')) return;
  if (!navigator.onLine) { showToast('Connect to the internet before resetting'); return; }
  try {
    await deleteAllCloudData();
    const defaults = makeDefaultTrackers();
    const { error } = await supabaseClient.from('trackers').insert(defaults.map(trackerToDb));
    if (error) throw error;
    state = { version: 3, trackers: defaults, logs: [], settings: { theme: 'system', confirmDelete: true } };
    await supabaseClient.from('user_settings').upsert(settingsToDb(state.settings), { onConflict: 'user_id' });
    saveQueue([]); saveCache(); renderAll(); switchView('dashboard'); showToast('Tracker reset');
  } catch (error) { showToast(error.message || 'Reset failed'); }
}

function setSyncStatus(text, mode = 'online') {
  $('#syncBadgeText').textContent = text;
  $('#syncBadgeDot').classList.toggle('offline', mode === 'offline');
  if (mode === 'busy') $('#syncBadgeDot').classList.remove('offline');
}

function updateConnectionUI() {
  if (!session) return;
  const online = navigator.onLine;
  const pending = loadQueue().length;
  $('#offlineBanner').hidden = online;
  $('#sidebarStatusDot').classList.toggle('offline', !online || pending > 0);
  $('#syncBadgeDot').classList.toggle('offline', !online || pending > 0);
  $('#sidebarStatusTitle').textContent = !online ? 'Offline mode' : pending ? 'Sync pending' : 'Cloud sync active';
  $('#sidebarStatusText').textContent = !online ? 'Changes are kept on this device until the connection returns.' : pending ? `${pending} change${pending === 1 ? '' : 's'} will sync automatically.` : 'Changes are saved to Supabase and cached locally for offline use.';
  $('#syncBadgeText').textContent = !online ? 'Offline' : pending ? `${pending} pending` : 'Synced';
  renderStorageInfo();
}

function bindStaticEvents() {
  $('#authForm').addEventListener('submit', event => { void signIn(event); });
  $('#signUpBtn').addEventListener('click', () => { void signUp(); });
  $('#settingsSignOut').addEventListener('click', () => { void signOut(); });

  $$('[data-nav]').forEach(button => button.addEventListener('click', event => { event.preventDefault(); switchView(button.dataset.nav); history.replaceState(null, '', `#view-${button.dataset.nav}`); }));
  $$('[data-go]').forEach(button => button.addEventListener('click', () => { switchView(button.dataset.go); history.replaceState(null, '', `#view-${button.dataset.go}`); }));
  $('#headerAction').addEventListener('click', () => $('#headerAction').dataset.actionType === 'log' ? openLogModal() : openTrackerModal());
  $$('[data-open-tracker]').forEach(button => button.addEventListener('click', () => openTrackerModal()));
  $$('[data-open-log]').forEach(button => button.addEventListener('click', () => openLogModal()));

  $$('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
  $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop.id); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') $$('.modal-backdrop:not([hidden])').forEach(modal => closeModal(modal.id)); });

  $('#trackerForm').addEventListener('submit', async event => {
    event.preventDefault();
    const existingId = $('#trackerEditId').value;
    const presets = $('#trackerPresets').value.split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value) && value > 0).slice(0, 8);
    if (!presets.length) { showToast('Enter at least one valid quick value'); return; }
    const existing = existingId ? getTracker(existingId) : null;
    const tracker = {
      id: existingId || uid(), name: $('#trackerName').value.trim(), icon: $('#trackerIcon').value.trim() || '✦',
      unit: $('#trackerUnit').value.trim(), goal: $('#trackerGoal').value === '' ? null : Number($('#trackerGoal').value),
      presets, color: selectedTrackerColor, active: existing?.active ?? true,
      sortOrder: existing?.sortOrder ?? state.trackers.length, createdAt: existing?.createdAt || new Date().toISOString()
    };
    const before = clone(state);
    const ok = await commitOptimistic({ id: uid(), type: 'upsertTracker', payload: tracker, queuedAt: new Date().toISOString() }, existingId ? 'Tracker updated' : 'Tracker created', before);
    if (ok) closeModal('trackerModal');
  });

  $('#logForm').addEventListener('submit', async event => {
    event.preventDefault();
    const logId = $('#logEditId').value;
    const data = { trackerId: $('#logTracker').value, value: Number($('#logValue').value), occurredAt: new Date($('#logDateTime').value).toISOString(), note: $('#logNote').value.trim() };
    if (!Number.isFinite(data.value) || data.value <= 0) { showToast('Enter a valid value'); return; }
    if (logId) await updateLog(logId, data); else await addLog(data.trackerId, data.value, data);
    closeModal('logModal');
  });
  $('#logTracker').addEventListener('change', () => { const tracker = getTracker($('#logTracker').value); if (!$('#logEditId').value && tracker) $('#logValue').value = tracker.presets[0] || 1; });

  $('#dashboardChartTracker').addEventListener('change', renderDashboardChart);
  ['historyTracker', 'historyDate', 'historySearch'].forEach(id => $(`#${id}`).addEventListener(id === 'historySearch' ? 'input' : 'change', renderHistory));

  $('#themeSelect').addEventListener('change', async () => { state.settings.theme = $('#themeSelect').value; applyTheme(); saveCache(); await saveSettings(); });
  $('#confirmDeleteToggle').addEventListener('click', async () => { state.settings.confirmDelete = state.settings.confirmDelete === false; saveCache(); renderSettings(); await saveSettings(); });
  $('#syncNow').addEventListener('click', async () => { await syncQueue(); await loadCloudState(); });

  $('#exportJson').addEventListener('click', () => downloadFile(`my-tracker-backup-${localDateKey()}.json`, JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2), 'application/json'));
  $('#exportCsv').addEventListener('click', () => {
    const rows = [['ID', 'Tracker', 'Value', 'Unit', 'Occurred At', 'Note'], ...logsNewest().map(log => { const tracker = getTracker(log.trackerId); return [log.id, tracker?.name || '', log.value, tracker?.unit || '', log.occurredAt, log.note]; })];
    downloadFile(`my-tracker-records-${localDateKey()}.csv`, rows.map(row => row.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8');
  });
  $('#importFile').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const imported = normalizeState(JSON.parse(await file.text()));
      if (confirm(`Import ${imported.trackers.length} trackers and ${imported.logs.length} records? This replaces your current cloud data.`)) await replaceCloudState(imported);
    } catch { alert('This file is not a valid My Tracker JSON backup.'); }
    event.target.value = '';
  });
  $('#loadSampleData').addEventListener('click', () => { void loadSampleData(); });
  $('#clearLogs').addEventListener('click', () => { void clearAllLogs(); });
  $('#resetEverything').addEventListener('click', () => { void resetEverything(); });
  $('#toastUndo').addEventListener('click', () => { void undoLast(); });
  window.addEventListener('hashchange', () => { const view = location.hash.replace('#view-', ''); if (pageMeta[view]) switchView(view); });
}

void init();
