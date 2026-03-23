/**
 * FIX 108: Mission Progress Tracker
 *
 * Call from action handlers to increment daily mission progress.
 * Uses Firestore increment() for atomic, concurrent-safe updates.
 *
 * Usage:
 *   handleLike → trackMissionProgress(uid, 'like_5');
 *   sendMessage → trackMissionProgress(uid, 'send_message');
 *   viewProfile → trackMissionProgress(uid, 'view_10');
 *
 * INVARIANTS:
 *   - Uses requireDb() canonical guard.
 *   - Writes to users/{uid}/daily_missions/{todayKey}.
 *   - Firestore increment() is atomic — safe for concurrent calls.
 */

import { doc, setDoc, increment } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

/**
 * Track mission progress for a given action.
 *
 * @param uid       - The user's Firebase UID
 * @param action    - Mission action key (e.g. 'like_5', 'send_message', 'view_10')
 * @param count     - Number of units to increment (default 1)
 */
export async function trackMissionProgress(
  uid: string,
  action: string,
  count: number = 1
): Promise<void> {
  const db = requireDb();
  const todayKey = new Date().toISOString().split('T')[0];

  await setDoc(
    doc(db, 'users', uid, 'daily_missions', todayKey),
    {
      [`progress.${action}`]: increment(count),
    },
    { merge: true }
  );
}

export default trackMissionProgress;
