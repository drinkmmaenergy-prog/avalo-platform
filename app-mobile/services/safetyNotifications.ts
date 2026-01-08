/**
 * PACK 77 - Safety Center & Meet-Up Check-In
 * Push notification handling for safety timers
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Configure notification handler
 */
export function configureSafetyNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data;
      
      // Always show safety notifications
      if (data?.type === 'safety_timer_expiring' || 
          data?.type === 'safety_timer_expired' ||
          data?.type === 'safety_panic') {
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        };
      }

      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      };
    },
  });
}

/**
 * Schedule local notification for timer expiry warnings
 */
export async function scheduleTimerExpiryNotifications(
  timerId: string,
  expiresAt: Date,
  note: string
) {
  const now = new Date();
  const expiryTime = new Date(expiresAt).getTime();
  const currentTime = now.getTime();

  // Cancel any existing notifications for this timer
  await cancelTimerNotifications(timerId);

  // Schedule 10-minute warning
  const tenMinBefore = expiryTime - 10 * 60 * 1000;
  if (tenMinBefore > currentTime) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏱️ Timer wygasa za 10 minut',
        body: `Spotkanie: "${note}". Potwierdź, że wszystko OK.`,
        data: {
          type: 'safety_timer_expiring',
          timerId,
          minutesRemaining: 10,
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        type: 'date',
        date: new Date(tenMinBefore),
      } as any,
    });
  }

  // Schedule 5-minute warning
  const fiveMinBefore = expiryTime - 5 * 60 * 1000;
  if (fiveMinBefore > currentTime) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏱️ Timer wygasa za 5 minut',
        body: `Spotkanie: "${note}". Potwierdź bezpieczeństwo.`,
        data: {
          type: 'safety_timer_expiring',
          timerId,
          minutesRemaining: 5,
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        type: 'date',
        date: new Date(fiveMinBefore),
      } as any,
    });
  }

  console.log(`[SafetyNotifications] Scheduled notifications for timer ${timerId}`);
}

/**
 * Cancel all notifications for a specific timer
 */
export async function cancelTimerNotifications(timerId: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  
  const timerNotifications = scheduled.filter(
    (notification) => notification.content.data?.timerId === timerId
  );

  for (const notification of timerNotifications) {
    await Notifications.cancelScheduledNotificationAsync(notification.identifier);
  }

  console.log(`[SafetyNotifications] Cancelled ${timerNotifications.length} notifications for timer ${timerId}`);
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[SafetyNotifications] Notification permissions not granted');
    return false;
  }

  // Configure notification channel for Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('safety', {
      name: 'Safety Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#EF4444',
      sound: 'default',
      enableVibrate: true,
    });
  }

  return true;
}

/**
 * Handle incoming safety notifications
 */
export function setupNotificationListeners(
  onTimerExpiring: (timerId: string, minutesRemaining: number) => void,
  onTimerExpired: (timerId: string, userId: string, userName: string) => void,
  onPanicAlert: (eventId: string, userId: string, userName: string) => void
) {
  // Handle notification received while app is foregrounded
  const foregroundSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      const data = notification.request.content.data as any;

      if (data?.type === 'safety_timer_expiring') {
        onTimerExpiring(data.timerId as string, data.minutesRemaining as number);
      } else if (data?.type === 'safety_timer_expired') {
        onTimerExpired(data.timerId as string, data.alertUserId as string, data.alertUserName as string);
      } else if (data?.type === 'safety_panic') {
        onPanicAlert(data.eventId as string, data.alertUserId as string, data.alertUserName as string);
      }
    }
  );

  // Handle notification response (user tapped notification)
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as any;

      if (data?.type === 'safety_timer_expiring') {
        // Navigate to safety center to check in
        console.log('[SafetyNotifications] User tapped timer expiring notification');
      } else if (data.type === 'safety_timer_expired') {
        // Navigate to alert details
        console.log('[SafetyNotifications] User tapped timer expired notification');
      } else if (data.type === 'safety_panic') {
        // Navigate to alert details
        console.log('[SafetyNotifications] User tapped panic alert notification');
      }
    }
  );

  return () => {
    foregroundSubscription.remove();
    responseSubscription.remove();
  };
}

/**
 * Show local notification when timer is about to expire
 */
export async function showTimerExpiringNotification(
  minutesRemaining: number,
  note: string
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `⏱️ Timer expires in ${minutesRemaining} minutes`,
      body: `Meeting: "${note}". Confirm that everything is OK.`,
      data: {
        type: 'safety_timer_expiring',
        minutesRemaining,
      },
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: null, // Show immediately
  });
}