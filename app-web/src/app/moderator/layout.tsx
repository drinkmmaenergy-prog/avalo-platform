import React from 'react';
import { redirect } from 'next/navigation';
import { ModeratorLayoutShell } from './components/ModeratorLayoutShell';
import { getCurrentUserWithRole } from '@/lib/auth/moderator';

export const metadata = {
  title: 'Moderator Dashboard | Avalo TrustShield',
  description: 'Manage and moderate the Avalo platform',
};

export default async function ModeratorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get current user with role information
  const currentUser = await getCurrentUserWithRole();

  // Check if user is authenticated and has moderator/admin role
  if (!currentUser) {
    // Not authenticated - redirect to home
    redirect('/');
    return null; // TypeScript guard
  }

  if (currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
    // User doesn't have required role - redirect to home
    redirect('/');
    return null; // TypeScript guard
  }

  return (
    <ModeratorLayoutShell currentUser={currentUser}>
      {children}
    </ModeratorLayoutShell>
  );
}