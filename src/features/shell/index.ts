import type { ThemePreference } from '../../domain/models';
import { getElement, getElements } from '../../shared/dom';

export type ViewName = 'dashboard' | 'history' | 'trackers' | 'settings';

export interface ConnectionStatus {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
}

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

interface PageMetadata {
  title: string;
  action: string;
  actionType: '' | 'log' | 'tracker';
}

const PAGE_METADATA: Record<ViewName, PageMetadata> = {
  dashboard: {
    title: 'Your daily tracking',
    action: '+ Add tracker',
    actionType: 'tracker'
  },
  history: { title: 'History', action: '+ Add record', actionType: 'log' },
  trackers: { title: 'Manage trackers', action: '+ New tracker', actionType: 'tracker' },
  settings: { title: 'Settings', action: '', actionType: '' }
};

function isViewName(value: string | undefined): value is ViewName {
  return value !== undefined && value in PAGE_METADATA;
}

function resolvedTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function createShellController(): ShellController {
  let currentView: ViewName = 'dashboard';
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const listenerTeardowns: Array<() => void> = [];

  const listen = <Target extends EventTarget>(
    target: Target,
    type: string,
    listener: EventListener
  ): void => {
    target.addEventListener(type, listener);
    listenerTeardowns.push(() => target.removeEventListener(type, listener));
  };

  const updateGreeting = (): void => {
    const hour = new Date().getHours();
    getElement('#pageEyebrow').textContent = currentView === 'dashboard'
      ? hour < 12
        ? 'Good morning'
        : hour < 18
          ? 'Good afternoon'
          : 'Good evening'
      : 'My Tracker';
  };

  const openModal = (id: string): void => {
    document.body.style.overflow = 'hidden';
    getElement<HTMLElement>(`#${id}`).hidden = false;
  };

  const closeModal = (id: string): void => {
    document.body.style.overflow = '';
    getElement<HTMLElement>(`#${id}`).hidden = true;
  };

  const switchView = (view: ViewName): void => {
    currentView = view;
    getElements<HTMLElement>('.view').forEach(section => {
      section.hidden = section.id !== `view-${view}`;
    });
    getElements<HTMLElement>('[data-nav]').forEach(button => {
      button.classList.toggle('active', button.dataset.nav === view);
    });

    const metadata = PAGE_METADATA[view];
    getElement('#pageTitle').textContent = metadata.title;
    const action = getElement<HTMLButtonElement>('#headerAction');
    action.textContent = metadata.action;
    action.hidden = metadata.action === '';
    action.dataset.actionType = metadata.actionType;
    updateGreeting();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showToast = (message: string, canUndo = false): void => {
    if (toastTimer !== null) clearTimeout(toastTimer);
    getElement('#toastMessage').textContent = message;
    getElement<HTMLElement>('#toastUndo').hidden = !canUndo;
    const toast = getElement('#toast');
    toast.classList.add('show');
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      toastTimer = null;
    }, 3000);
  };

  const updateConnection = (status: ConnectionStatus): void => {
    const hasPending = status.pendingCount > 0;
    const disconnected = !status.online || hasPending;
    getElement<HTMLElement>('#offlineBanner').hidden = status.online;
    getElement('#sidebarStatusDot').classList.toggle('offline', disconnected);
    getElement('#syncBadgeDot').classList.toggle('offline', disconnected);
    getElement('#sidebarStatusTitle').textContent = !status.online
      ? 'Offline mode'
      : hasPending
        ? 'Sync pending'
        : 'Cloud sync active';
    getElement('#sidebarStatusText').textContent = !status.online
      ? 'Changes are kept on this device until the connection returns.'
      : hasPending
        ? `${status.pendingCount} change${status.pendingCount === 1 ? '' : 's'} will sync automatically.`
        : 'Changes are saved to Supabase and cached locally for offline use.';
    getElement('#syncBadgeText').textContent = status.syncing
      ? 'Syncing...'
      : !status.online
        ? 'Offline'
        : hasPending
          ? `${status.pendingCount} pending`
          : 'Synced';
  };

  const applyTheme = (preference: ThemePreference): void => {
    document.documentElement.dataset.theme = resolvedTheme(preference);
    const select = document.querySelector<HTMLSelectElement>('#themeSelect');
    if (select) select.value = preference;
  };

  getElements<HTMLElement>('[data-nav]').forEach(button => {
    listen(button, 'click', event => {
      event.preventDefault();
      const view = button.dataset.nav;
      if (!isViewName(view)) return;
      switchView(view);
      history.replaceState(null, '', `#view-${view}`);
    });
  });
  getElements<HTMLElement>('[data-go]').forEach(button => {
    listen(button, 'click', () => {
      const view = button.dataset.go;
      if (!isViewName(view)) return;
      switchView(view);
      history.replaceState(null, '', `#view-${view}`);
    });
  });
  getElements<HTMLElement>('[data-open-tracker]').forEach(button => {
    listen(button, 'click', () => openModal('trackerModal'));
  });
  getElements<HTMLElement>('[data-open-log]').forEach(button => {
    listen(button, 'click', () => openModal('logModal'));
  });
  getElements<HTMLElement>('[data-close-modal]').forEach(button => {
    listen(button, 'click', () => {
      const id = button.dataset.closeModal;
      if (id) closeModal(id);
    });
  });
  getElements<HTMLElement>('.modal-backdrop').forEach(backdrop => {
    listen(backdrop, 'click', event => {
      if (event.target === backdrop) closeModal(backdrop.id);
    });
  });

  const headerAction = getElement<HTMLButtonElement>('#headerAction');
  listen(headerAction, 'click', () => {
    openModal(headerAction.dataset.actionType === 'log' ? 'logModal' : 'trackerModal');
  });
  listen(document, 'keydown', event => {
    if ((event as KeyboardEvent).key !== 'Escape') return;
    getElements<HTMLElement>('.modal-backdrop:not([hidden])')
      .forEach(modal => closeModal(modal.id));
  });
  listen(window, 'hashchange', () => {
    const view = location.hash.replace('#view-', '');
    if (isViewName(view)) switchView(view);
  });
  const themeSelect = document.querySelector<HTMLSelectElement>('#themeSelect');
  if (themeSelect) {
    listen(themeSelect, 'change', () => {
      const preference = themeSelect.value;
      if (preference === 'system' || preference === 'light' || preference === 'dark') {
        applyTheme(preference);
      }
    });
  }

  return {
    switchView,
    openModal,
    closeModal,
    showToast,
    updateConnection,
    applyTheme,
    updateGreeting,
    destroy() {
      listenerTeardowns.splice(0).forEach(teardown => teardown());
      if (toastTimer !== null) clearTimeout(toastTimer);
      toastTimer = null;
      document.body.style.overflow = '';
    }
  };
}
