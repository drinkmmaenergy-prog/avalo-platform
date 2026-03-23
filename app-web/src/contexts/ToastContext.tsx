'use client';

/**
 * ToastContext — FIX 131: Context-based access to the global toast system.
 *
 * Wraps the existing toast() function from @/components/ui/Toaster
 * for React context-based access via useToast() hook.
 *
 * Usage:
 *   const { showToast } = useToast();
 *   showToast('Match created!', 'success');
 *   showToast('Purchase confirmed! Receipt sent to your email.', 'info');
 *   showToast('Payout requested. Confirmation sent to your email.', 'success');
 *
 * INVARIANTS:
 *   - Does NOT replace or modify the existing Toaster component.
 *   - The underlying toast() function and Toaster renderer remain canonical.
 */

import React, { createContext, useContext, useCallback, type ReactNode } from 'react';
import { toast as toasterToast, type ToastType } from '@/components/ui/Toaster';

interface ToastContextValue {
  /**
   * Show a toast notification.
   * @param message - The message to display
   * @param type - 'success' | 'error' | 'warning' | 'info' (default: 'info')
   */
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    toasterToast({
      type,
      title: message,
    });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
    </ToastContext.Provider>
  );
}

/**
 * Hook to access the toast system from any component.
 *
 * @example
 *   const { showToast } = useToast();
 *   showToast("It's a Match! 🎉 Check your email for details.", 'success');
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}
