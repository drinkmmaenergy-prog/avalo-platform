'use client';

/**
 * AI section layout — wraps AI pages with the authenticated AppShell.
 */

import AppShell from '@/components/layouts/AppShell';

export default function AILayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}


