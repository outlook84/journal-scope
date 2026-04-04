import { useEffect, useState } from 'react';

import { useI18n } from '../i18n-context';
import {
  activatePwaUpdate,
  hasPendingPwaUpdate,
  subscribeToPwaUpdate
} from '../shared/pwa/pwa-manager';

export function PwaUpdateBanner() {
  const { messages } = useI18n();
  const [visible, setVisible] = useState(() => hasPendingPwaUpdate());

  useEffect(() => {
    return subscribeToPwaUpdate(() => {
      setVisible(true);
    });
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[480] flex justify-center">
      <div className="pointer-events-auto flex w-full max-w-[560px] items-center justify-between gap-4 rounded-xl border border-primary/25 bg-surface-container-low px-4 py-3 text-on-surface shadow-[0_22px_48px_rgba(24,34,64,0.22)]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-on-surface">{messages.updateAvailable}</p>
          <p className="mt-1 text-sm text-on-surface-variant">{messages.updateAvailableMessage}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-primary/30 bg-primary/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary/20"
          onClick={() => {
            activatePwaUpdate();
          }}
        >
          {messages.refreshToUpdate}
        </button>
      </div>
    </div>
  );
}
