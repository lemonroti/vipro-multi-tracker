async function undoLast() {
  if (!lastUndo) return;
  const action = lastUndo;
  lastUndo = null;
  if (action.type === 'remove-created-log') {
    const operation = { id: uid(), type: 'deleteLog', payload: { id: action.log.id }, queuedAt: new Date().toISOString() };
    applyOperationLocally(operation); saveCache(); renderAll(); await persistOperation(operation);
  }
  if (action.type === 'restore-deleted-log') {
    const operation = { id: uid(), type: 'upsertLog', payload: action.log, queuedAt: new Date().toISOString() };
    applyOperationLocally(operation); saveCache(); renderAll(); await persistOperation(operation);
  }
  $('#toast').classList.remove('show');
  showToast('Undone');
}

async function saveSettings() {
  const before = clone(state);
  await commitOptimistic({ id: uid(), type: 'saveSettings', payload: clone(state.settings), queuedAt: new Date().toISOString() }, 'Settings saved', before);
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
function csvEscape(value) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

async function deleteAllCloudData() {
  const logs = await supabaseClient.from('tracking_logs').delete().eq('user_id', session.user.id);
  if (logs.error) throw logs.error;
  const trackers = await supabaseClient.from('trackers').delete().eq('user_id', session.user.id);
  if (trackers.error) throw trackers.error;
}

async function replaceCloudState(imported) {
  if (!navigator.onLine) { showToast('Connect to the internet before importing'); return false; }
  const remapped = blankState();
  const idMap = new Map();
  imported.trackers.forEach((tracker, index) => {
    const id = uid(); idMap.set(tracker.id, id);
    remapped.trackers.push({ ...tracker, id, sortOrder: index, createdAt: new Date().toISOString() });
  });
  remapped.logs = imported.logs.filter(log => idMap.has(log.trackerId)).map(log => ({ ...log, id: uid(), trackerId: idMap.get(log.trackerId), source: 'import' }));
  remapped.settings = imported.settings;

  setSyncStatus('Importing...', 'busy');
  try {
    await deleteAllCloudData();
    if (remapped.trackers.length) {
      const { error } = await supabaseClient.from('trackers').insert(remapped.trackers.map(trackerToDb));
      if (error) throw error;
    }
    for (let i = 0; i < remapped.logs.length; i += 500) {
      const { error } = await supabaseClient.from('tracking_logs').insert(remapped.logs.slice(i, i + 500).map(logToDb));
      if (error) throw error;
    }
    const { error } = await supabaseClient.from('user_settings').upsert(settingsToDb(remapped.settings), { onConflict: 'user_id' });
    if (error) throw error;
    saveQueue([]);
    await loadCloudState();
    showToast('Backup imported');
    return true;
  } catch (error) {
    showToast(error.message || 'Import failed');
    await loadCloudState();
    return false;
  }
}

async function loadSampleData() {
  if (!navigator.onLine) { showToast('Connect to the internet to load sample data'); return; }
  if (!state.trackers.length) {
    const defaults = makeDefaultTrackers();
    const { error } = await supabaseClient.from('trackers').insert(defaults.map(trackerToDb));
    if (error) { showToast(error.message); return; }
    state.trackers = defaults;
  }
  const now = new Date();
  const samples = [];
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const day = new Date(now); day.setDate(now.getDate() - dayOffset); day.setHours(9 + (dayOffset % 5), 15, 0, 0);
    const first = state.trackers[0];
    const second = state.trackers[1] || state.trackers[0];
    if (first) {
      const count = [4, 7, 5, 8, 3, 6, 2][6 - dayOffset];
      for (let i = 0; i < count; i++) { const d = new Date(day); d.setHours(10 + i * 2, (i * 11) % 60); samples.push({ id: uid(), trackerId: first.id, value: 1, occurredAt: d.toISOString(), note: i === 0 && dayOffset === 0 ? 'Morning' : '', source: 'sample' }); }
    }
    if (second) { const d = new Date(day); d.setHours(21, 30); samples.push({ id: uid(), trackerId: second.id, value: [10, 15, 20, 10, 30, 15, 25][6 - dayOffset], occurredAt: d.toISOString(), note: '', source: 'sample' }); }
  }
  const { error } = await supabaseClient.from('tracking_logs').insert(samples.map(logToDb));
  if (error) { showToast(error.message); return; }
  await loadCloudState(); showToast('Sample records added');
}

async function clearAllLogs() {
  if (!confirm('Delete all records but keep trackers?')) return;
  if (!navigator.onLine) { showToast('Connect to the internet to clear all records'); return; }
  const { error } = await supabaseClient.from('tracking_logs').delete().eq('user_id', session.user.id);
  if (error) { showToast(error.message); return; }
  state.logs = []; saveCache(); renderAll(); showToast('All records cleared');
}
