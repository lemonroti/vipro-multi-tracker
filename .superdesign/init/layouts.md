# Shared Layouts

## Application shell

Source: `index.html`

The complete application shell owns the authentication card, desktop sidebar, sticky top bar, four
view containers, mobile navigation, both modals, and toast.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0f172a" />
  <meta name="description" content="A flexible personal multi-tracker with cloud sync and offline recording." />
  <title>My Tracker</title>
  <link rel="stylesheet" href="/src/styles/app.css" />
</head>
<body>
  <section id="authScreen" class="auth-shell">
    <article class="card auth-card">
      <div class="brand auth-brand">
        <div class="brand-mark">MT</div>
        <div><h1 style="font-size:16px;margin:0">My Tracker</h1><p style="margin:3px 0 0">Your personal multi-tracker</p></div>
      </div>
      <h1>Welcome back</h1>
      <p class="auth-copy">Sign in to keep your trackers and records synced across browsers and devices.</p>
      <form id="authForm" class="auth-form">
        <div class="field"><label for="email">Email</label><input id="email" class="input" type="email" autocomplete="email" required /></div>
        <div class="field"><label for="password">Password</label><input id="password" class="input" type="password" autocomplete="current-password" minlength="6" required /></div>
        <div class="auth-actions"><button id="signInBtn" class="button primary" type="submit">Sign in</button><button id="signUpBtn" class="button outline" type="button">Create account</button></div>
        <p id="authMessage" class="auth-message" role="status"></p>
      </form>
      <p class="auth-note">New accounts can sign in immediately. Your tracking data is private to your Supabase account through Row Level Security.</p>
    </article>
  </section>

  <div id="app" class="app-shell" hidden>
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="brand">
        <div class="brand-mark">MT</div>
        <div><h1>My Tracker</h1><p>Cloud-synced tracking</p></div>
      </div>
      <nav class="nav-stack">
        <a class="nav-button active" data-nav="dashboard" href="#view-dashboard"><span class="nav-icon">⌂</span><span>Dashboard</span></a>
        <a class="nav-button" data-nav="history" href="#view-history"><span class="nav-icon">▤</span><span>History</span></a>
        <a class="nav-button" data-nav="trackers" href="#view-trackers"><span class="nav-icon">◫</span><span>Trackers</span></a>
        <a class="nav-button" data-nav="settings" href="#view-settings"><span class="nav-icon">⚙</span><span>Settings</span></a>
      </nav>
      <div class="prototype-note cloud-note"><strong><span id="sidebarStatusDot" class="status-dot"></span><span id="sidebarStatusTitle">Cloud sync active</span></strong><span id="sidebarStatusText">Changes are saved to Supabase and cached locally for offline use.</span></div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div>
          <p id="pageEyebrow" class="eyebrow">Good morning</p>
          <h1 id="pageTitle" class="page-title">Your daily tracking</h1>
        </div>
        <div class="top-actions">
          <div id="syncBadge" class="sync-badge"><span id="syncBadgeDot" class="status-dot"></span><span id="syncBadgeText">Synced</span></div>
          <button id="headerAction" class="button primary">+ Add tracker</button>
        </div>
      </header>
      <div id="offlineBanner" class="offline-banner" hidden>You are offline. Changes will be saved on this device and synced automatically when you reconnect.</div>
      <div class="content">
        <section id="view-dashboard" class="view">
          <div class="grid stats-grid">
            <article class="card stat-card"><p class="stat-label">Today’s records</p><p id="statTodayEntries" class="stat-value">0</p><p id="statTodayCaption" class="stat-caption">Nothing logged yet</p></article>
            <article class="card stat-card"><p class="stat-label">Active trackers</p><p id="statActiveTrackers" class="stat-value">0</p><p class="stat-caption">Available for quick recording</p></article>
            <article class="card stat-card"><p class="stat-label">Last activity</p><p id="statLastActivity" class="stat-value" style="font-size:21px">No activity</p><p id="statLastCaption" class="stat-caption">Start with a quick button below</p></article>
          </div>
          <section class="section">
            <div class="section-head"><div><p class="section-kicker">Quick record</p><h2>Today</h2></div><button class="button ghost small" data-open-log>Add manual record</button></div>
            <div id="dashboardTrackerGrid" class="grid tracker-grid"></div>
          </section>
          <section class="section grid two-column">
            <article class="card card-pad"><div class="section-head"><div><p class="section-help">Recent activity</p><h2>Latest records</h2></div><button class="button ghost small" data-go="history">View all</button></div><div id="dashboardActivity" class="activity-list"></div></article>
            <article class="card card-pad chart-card"><div class="chart-head"><div><p class="section-help">Last 7 days</p><h2>Daily totals</h2></div><select id="dashboardChartTracker" class="select" style="width:auto;min-width:130px"></select></div><div id="dashboardChart" class="chart"></div></article>
          </section>
        </section>

        <section id="view-history" class="view" hidden>
          <article class="card card-pad">
            <div class="section-head"><div><p class="section-kicker">All records</p><h2>Tracking history</h2></div><button class="button primary small" data-open-log>+ Add record</button></div>
            <div class="filters"><div class="field"><label for="historyTracker">Tracker</label><select id="historyTracker" class="select"></select></div><div class="field"><label for="historyDate">Date</label><input id="historyDate" class="input" type="date" /></div><div class="field"><label for="historySearch">Search note</label><input id="historySearch" class="input" placeholder="Search..." /></div></div>
            <div id="historySummary" class="history-summary"></div><div id="historyGroups" class="history-groups"></div>
          </article>
        </section>

        <section id="view-trackers" class="view" hidden>
          <div class="section-head"><div><p class="section-kicker">Configure</p><h2>Your trackers</h2><p class="section-help">Change quick values, goals, icons, and visibility.</p></div><button class="button primary" data-open-tracker>+ New tracker</button></div>
          <div id="trackerManageList" class="manage-list"></div>
        </section>

        <section id="view-settings" class="view" hidden>
          <div class="settings-grid">
            <article class="card card-pad settings-card"><h2>Appearance</h2><p>Choose how My Tracker looks on this device.</p><div class="field"><label for="themeSelect">Theme</label><select id="themeSelect" class="select"><option value="system">Follow device</option><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="setting-row"><div><strong>Confirm before deleting</strong><span>Helps prevent accidental deletion.</span></div><button id="confirmDeleteToggle" class="toggle on" aria-label="Toggle delete confirmation"></button></div></article>
            <article class="card card-pad settings-card"><h2>Cloud sync & backup</h2><p id="storageInfo">Loading your cloud data...</p><div class="sync-grid"><div class="sync-row"><div class="sync-copy"><strong>Sync status</strong><span id="syncInfo">Checking connection...</span></div><button id="syncNow" class="button outline small">Sync now</button></div></div><div class="settings-actions" style="margin-top:16px"><button id="exportJson" class="button outline small">Export JSON</button><button id="exportCsv" class="button outline small">Export CSV</button><label class="button outline small" for="importFile">Import JSON</label><input id="importFile" class="hidden-file" type="file" accept="application/json,.json" /></div></article>
            <article class="card card-pad settings-card"><h2>Account</h2><p>Your data is isolated to this signed-in account.</p><div class="setting-row"><div style="min-width:0"><strong>Signed in as</strong><span id="accountEmail" class="account-email">—</span></div><button id="settingsSignOut" class="button outline small">Sign out</button></div></article>
            <article class="card card-pad settings-card"><h2>Testing tools</h2><p>Add temporary sample records to test charts, filters, editing, and deletion.</p><div class="settings-actions"><button id="loadSampleData" class="button outline">Load sample records</button><button id="clearLogs" class="button danger">Clear all records</button></div></article>
            <article class="card card-pad settings-card"><h2>Reset</h2><p>Restore the original Smoking and 觀世音菩薩聖號 trackers and remove all other records and trackers.</p><button id="resetEverything" class="button danger">Reset full tracker</button></article>
          </div>
        </section>
      </div>
    </main>
  </div>

  <nav id="mobileNav" class="mobile-nav" aria-label="Mobile navigation" hidden>
    <a class="nav-button active" data-nav="dashboard" href="#view-dashboard"><span class="nav-icon">⌂</span><span>Home</span></a>
    <a class="nav-button" data-nav="history" href="#view-history"><span class="nav-icon">▤</span><span>History</span></a>
    <a class="nav-button" data-nav="trackers" href="#view-trackers"><span class="nav-icon">◫</span><span>Trackers</span></a>
    <a class="nav-button" data-nav="settings" href="#view-settings"><span class="nav-icon">⚙</span><span>Settings</span></a>
  </nav>

  <div id="trackerModal" class="modal-backdrop" hidden>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="trackerModalTitle">
      <div class="modal-head"><div><p class="modal-kicker">Tracker setup</p><h2 id="trackerModalTitle">Create tracker</h2></div><button class="icon-button" data-close-modal="trackerModal">✕</button></div>
      <form id="trackerForm"><input id="trackerEditId" type="hidden" /><div class="form-grid two"><div class="field"><label for="trackerName">Tracker name</label><input id="trackerName" class="input" required maxlength="80" placeholder="e.g. Water" /></div><div class="field"><label for="trackerIcon">Icon / emoji</label><input id="trackerIcon" class="input" maxlength="4" required value="✦" /></div><div class="field"><label for="trackerUnit">Unit</label><input id="trackerUnit" class="input" required maxlength="30" placeholder="minute, count, ml" /></div><div class="field"><label for="trackerGoal">Daily goal (optional)</label><input id="trackerGoal" class="input" type="number" min="0" step="any" placeholder="30" /></div></div><div class="field" style="margin-top:14px"><label for="trackerPresets">Quick values, separated by commas</label><input id="trackerPresets" class="input" required placeholder="5, 10, 15" /></div><div class="field" style="margin-top:14px"><label>Card colour</label><div id="trackerColors" class="color-options"></div></div><div class="form-actions"><button type="button" class="button outline" data-close-modal="trackerModal">Cancel</button><button class="button primary">Save tracker</button></div></form>
    </div>
  </div>

  <div id="logModal" class="modal-backdrop" hidden>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="logModalTitle">
      <div class="modal-head"><div><p class="modal-kicker">Record details</p><h2 id="logModalTitle">Add record</h2></div><button class="icon-button" data-close-modal="logModal">✕</button></div>
      <form id="logForm"><input id="logEditId" type="hidden" /><div class="form-grid two"><div class="field"><label for="logTracker">Tracker</label><select id="logTracker" class="select" required></select></div><div class="field"><label for="logValue">Value</label><input id="logValue" class="input" type="number" min="0.01" step="any" required /></div><div class="field" style="grid-column:1/-1"><label for="logDateTime">Date and time</label><input id="logDateTime" class="input" type="datetime-local" required /></div><div class="field" style="grid-column:1/-1"><label for="logNote">Note (optional)</label><textarea id="logNote" class="textarea" maxlength="500" placeholder="Anything useful about this record"></textarea></div></div><div class="form-actions"><button type="button" class="button outline" data-close-modal="logModal">Cancel</button><button class="button primary">Save record</button></div></form>
    </div>
  </div>
  <div id="toast" class="toast"><span id="toastMessage">Recorded</span><button id="toastUndo" hidden>Undo</button></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

