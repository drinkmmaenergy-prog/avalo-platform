'use client';

/**
 * FIX 67D: PWA Install Prompt — shows "Install Avalo" banner for mobile users.
 *
 * Listens for the `beforeinstallprompt` event (Chrome/Edge/Samsung).
 * Shows the banner 30 seconds after the event fires to avoid interrupting
 * the user's first experience.
 *
 * Usage: include <InstallPrompt /> in a layout (e.g. AppShell).
 */

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show after user has used the app for a bit
      const timer = setTimeout(() => setShowInstallPrompt(true), 30000); // 30 seconds
      return () => clearTimeout(timer);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
  };

  if (!showInstallPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-white dark:bg-gray-800 shadow-xl rounded-2xl border border-gray-200 dark:border-gray-700 p-4 z-50">
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #E8593C, #8B5CF6)' }}
        >
          A
        </div>
        <div>
          <h4 className="font-semibold text-sm text-gray-900 dark:text-white">Install Avalo</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">Add to home screen for the best experience</p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleInstall}
          className="flex-1 py-2 text-white rounded-lg text-sm font-medium"
          style={{ background: 'linear-gradient(135deg, #E8593C, #8B5CF6)' }}
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm"
        >
          Later
        </button>
      </div>
    </div>
  );
}
