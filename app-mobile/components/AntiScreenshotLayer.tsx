/**
 * Anti-Screenshot Layer
 * Detects screenshot attempts and shows warning toast
 * Does NOT block OS functionality, just warns and logs
 */

import React, { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { addScreenshotListener, removeScreenshotListener } from 'expo-screen-capture';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface AntiScreenshotLayerProps {
  storyId: string;
  userId: string;
  enabled?: boolean;
}

export default function AntiScreenshotLayer({ 
  storyId, 
  userId, 
  enabled = true 
}: AntiScreenshotLayerProps) {
  useEffect(() => {
    if (!enabled) return;

    const subscription = addScreenshotListener(() => {
      // Show warning toast
      Alert.alert(
        '⚠️ Screenshots Not Allowed',
        'Screenshots are not allowed in premium content',
        [{ text: 'OK' }]
      );

      // Log to backend (non-blocking)
      logScreenshotAttempt(userId, storyId).catch((err) => {
        console.error('Failed to log screenshot attempt:', err);
      });
    });

    return () => {
      removeScreenshotListener(subscription);
    };
  }, [enabled, storyId, userId]);

  // Component doesn't render anything
  return null;
}

/**
 * Log screenshot attempt to backend
 */
async function logScreenshotAttempt(userId: string, storyId: string): Promise<void> {
  try {
    await addDoc(collection(db, 'screenshot_attempts'), {
      userId,
      storyId,
      platform: Platform.OS,
      timestamp: serverTimestamp(),
      type: 'premium_story',
    });
  } catch (error) {
    console.error('Failed to log screenshot:', error);
    // Don't throw - logging is non-critical
  }
}

/**
 * Hook for anti-screenshot protection
 */
export function useAntiScreenshot(storyId: string, userId: string, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const subscription = addScreenshotListener(() => {
      Alert.alert(
        '⚠️ Screenshots Not Allowed',
        'Screenshots are not allowed in premium content',
        [{ text: 'OK' }]
      );

      logScreenshotAttempt(userId, storyId).catch(console.error);
    });

    return () => {
      removeScreenshotListener(subscription);
    };
  }, [enabled, storyId, userId]);
}
