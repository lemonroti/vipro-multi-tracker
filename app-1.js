const SUPABASE_URL = 'https://hqdjbdkxvexuduvqccpc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ufFPu9CzpyI9ROqCbDG6Lw_DKKGFPCl';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const COLORS = ['#334155', '#6d4aff', '#0f766e', '#c2410c', '#be185d', '#2563eb', '#7c2d12'];
const pageMeta = {
  dashboard: { title: 'Your daily tracking', action: '+ Add tracker', actionType: 'tracker' },
  history: { title: 'History', action: '+ Add record', actionType: 'log' },
  trackers: { title: 'Manage trackers', action: '+ New tracker', actionType: 'tracker' },
  settings: { title: 'Settings', action: '', actionType: '' }
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const clone = value => JSON.parse(JSON.stringify(value));
const uid = () => crypto.randomUUID();

let session = null;
let state = blankState();
let currentView = 'dashboard';
let selectedTrackerColor = COLORS[1];
let lastUndo = null;
let toastTimer = null;
let isLoading = false;

function blankState() {
  return { version: 3, trackers: [], logs: [], settings: { theme: 'system', confirmDelete: true } };
}

function makeDefaultTrackers() {
  const now = new Date().toISOString();
  return [
    { id: uid(), name: 'Smoking', unit: 'cigarette', icon: '🚬', color: '#334155', goal: 8, presets: [1], active: true, sortOrder: 0, createdAt: now },
    { id: uid(), name: '觀世音菩薩聖號', unit: 'minute', icon: '🙏', color: '#6d4aff', goal: 30, presets: [5, 10, 15], active: true, sortOrder: 1, createdAt: now }
  ];
}

function cacheKey() { return session ? `vipro-multi-tracker-cache-v2-${session.user.id}` : ''; }
function queueKey() { return session ? `vipro-multi-tracker-queue-v2-${session.user.id}` : ''; }

function loadCache() {
  if (!session) return blankState();
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    return saved ? normalizeState(saved) : blankState();
  } catch {
    return blankState();
  }
}

function saveCache() {
  if (!session) return;
  localStorage.setItem(cacheKey(), JSON.stringify(state));
  renderStorageInfo();
}

function loadQueue() {
  if (!session) return [];
  try { return JSON.parse(localStorage.getItem(queueKey()) || '[]'); }
  catch { return []; }
}

function saveQueue(queue) {
  if (!session) return;
  localStorage.setItem(queueKey(), JSON.stringify(queue));
  renderStorageInfo();
  updateConnectionUI();
}

function normalizeState(input) {
  const normalized = blankState();
  normalized.trackers = (input.trackers || []).map((tracker, index) => ({
    id: String(tracker.id || uid()),
    name: String(tracker.name || 'Untitled'),
    unit: String(tracker.unit || 'count'),
    icon: String(tracker.icon || '✦'),
    color: /^#[0-9a-f]{6}$/i.test(String(tracker.color || '')) ? String(tracker.color) : COLORS[index % COLORS.length],
    goal: tracker.goal === null || tracker.goal === '' || typeof tracker.goal === 'undefined' ? null : Number(tracker.goal),
    presets: (Array.isArray(tracker.presets) ? tracker.presets : [1]).map(Number).filter(value => Number.isFinite(value) && value > 0).slice(0, 8),
    active: tracker.active !== false,
    sortOrder: Number.isInteger(tracker.sortOrder) ? tracker.sortOrder : index,
    createdAt: tracker.createdAt || new Date().toISOString()
  }));
  normalized.logs = (input.logs || []).map(log => ({
    id: String(log.id || uid()),
    trackerId: String(log.trackerId),
    value: Number(log.value),
    occurredAt: log.occurredAt || new Date().toISOString(),
    note: String(log.note || ''),
    source: String(log.source || 'website')
  })).filter(log => Number.isFinite(log.value) && log.value > 0);
  normalized.settings = { theme: 'system', confirmDelete: true, ...(input.settings || {}) };
  return normalized;
}

function trackerFromDb(row) {
  return {
    id: row.id, name: row.name, unit: row.unit, icon: row.icon, color: row.color,
    goal: row.daily_goal === null ? null : Number(row.daily_goal),
    presets: (row.quick_values || [1]).map(Number), active: row.is_active,
    sortOrder: row.sort_order || 0, createdAt: row.created_at
  };
}

function trackerToDb(tracker) {
  return {
    id: tracker.id, user_id: session.user.id, name: tracker.name, unit: tracker.unit,
    icon: tracker.icon, color: tracker.color, daily_goal: tracker.goal,
    quick_values: tracker.presets, is_active: tracker.active, sort_order: tracker.sortOrder || 0
  };
}

function logFromDb(row) {
  return {
    id: row.id, trackerId: row.tracker_id, value: Number(row.value), occurredAt: row.occurred_at,
    note: row.note || '', source: row.source || 'website'
  };
}

function logToDb(log) {
  return {
    id: log.id, user_id: session.user.id, tracker_id: log.trackerId, value: log.value,
    occurred_at: log.occurredAt, note: log.note || null, source: log.source || 'website',
    client_id: log.id
  };
}

function settingsToDb(settings) {
  return {
    user_id: session.user.id,
    theme: settings.theme || 'system',
    preferences: { confirmDelete: settings.confirmDelete !== false },
    dashboard_layout: {}
  };
}

async function init() {
  bindStaticEvents();
  applyTheme('system');
  const { data } = await supabaseClient.auth.getSession();
  session = data.session;
  await handleSession();

  supabaseClient.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
    setTimeout(() => { void handleSession(); }, 0);
  });

  window.addEventListener('online', async () => {
    updateConnectionUI();
    if (session) {
      await syncQueue();
      await loadCloudState();
    }
  });
  window.addEventListener('offline', updateConnectionUI);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (state.settings.theme === 'system') applyTheme('system');
  });
}

async function handleSession() {
  if (!session) {
    $('#authScreen').hidden = false;
    $('#app').hidden = true;
    $('#mobileNav').hidden = true;
    state = blankState();
    return;
  }

  $('#authScreen').hidden = true;
  $('#app').hidden = false;
  $('#mobileNav').hidden = false;
  $('#accountEmail').textContent = session.user.email || 'Signed-in user';
  state = loadCache();
  renderAll();
  updateConnectionUI();
  await syncQueue();
  await loadCloudState();
}

async function signIn(event) {
  event.preventDefault();
  setAuthBusy(true, 'Signing in...');
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: $('#email').value.trim(), password: $('#password').value
  });
  if (error) setAuthMessage(error.message);
  setAuthBusy(false);
}

async function signUp() {
  setAuthBusy(true, 'Creating account...');
  const { data, error } = await supabaseClient.auth.signUp({
    email: $('#email').value.trim(), password: $('#password').value
  });
  if (error) setAuthMessage(error.message);
  else setAuthMessage(data.session ? 'Account created. Signing you in...' : 'Account created. You can sign in now.');
  setAuthBusy(false);
}

async function signOut() {
  await supabaseClient.auth.signOut();
  setAuthMessage('Signed out.');
}

function setAuthBusy(busy, message = '') {
  $('#signInBtn').disabled = busy;
  $('#signUpBtn').disabled = busy;
  if (message) setAuthMessage(message);
}
