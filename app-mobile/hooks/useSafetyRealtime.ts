/**
 * PACK 363 — Safety/Panic Signal Realtime Hook
 * 
 * Provides MAX priority realtime safety signals:
 * - Panic button triggers
 * - High-risk event detection
 * - Emergency contacts notification
 * - Support system integration
 * 
 * CRITICAL: Bypasses normal throttling for immediate delivery
 */

import { useEffect, useState, useCallback } from 'react';
import { getRealtimeBus, RealtimeEvent } from '../lib/realtime/realtimeBus';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type SafetyEventType =
  | 'panic_triggered'
  | 'high_risk_detected'
  | 'emergency_contact_notified'
  | 'safety_check_request'
  | 'location_shared'
  | 'help_arrived'
  | 'all_clear';

export type SafetyEventSeverity = 
  | 'info'
  | 'warning'
  | 'critical'
  | 'emergency';

export interface SafetyEvent {
  id: string;
  userId: string;
  type: SafetyEventType;
  severity: SafetyEventSeverity;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  context?: {
    triggeredBy?: 'user' | 'system' | 'ai';
    relatedUserId?: string;
    relatedConversationId?: string;
    relatedEventId?: string;
    description?: string;
  };
  createdAt: number;
  resolvedAt?: number;
  resolution?: string;
}

export interface SafetyStatus {
  isActive: boolean;
  activeEventId?: string;
  severity?: SafetyEventSeverity;
  emergencyContactsNotified: boolean;
  supportNotified: boolean;
  lastCheckedAt?: number;
}

export interface SafetyRealtimeState {
  safetyStatus: SafetyStatus;
  recentEvents: SafetyEvent[];
  isConnected: boolean;
}

export interface SafetyRealtimeActions {
  triggerPanic: (context?: SafetyEvent['context']) => Promise<void>;
  shareLocation: (latitude: number, longitude: number) => Promise<void>;
  markAllClear: (eventId: string, resolution?: string) => Promise<void>;
  acknowledgeSafetyCheck: () => Promise<void>;
}

// ============================================================================
// SAFETY REALTIME HOOK
// ============================================================================

