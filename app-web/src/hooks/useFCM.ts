'use client';

/**
 * useFCM — Firebase Cloud Messaging initialization hook.
 *
 * FIX 56A: Requests notification permission, retrieves FCM token,
 * saves it to Firestore, and handles foreground message display.
 *
 * USAGE: Call inside AppShell (or any authenticated layout) after user is logged in.
 *
 * INVARIANTS:
 *   - Uses requireDb() canonical guard for Firestore access.
 *   - Uses getFirebaseApp() for messaging initialization.
 *   - Token saved under users/{uid}.fcmTokens (arrayUnion).
 *   - Foreground messages shown via toast + browser Notification API.
 *   - Does NOT modify existing notification logic in NotificationProvider.
 */

import { useEffect, useRef } from 'react';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { requireDb, getFirebaseApp } from '@/lib/firebase';
import { toast } from '@/components/ui/Toaster';

/**
 * Initializes FCM for the given user.
 * Must be called inside a component where the user is authenticated.
 *
 * @param uid - The authenticated user's uid. Pass null/undefined when not logged in.
 */
export function useFCM(uid: string | null | undefined): void {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!uid) return;
    if (initializedRef.current) return;

    // Prevent double-init in StrictMode
    initializedRef.current = true;

    const initFCM = async () => {
      try {
        // Check if browser supports notifications
        if (typeof window === 'undefined') return;
        if (!('Notification' in window)) return;

        // Only proceed if permission is already granted
        // (prompt is handled separately by NotificationPrompt component — FIX 56C)
        if (Notification.permission !== 'granted') return;

        // Get messaging instance
        let messaging: Messaging;
        try {
          messaging = getMessaging(getFirebaseApp());
        } catch {
          // getMessaging may fail in unsupported browsers (e.g., Firefox private mode)
          return;
        }

        // Get FCM token
        const token = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '',
        });

        if (token) {
          // Save token to Firestore for backend to use
          await updateDoc(doc(requireDb(), 'users', uid), {
            fcmTokens: arrayUnion(token),
            lastFCMTokenUpdate: serverTimestamp(),
          });
        }

        // Handle foreground messages
        onMessage(messaging, (payload) => {
          const title = payload.notification?.title || 'Avalo';
          const body = payload.notification?.body || '';

          // Show in-app notification toast
          toast({
            type: 'info',
            title,
            description: body,
            duration: 6000,
          });

          // Also show browser notification if tab is not focused
          if (document.hidden && Notification.permission === 'granted') {
            try {
              new Notification(title, {
                body,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-72x72.png',
              });
            } catch {
              // Notification constructor may fail in some contexts
            }
          }
        });
      } catch (err) {
        console.debug('[useFCM] FCM init failed:', err);
      }
    };

    initFCM();

    return () => {
      // No cleanup needed — onMessage listener is scoped to messaging instance lifecycle
    };
  }, [uid]);
}
