import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

export interface SessionUser {
  id: string;
  email?: string;
}

export interface AuthService {
  getSession(): Promise<SessionUser | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ signedIn: boolean }>;
  signOut(): Promise<void>;
  onSessionChange(listener: (user: SessionUser | null) => void): () => void;
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

function sessionUser(user: User): SessionUser {
  return user.email === undefined
    ? { id: user.id }
    : { id: user.id, email: user.email };
}

function userFromSession(session: Session | null): SessionUser | null {
  return session === null ? null : sessionUser(session.user);
}

class SupabaseAuthService implements AuthService {
  constructor(private readonly client: SupabaseClient) {}

  async getSession(): Promise<SessionUser | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw new AuthenticationError('Could not restore your session. Please sign in again.');
    return userFromSession(data.session);
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) {
      throw new AuthenticationError(
        'Could not sign in. Check your email and password and try again.'
      );
    }
  }

  async signUp(email: string, password: string): Promise<{ signedIn: boolean }> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw new AuthenticationError('Could not create your account. Please try again.');
    return { signedIn: data.session !== null };
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw new AuthenticationError('Could not sign out. Please try again.');
  }

  onSessionChange(listener: (user: SessionUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(userFromSession(session));
    });
    return () => data.subscription.unsubscribe();
  }
}

export function createAuthService(client: SupabaseClient): AuthService {
  return new SupabaseAuthService(client);
}
