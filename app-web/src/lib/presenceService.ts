/**
 * Presence & Typing Service — Firebase Realtime Database
 *
 * FIX 102: Online presence — green dot + "last seen"
 * FIX 103: Typing indicator — real-time "typing..." display
 *
 * Uses Firebase Realtime Database (cheaper than Firestore for frequent writes).
 * RTDB paths:
 *   status/{uid}          → { online: boolean, lastSeen: number }
 *   typing/{chatId}/{uid} → { t: number } | null
 *
 * INVARIANTS:
 *   - Uses requireRtdb() canonical guard for RTDB access.
 *   - onDisconnect ensures offline status is set even on browser crash.
 *   - Typing auto-expires after 5 seconds (client-side check).
 */

import {
  ref,
  onValue,
  set,
  onDisconnect,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/database';
import { requireRtdb } from '@/lib/firebase';

// ============================================================================
// FIX 102: Online Presence
// ============================================================================

/**
 * Initialize presence tracking for the current user.
 * Sets online=true when connected, schedules onDisconnect to set online=false.
 * Call once per session (e.g., in AppShell useEffect).
 */
export function initPresence(uid: string): void {
  const rtdb = requireRtdb();
  const userStatusRef = ref(rtdb, `status/${uid}`);
  const connectedRef = ref(rtdb, '.info/connected');

  onValue(connectedRef, (snap) => {
    if (!snap.val()) return;

    // When we disconnect, update status to offline
    onDisconnect(userStatusRef).set({
      online: false,
      lastSeen: serverTimestamp(),
    });

    // Set current status to online
    set(userStatusRef, {
      online: true,
      lastSeen: serverTimestamp(),
    });
  });
}

/**
 * Subscribe to another user's presence status.
 * Returns an unsubscribe function (call on cleanup).
 *
 * @param uid       - The user ID to monitor
 * @param callback  - Called with (online, lastSeen) on every change
 * @returns Unsubscribe function
 */
export function subscribePresence(
  uid: string,
  callback: (online: boolean, lastSeen: number) => void,
): Unsubscribe {
  const rtdb = requireRtdb();
  const userStatusRef = ref(rtdb, `status/${uid}`);

  return onValue(userStatusRef, (snap) => {
    const data = snap.val();
    callback(data?.online || false, data?.lastSeen || 0);
  });
}

/**
 * Format a "last seen" timestamp into a human-readable string.
 * Returns empty string for invalid timestamps.
 *
 * Examples: "online", "3m ago", "2h ago", "Mar 12"
 */
export function formatLastSeen(ts: number): string {
  if (!ts) return '';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'online';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ============================================================================
// FIX 103: Typing Indicator
// ============================================================================

/**
 * Set typing status for current user in a chat.
 * Writes to RTDB typing/{chatId}/{uid}.
 * Pass isTyping=false (or call with false) to clear.
 *
 * @param chatId   - The chat room ID
 * @param uid      - Current user's UID
 * @param isTyping - Whether user is currently typing
 */
export function setTyping(chatId: string, uid: string, isTyping: boolean): void {
  const rtdb = requireRtdb();
  set(ref(rtdb, `typing/${chatId}/${uid}`), isTyping ? { t: Date.now() } : null);
}

/**
 * Subscribe to another user's typing status in a chat.
 * Auto-expires typing after 5 seconds (if timestamp is stale).
 * Returns an unsubscribe function.
 *
 * @param chatId   - The chat room ID
 * @param uid      - The other user's UID to monitor
 * @param callback - Called with true/false on every change
 * @returns Unsubscribe function
 */
export function subscribeTyping(
  chatId: string,
  uid: string,
  callback: (typing: boolean) => void,
): Unsubscribe {
  const rtdb = requireRtdb();
  return onValue(ref(rtdb, `typing/${chatId}/${uid}`), (snap) => {
    const data = snap.val();
    // Auto-expire typing after 5 seconds
    callback(!!data?.t && (Date.now() - data.t) < 5000);
  });
}
