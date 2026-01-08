/**
 * PACK 77 - Safety Center & Meet-Up Check-In
 * React hook for panic button functionality
 */

import { useState, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import * as Location from 'expo-location';
import { Alert } from 'react-native';
import {
  TriggerPanicRequest,
  TriggerPanicResponse,
  LocationSnapshot,
} from '../types/safetyTimer';

const functions = getFunctions();

export interface UsePanicButtonResult {
  triggering: boolean;
  error: string | null;
  triggerPanic: () => Promise<void>;
}

export function usePanicButton(): UsePanicButtonResult {
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerPanic = useCallback(async () => {
    const auth = getAuth();
    if (!auth.currentUser) {
      setError('Not authenticated');
      throw new Error('Not authenticated');
    }

    // Show confirmation dialog
    return new Promise<void>((resolve, reject) => {
      Alert.alert(
        'Trigger Panic Button?',
        'This will immediately notify your trusted contacts. Only use in genuine emergencies.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => reject(new Error('Cancelled')),
          },
          {
            text: 'Trigger Panic',
            style: 'destructive',
            onPress: async () => {
              try {
                setTriggering(true);
                setError(null);

                // Try to get current location
                let lastKnownLocation: LocationSnapshot | undefined = undefined;
                try {
                  const { status } = await Location.requestForegroundPermissionsAsync();
                  if (status === 'granted') {
                    const location = await Location.getCurrentPositionAsync({
                      accuracy: Location.Accuracy.Balanced,
                    });
                    lastKnownLocation = {
                      latitude: location.coords.latitude,
                      longitude: location.coords.longitude,
                      accuracy: location.coords.accuracy || 0,
                      timestamp: new Date(),
                    };
                  }
                } catch (locError) {
                  console.log('[PanicButton] Could not get location:', locError);
                  // Continue without location - it's optional
                }

                const triggerPanicFunc = httpsCallable<
                  TriggerPanicRequest,
                  TriggerPanicResponse
                >(functions, 'safety_triggerPanic');

                const result = await triggerPanicFunc({
                  lastKnownLocation,
                });

                if (result.data.success) {
                  // Show confirmation to user
                  Alert.alert(
                    'Panic Alert Sent',
                    'Your trusted contacts have been notified. Help is on the way.',
                    [{ text: 'OK' }]
                  );
                  resolve();
                } else {
                  throw new Error(result.data.message || 'Failed to trigger panic');
                }
              } catch (err: any) {
                console.error('[PanicButton] Error triggering panic:', err);
                const errorMessage = err.message || 'Failed to trigger panic';
                setError(errorMessage);
                
                Alert.alert(
                  'Error',
                  'Could not send panic alert. Please try again or contact emergency services directly.',
                  [{ text: 'OK' }]
                );
                
                reject(err);
              } finally {
                setTriggering(false);
              }
            },
          },
        ]
      );
    });
  }, []);

  return {
    triggering,
    error,
    triggerPanic,
  };
}