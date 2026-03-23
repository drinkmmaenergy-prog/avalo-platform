'use client';

/**
 * NotificationPrompt — FIX 56C
 *
 * Shows a bottom-sheet-style prompt asking the user to enable browser push
 * notifications. Displayed 5 seconds after login IF the browser supports
 * notifications AND permission has not yet been requested (still 'default').
 *
 * After the user clicks Enable or Later, the prompt dismisses and does NOT
 * reappear for the session (no persistent dismissal — intentional for re-engagement).
 *
 * INVARIANTS:
 *   - Does NOT auto-request permission — only requests on explicit user click.
 *   - Does NOT modify any existing component or provider logic.
 *   - Self-contained component; import and render inside AppShell.
 */

import { useEffect, useState } from 'react';

interface NotificationPromptProps {
  /** The authenticated user's uid. Pass null/undefined when not logged in. */
  uid: string | null | undefined;
}

export default function NotificationPrompt({ uid }: NotificationPromptProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!uid) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    // Show after 5 seconds
    const timer = setTimeout(() => setShow(true), 5000);
    return () => clearTimeout(timer);
  }, [uid]);

  if (!show) return null;

  const handleEnable = async () => {
    try {
      await Notification.requestPermission();
    } catch {
      // Safari may throw on requestPermission
    }
    setShow(false);
  };

  const handleLater = () => {
    setShow(false);
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-white dark:bg-gray-800 shadow-xl rounded-2xl border border-gray-200 dark:border-gray-700 p-4 z-50 animate-fade-in">
      <h4 className="font-semibold text-sm text-gray-900 dark:text-white">
        Stay in the loop!
      </h4>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Get notified about new messages, tips, bookings, and when creators go live.
      </p>
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleEnable}
          className="flex-1 py-2 bg-[#E4458F] text-white rounded-lg text-sm font-medium hover:bg-[#d13d80] transition-colors"
        >
          Enable
        </button>
        <button
          onClick={handleLater}
          className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          Later
        </button>
      </div>
    </div>
  );
}
