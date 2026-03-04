"use client";

/**
 * Case Locking System
 * Prevents multiple moderators from working on the same case
 */

import { doc, setDoc, deleteDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

export interface CaseLock {
  moderatorId: string;
  moderatorName?: string;
  timestamp: Timestamp;
  incidentId: string;
}

/**
 * Acquire a lock on an incident/case
 * Returns true if lock was acquired, false if already locked by someone else
 */
export async function acquireLock(
  incidentId: string,
  moderatorId: string,
  moderatorName?: string
): Promise<boolean> {
  try {
    const lockRef = doc(requireDb(), 'locks', incidentId);
    const lockDoc = await getDoc(lockRef);

    // Check if case is already locked
    if (lockDoc.exists()) {
      const existingLock = lockDoc.data() as CaseLock;
      const lockAge = Date.now() - existingLock.timestamp.toMillis();
      const fiveMinutes = 5 * 60 * 1000;

      // If lock is less than 5 minutes old and by different moderator, don't acquire
      if (lockAge < fiveMinutes && existingLock.moderatorId !== moderatorId) {
        return false;
      }
    }

    // Acquire or refresh lock
    await setDoc(lockRef, {
      moderatorId,
      moderatorName: moderatorName || 'Unknown',
      timestamp: serverTimestamp(),
      incidentId,
    });

    return true;
  } catch (error) {
    console.error('Error acquiring lock:', error);
    return false;
  }
}

/**
 * Release a lock on an incident/case
 */
export async function releaseLock(incidentId: string): Promise<void> {
  try {
    const lockRef = doc(requireDb(), 'locks', incidentId);
    await deleteDoc(lockRef);
  } catch (error) {
    console.error('Error releasing lock:', error);
  }
}

/**
 * Check if a case is currently locked
 */
export async function checkLock(incidentId: string): Promise<CaseLock | null> {
  try {
    const lockRef = doc(requireDb(), 'locks', incidentId);
    const lockDoc = await getDoc(lockRef);

    if (!lockDoc.exists()) {
      return null;
    }

    const lock = lockDoc.data() as CaseLock;
    const lockAge = Date.now() - lock.timestamp.toMillis();
    const fiveMinutes = 5 * 60 * 1000;

    // Check if lock is still valid
    if (lockAge < fiveMinutes) {
      return lock;
    }

    // Lock expired, clean it up
    await deleteDoc(lockRef);
    return null;
  } catch (error) {
    console.error('Error checking lock:', error);
    return null;
  }
}

/**
 * Refresh a lock (keep it alive)
 */
export async function refreshLock(incidentId: string, moderatorId: string): Promise<boolean> {
  try {
    const lockRef = doc(requireDb(), 'locks', incidentId);
    const lockDoc = await getDoc(lockRef);

    if (!lockDoc.exists()) {
      return false;
    }

    const existingLock = lockDoc.data() as CaseLock;

    // Only refresh if we own the lock
    if (existingLock.moderatorId !== moderatorId) {
      return false;
    }

    await setDoc(
      lockRef,
      {
        timestamp: serverTimestamp(),
      },
      { merge: true }
    );

    return true;
  } catch (error) {
    console.error('Error refreshing lock:', error);
    return false;
  }
}

/**
 * Hook helper to automatically acquire and release lock
 */
export function useCaseLock(incidentId: string | null, moderatorId: string) {
  // This would be implemented as a React hook in the component
  // For now, providing the functions above
}
