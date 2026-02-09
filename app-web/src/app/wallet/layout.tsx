'use client';

// src/app/wallet/layout.tsx
//
// Auth guard layout for /wallet and all sub-routes (/wallet/buy, /wallet/success).
// Wraps content with AppShell for consistent authenticated navigation.

import AppShell from '@/components/layouts/AppShell';

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  // AppShell handles auth guard, onboarding guard, and navigation
  return <AppShell>{children}</AppShell>;
}
