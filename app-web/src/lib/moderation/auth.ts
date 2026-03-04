/**
 * Moderation Auth — Client-side moderator access checks.
 */

import { doc, getDoc } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { auth } from '@/lib/firebase';

export interface ModeratorUser {
  uid: string;
  email: string;
  role: string;
  displayName?: string;
}

/**
 * Check if the current user has moderator or admin access.
 */
export async function checkModeratorAccess(): Promise<ModeratorUser | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const ref = doc(requireDb(), 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  const data = snap.data();
  const role = data.role;

  if (role !== 'moderator' && role !== 'admin') return null;

  return {
    uid: user.uid,
    email: user.email ?? '',
    role,
    displayName: data.displayName ?? user.displayName ?? '',
  };
}
