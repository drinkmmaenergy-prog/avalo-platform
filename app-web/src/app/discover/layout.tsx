'use client';

/**
 * Discover layout — wraps discover pages with the authenticated AppShell.
 */

import AppShell from '@/components/layouts/AppShell';

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
