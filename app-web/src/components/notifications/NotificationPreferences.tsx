'use client';

/**
 * NotificationPreferences — FIX 56D
 *
 * Notification settings panel for the /account/security page.
 * Lets the user toggle which notification types they want to receive.
 *
 * Settings are stored in Firestore at users/{uid}.notificationSettings.
 *
 * INVARIANTS:
 *   - Uses requireDb() canonical guard for Firestore access.
 *   - Additive-only — does NOT modify existing security page logic.
 *   - Self-contained section; imported and rendered inside SecurityPage.
 */

import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';
import { toast } from '@/components/ui/Toaster';

interface NotificationSettings {
  messages: boolean;
  tips: boolean;
  follows: boolean;
  bookings: boolean;
  live: boolean;
  marketing: boolean;
  /** FIX 118: Granular notification types */
  matches: boolean;
  likes: boolean;
  comments: boolean;
  events: boolean;
  missions: boolean;
  digest: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  messages: true,
  tips: true,
  follows: true,
  bookings: true,
  live: true,
  marketing: false,
  /** FIX 118: Granular defaults */
  matches: true,
  likes: true,
  comments: true,
  events: true,
  missions: true,
  digest: true,
};

const NOTIFICATION_OPTIONS: {
  key: keyof NotificationSettings;
  label: string;
  desc: string;
}[] = [
  { key: 'matches', label: 'New matches', desc: 'When you match with someone' },
  { key: 'messages', label: 'New messages', desc: 'When someone sends you a message' },
  { key: 'likes', label: 'Someone liked you', desc: 'When someone likes your profile' },
  { key: 'tips', label: 'Tips received', desc: 'When you receive a token tip' },
  { key: 'comments', label: 'Comments on posts', desc: 'When someone comments on your content' },
  { key: 'follows', label: 'New followers', desc: 'When someone follows you' },
  { key: 'bookings', label: 'Booking updates', desc: 'Confirmations, cancellations, reminders' },
  { key: 'live', label: 'Creator went live', desc: 'When creators you follow go live' },
  { key: 'events', label: 'Upcoming events', desc: 'Reminders for events you joined' },
  { key: 'missions', label: 'Daily missions', desc: 'New missions and reward opportunities' },
  { key: 'marketing', label: 'Promotions & offers', desc: 'New features, deals and special offers' },
  { key: 'digest', label: 'Weekly digest email', desc: 'Summary of your weekly activity' },
];

interface NotificationPreferencesProps {
  uid: string;
}

export default function NotificationPreferences({ uid }: NotificationPreferencesProps) {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let active = true;

    getDoc(doc(requireDb(), 'users', uid))
      .then((snap) => {
        if (!active) return;
        const ns = snap.data()?.notificationSettings;
        if (ns) {
          setSettings({ ...DEFAULT_SETTINGS, ...ns });
        }
        setLoaded(true);
      })
      .catch(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [uid]);

  const updateSetting = async (key: keyof NotificationSettings, value: boolean) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);

    try {
      await updateDoc(doc(requireDb(), 'users', uid), {
        notificationSettings: updated,
      });
    } catch (err) {
      // Revert on error
      setSettings(settings);
      toast({ type: 'error', title: 'Failed to update notification setting' });
      console.error('[NotificationPreferences] Update failed:', err);
    }
  };

  if (!loaded) {
    return (
      <div className="mt-6">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <span>🔔</span>
          <span>Notification Preferences</span>
        </h4>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <span>🔔</span>
        <span>Notification Preferences</span>
      </h4>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Choose which push notifications you&apos;d like to receive.
      </p>
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {NOTIFICATION_OPTIONS.map((item, idx) => (
          <div
            key={item.key}
            className={`flex items-center justify-between px-4 py-3 ${
              idx < NOTIFICATION_OPTIONS.length - 1
                ? 'border-b border-gray-100 dark:border-gray-700'
                : ''
            }`}
          >
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {item.label}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{item.desc}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings[item.key]}
                onChange={(e) => updateSetting(item.key, e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500" />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
