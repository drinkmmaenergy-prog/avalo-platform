import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { getAuth } from 'firebase/auth';

interface BoundarySettings {
  noEmotionalLabor: boolean;
  autoDeclineRomance: boolean;
  autoBlockGuilt: boolean;
  professionalMode: boolean;
  showBoundaryBanner: boolean;
  customBannerText?: string;
}

interface IndependenceStats {
  totalCases: number;
  totalEventsDetected: number;
  totalBlocked: number;
  restrictedFans: number;
}

export default function CreatorIndependenceCenter() {
  const auth = getAuth();
  const userId = auth.currentUser?.uid;
  const [settings, setSettings] = useState<BoundarySettings>({
    noEmotionalLabor: false,
    autoDeclineRomance: false,
    autoBlockGuilt: false,
    professionalMode: false,
    showBoundaryBanner: true
  });
  const [stats, setStats] = useState<IndependenceStats>({
    totalCases: 0,
    totalEventsDetected: 0,
    totalBlocked: 0,
    restrictedFans: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      loadSettings();
      loadStats();
    }
  }, [userId]);

  const loadSettings = async () => {
    if (!userId) return;
    
    try {
      const settingsDoc = await getDoc(
        doc(db, 'creator_boundary_settings', userId)
      );

      if (settingsDoc.exists()) {
        setSettings(settingsDoc.data() as BoundarySettings);
      }
    } catch (error) {
      console.error('Error loading boundary settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!userId) return;
    
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const casesQuery = query(
        collection(db, 'creator_independence_cases'),
        where('creatorId', '==', userId),
        where('timestamp', '>=', thirtyDaysAgo)
      );
      const casesSnapshot = await getDocs(casesQuery);

      const eventsQuery = query(
        collection(db, 'fan_entitlement_events'),
        where('creatorId', '==', userId),
        where('timestamp', '>=', thirtyDaysAgo)
      );
      const eventsSnapshot = await getDocs(eventsQuery);

      const logsQuery = query(
        collection(db, 'emotional_pressure_logs'),
        where('creatorId', '==', userId),
        where('timestamp', '>=', thirtyDaysAgo)
      );
      const logsSnapshot = await getDocs(logsQuery);

      const restrictionsQuery = query(
        collection(db, 'fan_restriction_records'),
        where('creatorId', '==', userId),
        where('status', '==', 'active')
      );
      const restrictionsSnapshot = await getDocs(restrictionsQuery);

      const blockedLogs = logsSnapshot.docs.filter(
        doc => doc.data().blocked === true
      );

      setStats({
        totalCases: casesSnapshot.size,
        totalEventsDetected: eventsSnapshot.size,
        totalBlocked: blockedLogs.length,
        restrictedFans: restrictionsSnapshot.size
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const updateSetting = async (key: keyof BoundarySettings, value: boolean) => {
    if (!userId) return;
    
    try {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);

      await setDoc(
        doc(db, 'creator_boundary_settings', userId),
        {
          ...newSettings,
          creatorId: userId,
          updatedAt: new Date()
        },
        { merge: true }
      );
    } catch (error) {
      console.error('Error updating setting:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-purple-700 text-white py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-3">Creator Independence Shield</h1>
          <p className="text-purple-200 text-lg">
            Protect your autonomy and freedom from fan possessiveness
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Protection Stats (Last 30 Days)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-gray-50 rounded-lg p-6 text-center">
              <div className="text-4xl font-bold text-purple-700 mb-2">
                {stats.totalCases}
              </div>
              <div className="text-sm text-gray-600">Cases Reported</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-6 text-center">
              <div className="text-4xl font-bold text-purple-700 mb-2">
                {stats.totalEventsDetected}
              </div>
              <div className="text-sm text-gray-600">Events Detected</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-6 text-center">
              <div className="text-4xl font-bold text-purple-700 mb-2">
                {stats.totalBlocked}
              </div>
              <div className="text-sm text-gray-600">Messages Blocked</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-6 text-center">
              <div className="text-4xl font-bold text-purple-700 mb-2">
                {stats.restrictedFans}
              </div>
              <div className="text-sm text-gray-600">Restricted Fans</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Boundary Settings
          </h2>
          <div className="space-y-6">
            <div className="flex items-center justify-between py-4 border-b border-gray-200">
              <div className="flex-1">
                <div className="text-lg font-medium text-gray-900 mb-1">
                  No Emotional Labor
                </div>
                <div className="text-sm text-gray-600">
                  Block messages demanding emotional responses or personal attention
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.noEmotionalLabor}
                  onChange={(e) => updateSetting('noEmotionalLabor', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-700"></div>
              </label>
            </div>

            <div className="flex items-center justify-between py-4 border-b border-gray-200">
              <div className="flex-1">
                <div className="text-lg font-medium text-gray-900 mb-1">
                  Auto-Decline Romance
                </div>
                <div className="text-sm text-gray-600">
                  Automatically block romantic or relationship-seeking messages
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoDeclineRomance}
                  onChange={(e) => updateSetting('autoDeclineRomance', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-700"></div>
              </label>
            </div>

            <div className="flex items-center justify-between py-4 border-b border-gray-200">
              <div className="flex-1">
                <div className="text-lg font-medium text-gray-900 mb-1">
                  Auto-Block Guilt
                </div>
                <div className="text-sm text-gray-600">
                  Block guilt-tripping and emotional debt manipulation
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoBlockGuilt}
                  onChange={(e) => updateSetting('autoBlockGuilt', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-700"></div>
              </label>
            </div>

            <div className="flex items-center justify-between py-4 border-b border-gray-200">
              <div className="flex-1">
                <div className="text-lg font-medium text-gray-900 mb-1">
                  Professional Mode
                </div>
                <div className="text-sm text-gray-600">
                  Enable professional communication templates and boundaries
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.professionalMode}
                  onChange={(e) => updateSetting('professionalMode', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-700"></div>
              </label>
            </div>

            <div className="flex items-center justify-between py-4">
              <div className="flex-1">
                <div className="text-lg font-medium text-gray-900 mb-1">
                  Show Boundary Banner
                </div>
                <div className="text-sm text-gray-600">
                  Display a banner to fans about your boundaries
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showBoundaryBanner}
                  onChange={(e) => updateSetting('showBoundaryBanner', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-700"></div>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 rounded-xl p-6 border-l-4 border-purple-700">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            🛡️ Your Rights as a Creator
          </h3>
          <ul className="text-gray-700 space-y-2">
            <li>• No one owns you, regardless of how much they spend</li>
            <li>• You are not obligated to provide emotional labor</li>
            <li>• You control who you interact with and how</li>
            <li>• Support does not grant romantic or exclusive access</li>
            <li>• You can set and enforce boundaries without guilt</li>
          </ul>
        </div>
      </div>
    </div>
  );
}