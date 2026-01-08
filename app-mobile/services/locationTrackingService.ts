/**
 * PACK 76 - Location Tracking Service
 * Handles foreground and background location tracking for geoshare sessions
 */

import * as Location from 'expo-location';
import { updateGeoshareLocation } from './geoshareService';
import { GEOSHARE_CONFIG } from '../config/geoshare';

// Task name for background location tracking
const BACKGROUND_LOCATION_TASK = 'geoshare-background-location';

// Active session tracking state
let activeSessionId: string | null = null;
let foregroundLocationSubscription: Location.LocationSubscription | null = null;
let lastUpdateTime: number = 0;

/**
 * Request location permissions
 */
export async function requestLocationPermissions(): Promise<{
  granted: boolean;
  foreground: boolean;
  background: boolean;
}> {
  try {
    // Request foreground permission
    const foregroundStatus = await Location.requestForegroundPermissionsAsync();
    const foregroundGranted = foregroundStatus.status === 'granted';

    // Request background permission
    const backgroundStatus = await Location.requestBackgroundPermissionsAsync();
    const backgroundGranted = backgroundStatus.status === 'granted';

    return {
      granted: foregroundGranted && backgroundGranted,
      foreground: foregroundGranted,
      background: backgroundGranted,
    };
  } catch (error) {
    console.error('Error requesting location permissions:', error);
    return {
      granted: false,
      foreground: false,
      background: false,
    };
  }
}

/**
 * Check if location permissions are granted
 */
export async function hasLocationPermissions(): Promise<boolean> {
  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    const background = await Location.getBackgroundPermissionsAsync();

    return (
      foreground.status === 'granted' &&
      background.status === 'granted'
    );
  } catch (error) {
    console.error('Error checking location permissions:', error);
    return false;
  }
}

/**
 * Get current location
 */
export async function getCurrentLocation(): Promise<Location.LocationObject | null> {
  try {
    const hasPermissions = await hasLocationPermissions();
    if (!hasPermissions) {
      throw new Error('Location permissions not granted');
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return location;
  } catch (error) {
    console.error('Error getting current location:', error);
    return null;
  }
}

/**
 * Should update location (rate limiting)
 */
function shouldUpdateLocation(): boolean {
  const now = Date.now();
  const secondsSinceLastUpdate = (now - lastUpdateTime) / 1000;
  return secondsSinceLastUpdate >= GEOSHARE_CONFIG.MIN_UPDATE_INTERVAL_SECONDS;
}

/**
 * Send location update to server
 */
async function sendLocationUpdate(
  sessionId: string,
  location: Location.LocationObject
): Promise<void> {
  try {
    if (!shouldUpdateLocation()) {
      console.log('Skipping location update (rate limited)');
      return;
    }

    await updateGeoshareLocation(
      sessionId,
      location.coords.latitude,
      location.coords.longitude,
      location.coords.accuracy || 0
    );

    lastUpdateTime = Date.now();
    console.log('Location update sent successfully');
  } catch (error) {
    console.error('Error sending location update:', error);
    // Don't throw - continue tracking even if update fails
  }
}

/**
 * Start foreground location tracking
 */
export async function startForegroundTracking(sessionId: string): Promise<void> {
  try {
    const hasPermissions = await hasLocationPermissions();
    if (!hasPermissions) {
      throw new Error('Location permissions not granted');
    }

    // Stop any existing tracking
    await stopForegroundTracking();

    activeSessionId = sessionId;

    // Start watching location
    foregroundLocationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: GEOSHARE_CONFIG.BACKGROUND.TIME_INTERVAL,
        distanceInterval: GEOSHARE_CONFIG.BACKGROUND.DISTANCE_INTERVAL,
      },
      async (location) => {
        if (activeSessionId) {
          await sendLocationUpdate(activeSessionId, location);
        }
      }
    );

    console.log('Foreground location tracking started');
  } catch (error) {
    console.error('Error starting foreground tracking:', error);
    throw error;
  }
}

/**
 * Stop foreground location tracking
 */
export async function stopForegroundTracking(): Promise<void> {
  try {
    if (foregroundLocationSubscription) {
      foregroundLocationSubscription.remove();
      foregroundLocationSubscription = null;
    }

    activeSessionId = null;
    lastUpdateTime = 0;

    console.log('Foreground location tracking stopped');
  } catch (error) {
    console.error('Error stopping foreground tracking:', error);
  }
}

/**
 * Start background location tracking
 * Note: Background tracking requires task registration in app.json
 */
export async function startBackgroundTracking(sessionId: string): Promise<void> {
  try {
    const hasPermissions = await hasLocationPermissions();
    if (!hasPermissions) {
      throw new Error('Location permissions not granted');
    }

    activeSessionId = sessionId;

    // Start background location updates
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: GEOSHARE_CONFIG.BACKGROUND.TIME_INTERVAL,
      distanceInterval: GEOSHARE_CONFIG.BACKGROUND.DISTANCE_INTERVAL,
      foregroundService: {
        notificationTitle: 'Location Sharing Active',
        notificationBody: 'Avalo is sharing your location',
        notificationColor: '#007AFF',
      },
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Other,
      showsBackgroundLocationIndicator: true,
    });

    console.log('Background location tracking started');
  } catch (error) {
    console.error('Error starting background tracking:', error);
    throw error;
  }
}

/**
 * Stop background location tracking
 */
export async function stopBackgroundTracking(): Promise<void> {
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK
    );

    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }

    activeSessionId = null;
    lastUpdateTime = 0;

    console.log('Background location tracking stopped');
  } catch (error) {
    console.error('Error stopping background tracking:', error);
  }
}

/**
 * Start complete location tracking (foreground + background)
 */
export async function startLocationTracking(sessionId: string): Promise<void> {
  try {
    // Start both foreground and background tracking
    await startForegroundTracking(sessionId);
    await startBackgroundTracking(sessionId);

    console.log('Complete location tracking started for session:', sessionId);
  } catch (error) {
    console.error('Error starting location tracking:', error);
    // Clean up on error
    await stopLocationTracking();
    throw error;
  }
}

/**
 * Stop complete location tracking
 */
export async function stopLocationTracking(): Promise<void> {
  try {
    await stopForegroundTracking();
    await stopBackgroundTracking();

    console.log('Complete location tracking stopped');
  } catch (error) {
    console.error('Error stopping location tracking:', error);
  }
}

/**
 * Get tracking status
 */
export function isTracking(): boolean {
  return activeSessionId !== null;
}

/**
 * Get active session ID
 */
export function getActiveSessionId(): string | null {
  return activeSessionId;
}

// Background task definition (must be defined at top level)
// This will be registered in the app initialization
export function defineBackgroundLocationTask(): void {
  // Background location updates will be handled here
  // This is a placeholder - actual implementation requires TaskManager
  console.log('Background location task defined');
}