/**
 * Moderation Auth — Client-side moderator access control.
 *
 * Checks if the current Firebase user has moderator/admin role
 * by reading the users/{uid} document from Firestore.
 */

'use client';

import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export interface ModeratorUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'moderator' | 'admin' | 'super_admin';
  permissions: string[];
}

/**
 * Check if the current user has moderator access.
 * Returns the ModeratorUser if authorized, null otherwise.
 */
export async function checkModeratorAccess(): Promise<ModeratorUser | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  const ref = doc(db, 'users', currentUser.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  const data = snap.data();
  const role = data.role as string;

  if (!['moderator', 'admin', 'super_admin'].includes(role)) {
    return null;
  }

  return {
    uid: currentUser.uid,
    email: currentUser.email ?? '',
    displayName: currentUser.displayName ?? '',
    role: role as ModeratorUser['role'],
    permissions: data.permissions ?? [],
  };
}

/**
 * Get display name for a role.
 */
export function getRoleDisplayName(role: string): string {
  const names: Record<string, string> = {
    moderator: 'Moderator',
    admin: 'Admin',
    super_admin: 'Super Admin',
  };
  return names[role] ?? 'User';
}

/**
 * Get badge color for role.
 */
export function getRoleBadgeColor(role: string): string {
  const colors: Record<string, string> = {
    moderator: 'bg-blue-100 text-blue-800',
    admin: 'bg-purple-100 text-purple-800',
    super_admin: 'bg-red-100 text-red-800',
  };
  return colors[role] ?? 'bg-gray-100 text-gray-800';
}
