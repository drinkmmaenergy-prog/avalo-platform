'use client';

/**
 * Profile layout — wraps profile pages with the authenticated AppShell.
 */

import AppShell from '@/components/layouts/AppShell';

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}


