/**
 * PACK 210: Safety Tracking Service
 * Continuous location tracking during active safety sessions
 */

import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as TaskManager from 'expo-task-manager';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';

const LOCATION_TRACKING_TASK = 'safety-location-tracking';
const NORMAL_INTERVAL = 15000; // 15 seconds
const LOW_BATTERY_INTERVAL = 60000; // 60 seconds
const LOW_BATTERY_THRESHOLD = 15; // 15%

interface SafetySession {
  sessionId: string;
  userId: string;
  status: string;
  trackingIntervalSeconds: number;
  lowBatteryMode: boolean;
}

class SafetyTrackingService {
  private sessionId: string | null = null;
  private trackingActive: boolean = false;
  private locationSubscription: Location.LocationSubscription | null = null;
  private batterySubscription: Battery.Subscription | null = null;
  private currentInterval: number = NORMAL_INTERVAL;
  private sessionUnsubscribe: (() => void) | null = null;

  /**
   * Start safety tracking for a session
   */
  async startTracking(sessionId: string): Promise<void> {
    if (this.trackingActive) {
      console.log('Safety tracking already active');
      return;
    }

    this.sessionId = sessionId;

    // Request location permissions
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      throw new Error('Location permission denied');
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.warn('Background location permission denied - tracking will pause when app is backgrounded');
    }

    // Start foreground location tracking
    await this.startForegroundTracking();

    // Start background tracking if permission granted
    if (backgroundStatus === 'granted') {
      await this.startBackgroundTracking();
    }

    // Monitor battery level
    this.startBatteryMonitoring();

    // Listen to session updates
    this.listenToSessionUpdates(sessionId);

    this.trackingActive = true;
    console.log(`Safety tracking started for session ${sessionId}`);
  }

  /**
   * Stop safety tracking
   */
  async stopTracking(): Promise<void> {
    if (!this.trackingActive) {
      return;
    }

    // Stop foreground tracking
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }

    // Stop background tracking
    await this.stopBackgroundTracking();

    // Stop battery monitoring
    if (this.batterySubscription) {
      this.batterySubscription.remove();
      this.batterySubscription = null;
    }

    // Stop session listener
    if (this.sessionUnsubscribe) {
      this.sessionUnsubscribe();
      this.sessionUnsubscribe = null;
    }

    this.trackingActive = false;
    this.sessionId = null;
    console.log('Safety tracking stopped');
  }

  /**
   * Start foreground location tracking
   */
  private async startForegroundTracking(): Promise<void> {
    this.locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: this.currentInterval,
        distanceInterval: 0, // Update regardless of distance
      },
      async (location) => {
        await this.sendLocationUpdate(location);
      }
    );
  }

  /**
   * Start background location tracking
   */
  private async startBackgroundTracking(): Promise<void> {
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: this.currentInterval,
        distanceInterval: 0,
        foregroundService: {
          notificationTitle: 'Safety Tracking Active',
          notificationBody: 'Avalo is tracking your location for safety',
          notificationColor: '#ff3b30',
        },
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
      });
    } catch (error) {
      console.error('Failed to start background tracking:', error);
    }
  }

  /**
   * Stop background location tracking
   */
  private async stopBackgroundTracking(): Promise<void> {
    try {
      const isTaskDefined = await TaskManager.isTaskDefined(LOCATION_TRACKING_TASK);
      if (isTaskDefined) {
        await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
      }
    } catch (error) {
      console.error('Failed to stop background tracking:', error);
    }
  }

  /**
   * Send location update to backend
   */
  private async sendLocationUpdate(location: Location.LocationObject): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    try {
      const functions = getFunctions();
      const updateLocation = httpsCallable(functions, 'pack210_updateLocation');

      const batteryLevel = await Battery.getBatteryLevelAsync();

      const result = await updateLocation({
        sessionId: this.sessionId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        speed: location.coords.speed,
        heading: location.coords.heading,
        batteryLevel: Math.round(batteryLevel * 100),
      });

      const data = result.data as any;

      // Check if interval changed (low battery mode)
      if (data.intervalChanged && data.newInterval) {
        console.log(`Tracking interval changed to ${data.newInterval}s`);
        await this.updateTrackingInterval(data.newInterval * 1000);
      }
    } catch (error) {
      console.error('Failed to send location update:', error);
    }
  }

  /**
   * Update tracking interval (for low battery mode)
   */
  private async updateTrackingInterval(newInterval: number): Promise<void> {
    if (this.currentInterval === newInterval) {
      return;
    }

    this.currentInterval = newInterval;

    // Restart foreground tracking with new interval
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      await this.startForegroundTracking();
    }

    // Restart background tracking with new interval
    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status === 'granted') {
      await this.stopBackgroundTracking();
      await this.startBackgroundTracking();
    }
  }

  /**
   * Monitor battery level
   */
  private startBatteryMonitoring(): void {
    this.batterySubscription = Battery.addBatteryLevelListener(async ({ batteryLevel }) => {
      const level = Math.round(batteryLevel * 100);
      
      if (level < LOW_BATTERY_THRESHOLD && this.currentInterval !== LOW_BATTERY_INTERVAL) {
        console.log(`Low battery detected (${level}%) - switching to extended interval`);
        await this.updateTrackingInterval(LOW_BATTERY_INTERVAL);
      } else if (level >= LOW_BATTERY_THRESHOLD && this.currentInterval !== NORMAL_INTERVAL) {
        console.log(`Battery recovered (${level}%) - switching to normal interval`);
        await this.updateTrackingInterval(NORMAL_INTERVAL);
      }
    });
  }

  /**
   * Listen to session updates (in case of remote changes)
   */
  private listenToSessionUpdates(sessionId: string): void {
    const db = getFirestore();
    const sessionRef = doc(db, 'safety_sessions', sessionId);

    this.sessionUnsubscribe = onSnapshot(sessionRef, (snapshot) => {
      if (!snapshot.exists()) {
        console.log('Session no longer exists - stopping tracking');
        this.stopTracking();
        return;
      }

      const session = snapshot.data() as SafetySession;

      // If session ended remotely, stop tracking
      if (session.status !== 'ACTIVE') {
        console.log('Session ended - stopping tracking');
        this.stopTracking();
      }
    });
  }

  /**
   * Check if tracking is active
   */
  isTrackingActive(): boolean {
    return this.trackingActive;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.sessionId;
  }
}

// Define background task
TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }

  if (data) {
    const { locations } = data as any;
    if (locations && locations.length > 0) {
      const location = locations[0];
      
      // Get session ID from storage (you may need to implement AsyncStorage)
      // For now, we'll skip background updates as they need proper session management
      console.log('Background location update:', location.coords);
    }
  }
});

// Export singleton instance
export const safetyTrackingService = new SafetyTrackingService();