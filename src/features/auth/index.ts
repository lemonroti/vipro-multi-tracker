import { getElement } from '../../shared/dom';

export interface AuthSession {
  user: {
    id: string;
    email?: string;
  };
}

export interface AuthDependencies {
  getSession(): Promise<AuthSession | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(
    email: string,
    password: string
  ): Promise<void | { signedIn: boolean }>;
  signOut(): Promise<void>;
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
  resetApplication(): void;
}

export interface AuthController {
  initialize(): Promise<void>;
  destroy(): void;
}

interface AuthElements {
  authScreen: HTMLElement;
  app: HTMLElement;
  mobileNav: HTMLElement;
  form: HTMLFormElement;
  email: HTMLInputElement;
  password: HTMLInputElement;
  signInButton: HTMLButtonElement;
  signUpButton: HTMLButtonElement;
  message: HTMLElement;
  accountEmail: HTMLElement;
  signOutButton: HTMLButtonElement;
}

function authElements(): AuthElements {
  return {
    authScreen: getElement('#authScreen'),
    app: getElement('#app'),
    mobileNav: getElement('#mobileNav'),
    form: getElement('#authForm'),
    email: getElement('#email'),
    password: getElement('#password'),
    signInButton: getElement('#signInBtn'),
    signUpButton: getElement('#signUpBtn'),
    message: getElement('#authMessage'),
    accountEmail: getElement('#accountEmail'),
    signOutButton: getElement('#settingsSignOut')
  };
}

export function createAuthController(dependencies: AuthDependencies): AuthController {
  let elements: AuthElements | null = null;
  let stopSessionListener: (() => void) | null = null;
  let initialized = false;
  let applicationReset = true;

  const setMessage = (message: string): void => {
    if (elements) elements.message.textContent = message;
  };

  const setBusy = (busy: boolean, message = ''): void => {
    if (!elements) return;
    elements.signInButton.disabled = busy;
    elements.signUpButton.disabled = busy;
    if (message !== '') setMessage(message);
  };

  const showSession = (session: AuthSession | null): void => {
    if (!elements) return;
    const signedIn = session !== null;
    elements.authScreen.hidden = signedIn;
    elements.app.hidden = !signedIn;
    elements.mobileNav.hidden = !signedIn;

    if (session) {
      applicationReset = false;
      elements.accountEmail.textContent = session.user.email ?? 'Signed-in user';
    } else if (!applicationReset) {
      dependencies.resetApplication();
      applicationReset = true;
    }
  };

  const handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (!elements) return;
    const email = elements.email.value.trim();
    const password = elements.password.value;
    setBusy(true, 'Signing in...');
    void dependencies.signIn(email, password)
      .catch(() => {
        setMessage('Could not sign in. Check your email and password and try again.');
      })
      .finally(() => setBusy(false));
  };

  const handleSignUp = (): void => {
    if (!elements) return;
    const email = elements.email.value.trim();
    const password = elements.password.value;
    setBusy(true, 'Creating account...');
    void dependencies.signUp(email, password)
      .then(result => {
        setMessage(
          result?.signedIn === true
            ? 'Account created. Signing you in...'
            : 'Account created. You can sign in now.'
        );
      })
      .catch(() => setMessage('Could not create your account. Please try again.'))
      .finally(() => setBusy(false));
  };

  const handleSignOut = (): void => {
    void dependencies.signOut()
      .then(() => {
        showSession(null);
        setMessage('Signed out.');
      })
      .catch(() => setMessage('Could not sign out. Please try again.'));
  };

  const bindEvents = (): void => {
    if (!elements) return;
    elements.form.addEventListener('submit', handleSubmit);
    elements.signUpButton.addEventListener('click', handleSignUp);
    elements.signOutButton.addEventListener('click', handleSignOut);
  };

  const unbindEvents = (): void => {
    if (!elements) return;
    elements.form.removeEventListener('submit', handleSubmit);
    elements.signUpButton.removeEventListener('click', handleSignUp);
    elements.signOutButton.removeEventListener('click', handleSignOut);
  };

  return {
    async initialize() {
      if (initialized) return;
      initialized = true;
      elements = authElements();
      bindEvents();
      stopSessionListener = dependencies.onSessionChange(showSession);

      try {
        showSession(await dependencies.getSession());
      } catch {
        showSession(null);
        setMessage('Could not restore your session. Please sign in again.');
      }
    },
    destroy() {
      if (!initialized) return;
      unbindEvents();
      stopSessionListener?.();
      stopSessionListener = null;
      elements = null;
      initialized = false;
    }
  };
}
