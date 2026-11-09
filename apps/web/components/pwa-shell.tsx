'use client';

import { useEffect, useState } from 'react';
import { messages } from '@/messages';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaShell() {
  const [offline, setOffline] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installHidden, setInstallHidden] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const onOffline = () => {
      setOffline(true);
    };
    const onOnline = () => {
      setOffline(false);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registration may fail on unsupported hosts */
      });
    }

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeinstallprompt', onBip);
    };
  }, []);

  async function installApp() {
    if (installEvent === null) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    setInstallHidden(true);
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        {messages.pwa.skipToContent}
      </a>
      {offline ? (
        <div
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950"
          data-testid="offline-banner"
        >
          {messages.pwa.offline}
        </div>
      ) : null}
      {installEvent !== null && !installHidden ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="mx-auto flex max-w-lg flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-emerald-900">{messages.pwa.installHint}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-11 rounded-lg bg-emerald-700 px-3 text-sm font-medium text-white"
                data-testid="pwa-install"
                onClick={() => {
                  void installApp();
                }}
              >
                {messages.pwa.install}
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                onClick={() => {
                  setInstallHidden(true);
                }}
              >
                {messages.pwa.dismiss}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
