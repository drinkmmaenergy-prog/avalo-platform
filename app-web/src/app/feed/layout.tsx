'use client';

/**
 * Feed layout — wraps feed pages with the authenticated AppShell.
 */

import AppShell from '@/components/layouts/AppShell';

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
