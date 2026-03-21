'use client';

/**
 * Account layout — wraps account pages with the authenticated AppShell.
 * Ensures bottom navigation appears on all account pages.
 */

import AppShell from '@/components/layouts/AppShell';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
