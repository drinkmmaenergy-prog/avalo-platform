/**
 * PACK 92 — Push Notification Registration
 * Handle push notification permissions and token registration
 */

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken, unregisterPushToken } from '../services/notificationService';

/**
 * Request push notification permissions
 */
export async function requestPushPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('Push notifications are not available on simulator/emulator');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permissions denied');
    return false;
  }

  return true;
}

/**
 * Get Expo push token
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PROJECT_ID || 'your-expo-project-id',
    });
    return token.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

/**
 * Register device for push notifications
 * Call this after user logs in
 */
export async function registerForPushNotifications(): Promise<boolean> {
  try {
    // Check if we have permissions
    const hasPermission = await requestPushPermissions();
    if (!hasPermission) {
      return false;
    }

    // Get push token
    const pushToken = await getExpoPushToken();
    if (!pushToken) {
      return false;
    }

    // Generate device ID (use device ID or generate one)
    const deviceId = await generateDeviceId();

    // Get platform
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';

    // Register with backend
    await registerPushToken(deviceId, pushToken, platform);

    console.log('Successfully registered for push notifications');
    return true;
  } catch (error) {
    console.error('Failed to register for push notifications:', error);
    return false;
  }
}

/**
 * Unregister device from push notifications
 * Call this when user logs out
 */
export async function unregisterFromPushNotifications(): Promise<void> {
  try {
    const deviceId = await generateDeviceId();
    await unregisterPushToken(deviceId);
    console.log('Successfully unregistered from push notifications');
  } catch (error) {
    console.error('Failed to unregister from push notifications:', error);
  }
}

/**
 * Generate or retrieve device ID
 */
async function generateDeviceId(): Promise<string> {
  // Get unique device identifier
  // You can use expo-device or generate a UUID and store it
  const deviceId = Device.modelId || Device.osInternalBuildId || 'unknown';
  return `${Platform.OS}_${deviceId}`;
}

/**
 * Configure notification behavior
 * Call this in App.tsx or index.tsx
 */
export function configureNotifications(): void {
  // Set notification handler
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  // Handle notification tap
  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    console.log('Notification tapped:', data);

    // Handle deep link if present
    if (data.deepLink) {
      // Navigate to deep link
      // This will be handled by your router
      console.log('Deep link:', data.deepLink);
    }
  });
}