export function useSafetyRealtime(
  userId: string
): [SafetyRealtimeState, SafetyRealtimeActions] {
  
  const [state, setState] = useState<SafetyRealtimeState>({
    safetyStatus: {
      isActive: false,
      emergencyContactsNotified: false,
      supportNotified: false
    },
    recentEvents: [],
    isConnected: false
  });

  const realtimeBus = getRealtimeBus();

  // ==========================================================================
  // SUBSCRIPTION SETUP
  // ==========================================================================

  useEffect(() => {
    if (!userId) return;

    // Subscribe to safety events with HIGH priority
    const unsubscribe = realtimeBus.subscribe<any>(
      'safety',
      handleRealtimeEvent,
      { 
        resourceId: userId,
        filters: { 'payload.userId': userId }
      }
    );

    // Check connection status
    const connectionStatus = realtimeBus.getStatus();
    setState(prev => ({ ...prev, isConnected: connectionStatus === 'connected' }));

    // Monitor connection changes (more frequent for safety)
    const connectionInterval = setInterval(() => {
      const status = realtimeBus.getStatus();
      setState(prev => ({ ...prev, isConnected: status === 'connected' }));
    }, 2000); // Check every 2s (vs 5s for other channels)

    return () => {
      unsubscribe();
      clearInterval(connectionInterval);
    };
  }, [userId]);

  // ==========================================================================
  // EVENT HANDLER
  // ==========================================================================

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    // Log all safety events for audit
    console.log('[SAFETY EVENT]', event.type, event.payload);

    switch (event.type) {
      case 'safety:panic_triggered':
        handlePanicTriggered(event.payload);
        break;
      
      case 'safety:high_risk_detected':
        handleHighRiskDetected(event.payload);
        break;
      
      case 'safety:emergency_contact_notified':
        handleEmergencyContactNotified(event.payload);
        break;
      
      case 'safety:safety_check_request':
        handleSafetyCheckRequest(event.payload);
        break;
      
      case 'safety:location_shared':
        handleLocationShared(event.payload);
        break;
      
      case 'safety:all_clear':
        handleAllClear(event.payload);
        break;
      
      default:
        console.log('[useSafetyRealtime] Unknown event type:', event.type);
    }
  }, []);

  // ==========================================================================
  // SAFETY EVENT HANDLERS
  // ==========================================================================

  const handlePanicTriggered = (payload: any) => {
    const safetyEvent: SafetyEvent = {
      id: payload.eventId,
      userId: payload.userId,
      type: 'panic_triggered',
      severity: 'emergency',
      location: payload.location,
      context: payload.context,
      createdAt: payload.timestamp || Date.now()
    };

    setState(prev => ({
      ...prev,
      safetyStatus: {
        isActive: true,
        activeEventId: payload.eventId,
        severity: 'emergency',
        emergencyContactsNotified: false,
        supportNotified: false
      },
      recentEvents: [safetyEvent, ...prev.recentEvents]
    }));

    // Trigger device-level alerts (vibration, sound, etc.)
    triggerDeviceAlert('emergency');
  };

  const handleHighRiskDetected = (payload: any) => {
    const safetyEvent: SafetyEvent = {
      id: payload.eventId,
      userId: payload.userId,
      type: 'high_risk_detected',
      severity: 'critical',
      context: payload.context,
      createdAt: payload.timestamp || Date.now()
    };

    setState(prev => {
      // Only update if no active emergency
      if (prev.safetyStatus.severity === 'emergency') {
        return {
          ...prev,
          recentEvents: [safetyEvent, ...prev.recentEvents]
        };
      }

      return {
        ...prev,
        safetyStatus: {
          ...prev.safetyStatus,
          isActive: true,
          activeEventId: payload.eventId,
          severity: 'critical'
        },
        recentEvents: [safetyEvent, ...prev.recentEvents]
      };
    });

    triggerDeviceAlert('warning');
  };

  const handleEmergencyContactNotified = (payload: any) => {
    setState(prev => ({
      ...prev,
      safetyStatus: {
        ...prev.safetyStatus,
        emergencyContactsNotified: true
      }
    }));
  };

  const handleSafetyCheckRequest = (payload: any) => {
    const safetyEvent: SafetyEvent = {
      id: payload.eventId,
      userId: payload.userId,
      type: 'safety_check_request',
      severity: 'warning',
      context: payload.context,
      createdAt: payload.timestamp || Date.now()
    };

    setState(prev => ({
      ...prev,
      safetyStatus: {
        ...prev.safetyStatus,
        lastCheckedAt: payload.timestamp || Date.now()
      },
      recentEvents: [safetyEvent, ...prev.recentEvents]
    }));

    // Show notification to user
    triggerDeviceAlert('info');
  };

  const handleLocationShared = (payload: any) => {
    const safetyEvent: SafetyEvent = {
      id: payload.eventId,
      userId: payload.userId,
      type: 'location_shared',
      severity: 'info',
      location: payload.location,
      createdAt: payload.timestamp || Date.now()
    };

    setState(prev => ({
      ...prev,
      recentEvents: [safetyEvent, ...prev.recentEvents]
    }));
  };

  const handleAllClear = (payload: any) => {
    setState(prev => ({
      ...prev,
      safetyStatus: {
        isActive: false,
        emergencyContactsNotified: false,
        supportNotified: false
      },
      recentEvents: prev.recentEvents.map(e =>
        e.id === payload.eventId
          ? { ...e, resolvedAt: payload.timestamp, resolution: payload.resolution }
          : e
      )
    }));
  };

  // ==========================================================================
  // ACTIONS: TRIGGER PANIC
  // ==========================================================================

  const triggerPanic = useCallback(async (context?: SafetyEvent['context']) => {
    try {
      // Get current location if available
      let location: SafetyEvent['location'] | undefined;
      
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
              maximumAge: 0,
              enableHighAccuracy: true
            });
          });
          
          location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
        } catch (error) {
          console.warn('[useSafetyRealtime] Location unavailable:', error);
        }
      }

      // Create safety event in Firestore
      const eventDoc = await addDoc(collection(db, 'safety_events'), {
        userId,
        type: 'panic_triggered',
        severity: 'emergency',
        location,
        context: {
          ...context,
          triggeredBy: 'user'
        },
        createdAt: serverTimestamp(),
        resolved: false
      });

      // Publish with MAX priority
      await realtimeBus.publish('safety', {
        channel: 'safety',
        type: 'safety:panic_triggered',
        payload: {
          eventId: eventDoc.id,
          userId,
          location,
          context: {
            ...context,
            triggeredBy: 'user'
          },
          timestamp: Date.now()
        },
        priority: 'max' // MAX priority bypasses throttling
      });

      console.log('[PANIC TRIGGERED]', eventDoc.id);

    } catch (error) {
      console.error('[useSafetyRealtime] Trigger panic error:', error);
      
      // Even on error, try to trigger local alert
      triggerDeviceAlert('emergency');
      
      // Retry panic signal (critical)
      setTimeout(() => triggerPanic(context), 2000);
    }
  }, [userId, realtimeBus]);

  // ==========================================================================
  // ACTIONS: SHARE LOCATION
  // ==========================================================================

  const shareLocation = useCallback(async (latitude: number, longitude: number) => {
    try {
      // Create location share event
      const eventDoc = await addDoc(collection(db, 'safety_events'), {
        userId,
        type: 'location_shared',
        severity: 'info',
        location: { latitude, longitude },
        createdAt: serverTimestamp()
      });

      // Publish with high priority
      await realtimeBus.publish('safety', {
        channel: 'safety',
        type: 'safety:location_shared',
        payload: {
          eventId: eventDoc.id,
          userId,
          location: { latitude, longitude },
          timestamp: Date.now()
        },
        priority: 'high'
      });

    } catch (error) {
      console.error('[useSafetyRealtime] Share location error:', error);
    }
  }, [userId, realtimeBus]);

  // ==========================================================================
  // ACTIONS: MARK ALL CLEAR
  // ==========================================================================

  const markAllClear = useCallback(async (eventId: string, resolution?: string) => {
    try {
      // Update event in Firestore
      await updateDoc(doc(db, 'safety_events', eventId), {
        resolved: true,
        resolvedAt: serverTimestamp(),
        resolution: resolution || 'User marked all clear'
      });

      // Publish with high priority
      await realtimeBus.publish('safety', {
        channel: 'safety',
        type: 'safety:all_clear',
        payload: {
          eventId,
          userId,
          resolution,
          timestamp: Date.now()
        },
        priority: 'high'
      });

    } catch (error) {
      console.error('[useSafetyRealtime] Mark all clear error:', error);
    }
  }, [userId, realtimeBus]);

  // ==========================================================================
  // ACTIONS: ACKNOWLEDGE SAFETY CHECK
  // ==========================================================================

  const acknowledgeSafetyCheck = useCallback(async () => {
    try {
      // Log acknowledgement
      await addDoc(collection(db, 'safety_check_responses'), {
        userId,
        status: 'acknowledged',
        timestamp: serverTimestamp()
      });

      setState(prev => ({
        ...prev,
        safetyStatus: {
          ...prev.safetyStatus,
          lastCheckedAt: Date.now()
        }
      }));

    } catch (error) {
      console.error('[useSafetyRealtime] Acknowledge safety check error:', error);
    }
  }, [userId]);

  // ==========================================================================
  // DEVICE ALERT HELPER
  // ==========================================================================

  const triggerDeviceAlert = (level: 'info' | 'warning' | 'emergency') => {
    // Vibration patterns
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      const patterns: Record<string, number[]> = {
        info: [200],
        warning: [200, 100, 200],
        emergency: [500, 100, 500, 100, 500]
      };
      navigator.vibrate(patterns[level]);
    }

    // Additional platform-specific alerts can be added here
    // (e.g., play sound, show system notification, etc.)
  };

  // ==========================================================================
  // RETURN STATE & ACTIONS
  // ==========================================================================

  return [
    state,
    {
      triggerPanic,
      shareLocation,
      markAllClear,
      acknowledgeSafetyCheck
    }
  ];
}

export default useSafetyRealtime;
