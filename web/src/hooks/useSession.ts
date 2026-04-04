import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type { SupportedLocale } from '../i18n-context';
import { getMessages } from '../i18n-context';
import type { SessionPayload, SessionRole, SessionState } from '../types/app';

const MUTATION_INTENT_HEADER = 'X-Journal-Scope-Intent';
const MUTATION_INTENT_VALUE = 'mutate';

type UseSessionOptions = {
  apiUrl: string;
  locale: SupportedLocale;
  setLastError: (value: string | null) => void;
  onUnauthorized: (message: string) => void;
  onLoginSuccess?: () => void;
  onLogout?: () => void;
};

export function useSession({
  apiUrl,
  locale,
  setLastError,
  onUnauthorized,
  onLoginSuccess,
  onLogout
}: UseSessionOptions) {
  const copy = getMessages(locale);
  const [authState, setAuthState] = useState<SessionState>('checking');
  const [appVersion, setAppVersion] = useState('dev');
  const [sessionRole, setSessionRole] = useState<SessionRole | null>(null);
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  const withMutationIntent = useCallback((init?: RequestInit): RequestInit => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD') {
      return init ?? {};
    }
    return {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        [MUTATION_INTENT_HEADER]: MUTATION_INTENT_VALUE
      }
    };
  }, []);

  const resetSession = useCallback(() => {
    setSessionRole(null);
    setAuthState('unauthenticated');
  }, []);

  const apiFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await fetch(input, {
      credentials: 'same-origin',
      ...withMutationIntent(init)
    });
    if (res.status === 401) {
      resetSession();
      onUnauthorized(copy.sessionExpired);
      const authError = new Error(copy.authenticationRequired);
      authError.name = 'AuthRequiredError';
      throw authError;
    }
    return res;
  }, [copy.authenticationRequired, copy.sessionExpired, onUnauthorized, resetSession, withMutationIntent]);

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/session`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      if (res.status === 401) {
        resetSession();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const session = await res.json() as SessionPayload;
      if (session.role !== 'admin' && session.role !== 'viewer') {
        throw new Error(copy.invalidSessionResponse);
      }
      setAppVersion((session.version ?? '').trim() || 'dev');
      setSessionRole(session.role);
      setAuthState('authenticated');
      setLastError(null);
    } catch (err: any) {
      console.error('Failed to load session:', err);
      resetSession();
      setLastError(err?.message || copy.failedToLoadSession);
    }
  }, [apiUrl, copy.failedToLoadSession, copy.invalidSessionResponse, resetSession, setLastError]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const submitAccessCode = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = accessCodeInput.trim();
    if (!trimmed) {
      setAuthError(copy.enterAccessCode);
      return;
    }

    setIsSubmittingAuth(true);
    setAuthError(null);
    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        credentials: 'same-origin',
        ...withMutationIntent({
          method: 'POST',
          body: JSON.stringify({ accessCode: trimmed }),
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          }
        })
      });
      if (res.status === 401) {
        setAuthError(copy.accessCodeRejected);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const session = await res.json() as SessionPayload;
      if (session.role !== 'admin' && session.role !== 'viewer') {
        throw new Error(copy.invalidLoginResponse);
      }
      setAccessCodeInput('');
      setAppVersion((session.version ?? '').trim() || 'dev');
      setSessionRole(session.role);
      setAuthState('authenticated');
      setLastError(null);
      onLoginSuccess?.();
    } catch (err: any) {
      console.error('Login failed:', err);
      setAuthError(err?.message || copy.loginFailed);
    } finally {
      setIsSubmittingAuth(false);
    }
  }, [
    accessCodeInput,
    apiUrl,
    copy.accessCodeRejected,
    copy.enterAccessCode,
    copy.invalidLoginResponse,
    copy.loginFailed,
    onLoginSuccess,
    setLastError,
    withMutationIntent
  ]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${apiUrl}/auth/logout`, {
        credentials: 'same-origin',
        ...withMutationIntent({ method: 'POST' })
      });
    } catch (err) {
      console.error('Logout request failed:', err);
    }
    resetSession();
    onLogout?.();
  }, [apiUrl, onLogout, resetSession, withMutationIntent]);

  return {
    accessCodeInput,
    appVersion,
    apiFetch,
    authError,
    authState,
    isSubmittingAuth,
    logout,
    sessionRole,
    setAccessCodeInput,
    setAuthError,
    submitAccessCode
  };
}
