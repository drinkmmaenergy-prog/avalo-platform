'use client';

/**
 * Messages layout — wraps messages inbox with the authenticated AppShell.
 * FIX 44: Chat inbox layout.
 */

import AppShell from '@/components/layouts/AppShell';

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
