"use client";

/**
 * Moderator Presence Tracking System
 * Tracks online moderators and their current activities
 */

import { useEffect, useRef, useState } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

export interface ModeratorPresence {
  moderatorId: string;
  displayName?: string;
  email?: string;
  lastSeen: any; // serverTimestamp
  currentIncidentId?: string;
  timeOnCase?: number; // milliseconds
}

/**
 * Initialize moderator presence tracking
 * Call this when moderator logs in or starts session
 */
export async function initializePresence(
  moderatorId: string,
  displayName?: string,
  email?: string
): Promise<void> {
  try {
    const presenceRef = doc(requireDb(), 'moderatorPresence', moderatorId);

    // Set presence
    await setDoc(presenceRef, {
      moderatorId,
      displayName: displayName || 'Moderator',
      email: email || '',
      lastSeen: serverTimestamp(),
      currentIncidentId: null,
      timeOnCase: 0,
    });

    // Setup auto-cleanup on disconnect
    // Note: onDisconnect requires Firebase Realtime Database or special setup
    // For Firestore, we'll rely on periodic updates and timeout checks
  } catch (error) {
    console.error('Error initializing presence:', error);
  }
}

/**
 * Update presence with current activity
 */
export async function updatePresence(
  moderatorId: string,
  currentIncidentId?: string,
  timeOnCase?: number
): Promise<void> {
  try {
    const presenceRef = doc(requireDb(), 'moderatorPresence', moderatorId);

    await setDoc(
      presenceRef,
      {
        lastSeen: serverTimestamp(),
        currentIncidentId: currentIncidentId || null,
        timeOnCase: timeOnCase || 0,
      },
      { merge: true }
    );
  } catch (error) {
    console.error('Error updating presence:', error);
  }
}

/**
 * Remove moderator presence (on logout or session end)
 */
export async function removePresence(moderatorId: string): Promise<void> {
  try {
    const presenceRef = doc(requireDb(), 'moderatorPresence', moderatorId);
    await deleteDoc(presenceRef);
  } catch (error) {
    console.error('Error removing presence:', error);
  }
}

/**
 * React hook to maintain presence heartbeat
 * Updates presence every 10 seconds while component is mounted
 */
export function usePresenceHeartbeat(
  moderatorId: string,
  displayName?: string,
  email?: string,
  currentIncidentId?: string
) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    // Initialize presence on mount
    initializePresence(moderatorId, displayName, email);

    // Reset start time when incident changes
    if (currentIncidentId) {
      startTimeRef.current = Date.now();
    }

    // Setup heartbeat interval (every 10 seconds)
    intervalRef.current = setInterval(() => {
      const timeOnCase = currentIncidentId
        ? Date.now() - startTimeRef.current
        : 0;

      updatePresence(moderatorId, currentIncidentId, timeOnCase);
    }, 10000);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      removePresence(moderatorId);
    };
  }, [moderatorId, displayName, email, currentIncidentId]);

  // Update immediately when incident changes
  useEffect(() => {
    if (currentIncidentId) {
      startTimeRef.current = Date.now();
      updatePresence(moderatorId, currentIncidentId, 0);
    } else {
      updatePresence(moderatorId);
    }
  }, [currentIncidentId, moderatorId]);
}

/**
 * Hook to track time spent on a case
 */
export function useTimeOnCase(incidentId: string | null) {
  const startTimeRef = useRef<number>(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!incidentId) {
      setElapsedTime(0);
      return;
    }

    startTimeRef.current = Date.now();

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTimeRef.current);
    }, 1000);

    return () => clearInterval(interval);
  }, [incidentId]);

  return elapsedTime;
}
