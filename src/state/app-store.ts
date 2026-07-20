import type { AppState } from '../domain/models';
import { blankState } from '../domain/schemas';

export interface AppStore {
  getState(): Readonly<AppState>;
  replace(next: AppState): void;
  update(updater: (current: AppState) => AppState): void;
  subscribe(listener: (state: Readonly<AppState>) => void): () => void;
  reset(): void;
}

export function createAppStore(initial: AppState = blankState()): AppStore {
  let state = structuredClone(initial);
  const listeners = new Set<(state: Readonly<AppState>) => void>();

  const notify = (): void => {
    listeners.forEach(listener => listener(structuredClone(state)));
  };

  return {
    getState: () => structuredClone(state),
    replace(next) {
      state = structuredClone(next);
      notify();
    },
    update(updater) {
      state = structuredClone(updater(structuredClone(state)));
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      state = blankState();
      notify();
    }
  };
}