## Shell controller

Source: `src/features/shell/index.ts`

The full source controls layout-visible state: active view, responsive navigation state, page title,
contextual action, theme, sync indicators, modal visibility, and toast visibility.

```ts
import type { ThemePreference } from '../../domain/models';
import { getElement, getElements } from '../../shared/dom';

export type ViewName = 'dashboard' | 'history' | 'trackers' | 'settings';
export interface ConnectionStatus { online: boolean; pendingCount: number; syncing: boolean; }
export interface ShellController {
  switchView(view: ViewName): void;
  openModal(id: string): void;
  closeModal(id: string): void;
  showToast(message: string, canUndo?: boolean): void;
  updateConnection(status: ConnectionStatus): void;
  applyTheme(preference: ThemePreference): void;
  updateGreeting(): void;
  destroy(): void;
}
interface PageMetadata { title: string; action: string; actionType: '' | 'log' | 'tracker'; }
const PAGE_METADATA: Record<ViewName, PageMetadata> = {
  dashboard: { title: 'Your daily tracking', action: '+ Add tracker', actionType: 'tracker' },
  history: { title: 'History', action: '+ Add record', actionType: 'log' },
  trackers: { title: 'Manage trackers', action: '+ New tracker', actionType: 'tracker' },
  settings: { title: 'Settings', action: '', actionType: '' }
};
function isViewName(value: string | undefined): value is ViewName { return value !== undefined && value in PAGE_METADATA; }
function resolvedTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function createShellController(): ShellController {
  let currentView: ViewName = 'dashboard';
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const listenerTeardowns: Array<() => void> = [];
  const listen = <Target extends EventTarget>(target: Target, type: string, listener: EventListener): void => {
    target.addEventListener(type, listener);
    listenerTeardowns.push(() => target.removeEventListener(type, listener));
  };
  const updateGreeting = (): void => {
    const hour = new Date().getHours();
    getElement('#pageEyebrow').textContent = currentView === 'dashboard' ? hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening' : 'My Tracker';
  };
  const openModal = (id: string): void => { document.body.style.overflow = 'hidden'; getElement<HTMLElement>(`#${id}`).hidden = false; };
  const closeModal = (id: string): void => { document.body.style.overflow = ''; getElement<HTMLElement>(`#${id}`).hidden = true; };
  const switchView = (view: ViewName): void => {
    currentView = view;
    getElements<HTMLElement>('.view').forEach(section => { section.hidden = section.id !== `view-${view}`; });
    getElements<HTMLElement>('[data-nav]').forEach(button => { button.classList.toggle('active', button.dataset.nav === view); });
    const metadata = PAGE_METADATA[view];
    getElement('#pageTitle').textContent = metadata.title;
    const action = getElement<HTMLButtonElement>('#headerAction');
    action.textContent = metadata.action; action.hidden = metadata.action === ''; action.dataset.actionType = metadata.actionType;
    updateGreeting(); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const showToast = (message: string, canUndo = false): void => {
    if (toastTimer !== null) clearTimeout(toastTimer);
    getElement('#toastMessage').textContent = message; getElement<HTMLElement>('#toastUndo').hidden = !canUndo;
    const toast = getElement('#toast'); toast.classList.add('show');
    toastTimer = setTimeout(() => { toast.classList.remove('show'); toastTimer = null; }, 3000);
  };
  const updateConnection = (status: ConnectionStatus): void => {
    const hasPending = status.pendingCount > 0; const disconnected = !status.online || hasPending;
    getElement<HTMLElement>('#offlineBanner').hidden = status.online;
    getElement('#sidebarStatusDot').classList.toggle('offline', disconnected); getElement('#syncBadgeDot').classList.toggle('offline', disconnected);
    getElement('#sidebarStatusTitle').textContent = !status.online ? 'Offline mode' : hasPending ? 'Sync pending' : 'Cloud sync active';
    getElement('#sidebarStatusText').textContent = !status.online ? 'Changes are kept on this device until the connection returns.' : hasPending ? `${status.pendingCount} change${status.pendingCount === 1 ? '' : 's'} will sync automatically.` : 'Changes are saved to Supabase and cached locally for offline use.';
    getElement('#syncBadgeText').textContent = status.syncing ? 'Syncing...' : !status.online ? 'Offline' : hasPending ? `${status.pendingCount} pending` : 'Synced';
  };
  const applyTheme = (preference: ThemePreference): void => {
    document.documentElement.dataset.theme = resolvedTheme(preference);
    const select = document.querySelector<HTMLSelectElement>('#themeSelect'); if (select) select.value = preference;
  };
  getElements<HTMLElement>('[data-nav]').forEach(button => listen(button, 'click', event => { event.preventDefault(); const view = button.dataset.nav; if (!isViewName(view)) return; switchView(view); history.replaceState(null, '', `#view-${view}`); }));
  getElements<HTMLElement>('[data-go]').forEach(button => listen(button, 'click', () => { const view = button.dataset.go; if (!isViewName(view)) return; switchView(view); history.replaceState(null, '', `#view-${view}`); }));
  getElements<HTMLElement>('[data-open-tracker]').forEach(button => listen(button, 'click', () => openModal('trackerModal')));
  getElements<HTMLElement>('[data-open-log]').forEach(button => listen(button, 'click', () => openModal('logModal')));
  getElements<HTMLElement>('[data-close-modal]').forEach(button => listen(button, 'click', () => { const id = button.dataset.closeModal; if (id) closeModal(id); }));
  getElements<HTMLElement>('.modal-backdrop').forEach(backdrop => listen(backdrop, 'click', event => { if (event.target === backdrop) closeModal(backdrop.id); }));
  const headerAction = getElement<HTMLButtonElement>('#headerAction');
  listen(headerAction, 'click', () => openModal(headerAction.dataset.actionType === 'log' ? 'logModal' : 'trackerModal'));
  listen(document, 'keydown', event => { if ((event as KeyboardEvent).key !== 'Escape') return; getElements<HTMLElement>('.modal-backdrop:not([hidden])').forEach(modal => closeModal(modal.id)); });
  listen(window, 'hashchange', () => { const view = location.hash.replace('#view-', ''); if (isViewName(view)) switchView(view); });
  const themeSelect = document.querySelector<HTMLSelectElement>('#themeSelect');
  if (themeSelect) listen(themeSelect, 'change', () => { const preference = themeSelect.value; if (preference === 'system' || preference === 'light' || preference === 'dark') applyTheme(preference); });
  return { switchView, openModal, closeModal, showToast, updateConnection, applyTheme, updateGreeting, destroy() { listenerTeardowns.splice(0).forEach(teardown => teardown()); if (toastTimer !== null) clearTimeout(toastTimer); toastTimer = null; document.body.style.overflow = ''; } };
}
```
