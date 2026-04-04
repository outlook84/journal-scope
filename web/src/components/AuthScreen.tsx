import type { FormEvent } from 'react';

import { useI18n } from '../i18n-context';
import type { SessionState } from '../types/app';

type AuthScreenProps = {
  accessCodeInput: string;
  authError: string | null;
  authState: SessionState;
  isSubmittingAuth: boolean;
  lastError: string | null;
  onAccessCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AuthScreen({
  accessCodeInput,
  authError,
  authState,
  isSubmittingAuth,
  lastError,
  onAccessCodeChange,
  onSubmit
}: AuthScreenProps) {
  const { messages } = useI18n();

  return (
    <div className="min-h-screen bg-background text-on-surface font-sans flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant/35 bg-surface-container/80 p-8 shadow-[0_28px_72px_rgba(40,60,140,0.14)] backdrop-blur">
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full ${authState === 'checking' ? 'bg-tertiary animate-pulse' : 'bg-outline'}`} />
            <span className="text-xl font-bold text-on-surface">{messages.appName}</span>
          </div>
          <p className="text-sm text-on-surface-variant/70">
            {authState === 'checking' ? messages.authChecking : messages.authPrompt}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="ui-label">{messages.accessCode}</label>
            <input
              type="password"
              autoFocus
              value={accessCodeInput}
              onChange={(event) => onAccessCodeChange(event.target.value)}
              placeholder={messages.pasteAccessCode}
              className="h-11 w-full rounded-md border border-outline-variant/30 bg-surface-container-highest px-4 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/40"
            />
          </div>

          {(authError || lastError) && (
            <div className="rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
              {authError || lastError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmittingAuth || authState === 'checking'}
            className="flex h-11 w-full items-center justify-center rounded-md border border-primary/20 bg-primary text-on-primary text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmittingAuth ? messages.unlocking : messages.unlockApp}
          </button>
        </form>
      </div>
    </div>
  );
}
