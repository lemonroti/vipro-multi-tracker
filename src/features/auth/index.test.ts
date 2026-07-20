// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/unbound-method */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createAuthController,
  type AuthDependencies,
  type AuthSession
} from './index';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function installAuthDom(): void {
  document.body.innerHTML = `
    <section id="authScreen"></section>
    <div id="app" hidden></div>
    <nav id="mobileNav" hidden></nav>
    <form id="authForm">
      <input id="email" />
      <input id="password" />
      <button id="signInBtn" type="submit">Sign in</button>
      <button id="signUpBtn" type="button">Create account</button>
      <p id="authMessage"></p>
    </form>
    <span id="accountEmail">—</span>
    <button id="settingsSignOut" type="button">Sign out</button>
  `;
}

function createDependencies(overrides: Partial<AuthDependencies> = {}): {
  dependencies: AuthDependencies;
  stopListening: ReturnType<typeof vi.fn>;
} {
  const stopListening = vi.fn();
  return {
    dependencies: {
      getSession: vi.fn().mockResolvedValue(null),
      signIn: vi.fn().mockResolvedValue(undefined),
      signUp: vi.fn().mockResolvedValue({ signedIn: false }),
      signOut: vi.fn().mockResolvedValue(undefined),
      onSessionChange: vi.fn().mockReturnValue(stopListening),
      resetApplication: vi.fn(),
      ...overrides
    },
    stopListening
  };
}

async function flushAsyncHandler(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('AuthController', () => {
  beforeEach(installAuthDom);

  test('shows only the authentication screen while signed out', async () => {
    const { dependencies } = createDependencies();
    const controller = createAuthController(dependencies);

    await controller.initialize();

    expect(document.querySelector<HTMLElement>('#authScreen')?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('#app')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#mobileNav')?.hidden).toBe(true);
  });

  test('shows the application and account email while signed in', async () => {
    const session: AuthSession = { user: { id: 'user-1', email: 'owner@example.com' } };
    const { dependencies } = createDependencies({
      getSession: vi.fn().mockResolvedValue(session)
    });

    await createAuthController(dependencies).initialize();

    expect(document.querySelector<HTMLElement>('#authScreen')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#app')?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('#mobileNav')?.hidden).toBe(false);
    expect(document.querySelector('#accountEmail')?.textContent).toBe('owner@example.com');
  });

  test('uses the existing fallback when the signed-in user has no email', async () => {
    const { dependencies } = createDependencies({
      getSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
    });

    await createAuthController(dependencies).initialize();

    expect(document.querySelector('#accountEmail')?.textContent).toBe('Signed-in user');
  });

  test('disables both auth buttons while a sign-in is pending', async () => {
    const pendingSignIn = deferred<void>();
    const signIn = vi.fn().mockReturnValue(pendingSignIn.promise);
    const { dependencies } = createDependencies({ signIn });
    await createAuthController(dependencies).initialize();
    const email = document.querySelector<HTMLInputElement>('#email');
    const password = document.querySelector<HTMLInputElement>('#password');
    if (!email || !password) throw new Error('Missing auth inputs in test DOM.');
    email.value = ' owner@example.com ';
    password.value = 'secret-password';

    document.querySelector<HTMLFormElement>('#authForm')?.requestSubmit();

    expect(document.querySelector<HTMLButtonElement>('#signInBtn')?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('#signUpBtn')?.disabled).toBe(true);
    expect(document.querySelector('#authMessage')?.textContent).toBe('Signing in...');
    expect(signIn).toHaveBeenCalledWith('owner@example.com', 'secret-password');

    pendingSignIn.resolve();
    await flushAsyncHandler();
    expect(document.querySelector<HTMLButtonElement>('#signInBtn')?.disabled).toBe(false);
    expect(document.querySelector<HTMLButtonElement>('#signUpBtn')?.disabled).toBe(false);
  });

  test('never displays raw sign-in errors', async () => {
    const { dependencies } = createDependencies({
      signIn: vi.fn().mockRejectedValue(new Error('database host and credential details'))
    });
    await createAuthController(dependencies).initialize();

    document.querySelector<HTMLFormElement>('#authForm')?.requestSubmit();
    await flushAsyncHandler();

    expect(document.querySelector('#authMessage')?.textContent).toBe(
      'Could not sign in. Check your email and password and try again.'
    );
  });

  test('resets application state and returns to the auth screen after sign-out', async () => {
    const resetApplication = vi.fn();
    const { dependencies } = createDependencies({
      getSession: vi.fn().mockResolvedValue({
        user: { id: 'user-1', email: 'owner@example.com' }
      }),
      resetApplication
    });
    await createAuthController(dependencies).initialize();

    document.querySelector<HTMLButtonElement>('#settingsSignOut')?.click();
    await flushAsyncHandler();

    expect(dependencies.signOut).toHaveBeenCalledOnce();
    expect(resetApplication).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLElement>('#authScreen')?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('#app')?.hidden).toBe(true);
    expect(document.querySelector('#authMessage')?.textContent).toBe('Signed out.');
  });

  test('removes DOM and session listeners when destroyed', async () => {
    const signUp = vi.fn().mockResolvedValue({ signedIn: false });
    const { dependencies, stopListening } = createDependencies({ signUp });
    const controller = createAuthController(dependencies);
    await controller.initialize();

    controller.destroy();
    document.querySelector<HTMLButtonElement>('#signUpBtn')?.click();
    await flushAsyncHandler();

    expect(stopListening).toHaveBeenCalledOnce();
    expect(signUp).not.toHaveBeenCalled();
  });
});
