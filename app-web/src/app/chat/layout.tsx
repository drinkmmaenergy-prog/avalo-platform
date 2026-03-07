'use client';

/**
 * Chat layout — wraps chat pages with the authenticated AppShell.
 */

import AppShell from '@/components/layouts/AppShell';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}


