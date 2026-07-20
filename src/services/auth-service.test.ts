import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test, vi } from 'vitest';
import {
  AuthenticationError,
  createAuthService,
  type SessionUser
} from './auth-service';

function createClient(auth: Record<string, unknown>): SupabaseClient {
  return { auth } as unknown as SupabaseClient;
}

describe('AuthService', () => {
  test('returns the current session user', async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { user: { id: 'user-1', email: 'owner@example.com' } } },
      error: null
    });
    const service = createAuthService(createClient({ getSession }));

    await expect(service.getSession()).resolves.toEqual({
      id: 'user-1',
      email: 'owner@example.com'
    });
  });

  test('returns null when no session exists', async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: null
    });
    const service = createAuthService(createClient({ getSession }));

    await expect(service.getSession()).resolves.toBeNull();
  });

  test('signs in with email and password', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: {}, error: null });
    const service = createAuthService(createClient({ signInWithPassword }));

    await service.signIn('owner@example.com', 'secret-password');

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: 'secret-password'
    });
  });

  test('maps raw sign-in failures to a safe application error', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: {},
      error: { message: 'database host and credential details' }
    });
    const service = createAuthService(createClient({ signInWithPassword }));

    await expect(service.signIn('owner@example.com', 'bad-password')).rejects.toEqual(
      new AuthenticationError('Could not sign in. Check your email and password and try again.')
    );
  });

  test('reports an immediately signed-in account after sign-up', async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null
    });
    const service = createAuthService(createClient({ signUp }));

    await expect(service.signUp('owner@example.com', 'secret-password')).resolves.toEqual({
      signedIn: true
    });
  });

  test('reports an account awaiting sign-in after sign-up without a session', async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { session: null },
      error: null
    });
    const service = createAuthService(createClient({ signUp }));

    await expect(service.signUp('owner@example.com', 'secret-password')).resolves.toEqual({
      signedIn: false
    });
  });

  test('signs out through Supabase auth', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const service = createAuthService(createClient({ signOut }));

    await service.signOut();

    expect(signOut).toHaveBeenCalledOnce();
  });

  test('forwards session changes and unsubscribes cleanly', () => {
    const unsubscribe = vi.fn();
    let authListener: ((event: string, session: unknown) => void) | undefined;
    const onAuthStateChange = vi.fn((listener: typeof authListener) => {
      authListener = listener;
      return { data: { subscription: { unsubscribe } } };
    });
    const service = createAuthService(createClient({ onAuthStateChange }));
    const listener = vi.fn<(user: SessionUser | null) => void>();

    const stopListening = service.onSessionChange(listener);
    authListener?.('SIGNED_IN', { user: { id: 'user-1', email: 'owner@example.com' } });
    authListener?.('SIGNED_OUT', null);
    stopListening();

    expect(listener).toHaveBeenNthCalledWith(1, {
      id: 'user-1',
      email: 'owner@example.com'
    });
    expect(listener).toHaveBeenNthCalledWith(2, null);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
