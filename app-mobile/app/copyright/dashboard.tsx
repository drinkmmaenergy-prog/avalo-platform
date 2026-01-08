/**
 * PACK 146 — Creator IP Protection Dashboard
 * View copyright protection status and infringement cases
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

interface CopyrightStats {
  protectedContent: {
    totalItems: number;
    images: number;
    videos: number;
    digitalProducts: number;
  };
  infringements: {
    totalCases: number;
    openCases: number;
    resolvedCases: number;
    successfulTakedowns: number;
  };
  watchlistedUsers: number;
  stats: {
    screenshotAttempts: number;
    recordingAttempts: number;
    duplicateUploadsBlocked: number;
  };
}

interface CopyrightCase {
  caseId: string;
  status: string;
  claimType: string;
  createdAt: any;
  priority: string;
}

export default function CopyrightDashboardScreen() {
  const [stats, setStats] = useState<CopyrightStats | null>(null);
  const [recentCases, setRecentCases] = useState<CopyrightCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      // Load stats from various collections
      const [hashesSnapshot, casesSnapshot, watchlistSnapshot, eventsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'content_hash_registry'), where('ownerId', '==', userId))),
        getDocs(query(collection(db, 'copyright_cases'), where('claimantId', '==', userId))),
        getDocs(query(collection(db, 'piracy_watchlist'))),
        getDocs(query(collection(db, 'screen_capture_events'), where('contentOwnerId', '==', userId))),
      ]);

      // Calculate stats
      const hashes = hashesSnapshot.docs;
      const cases = casesSnapshot.docs.map(doc => doc.data() as CopyrightCase);
      
      const statsData: CopyrightStats = {
        protectedContent: {
          totalItems: hashes.length,
          images: hashes.filter(h => h.data().contentType === 'IMAGE').length,
          videos: hashes.filter(h => h.data().contentType === 'VIDEO').length,
          digitalProducts: hashes.filter(h => h.data().contentType === 'DIGITAL_PRODUCT').length,
        },
        infringements: {
          totalCases: cases.length,
          openCases: cases.filter(c => c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW').length,
          resolvedCases: cases.filter(c => c.status === 'CONTENT_REMOVED' || c.status === 'REJECTED').length,
          successfulTakedowns: cases.filter(c => c.status === 'CONTENT_REMOVED').length,
        },
        watchlistedUsers: watchlistSnapshot.size,
        stats: {
          screenshotAttempts: eventsSnapshot.docs.filter(d => d.data().captureType === 'SCREENSHOT').length,
          recordingAttempts: eventsSnapshot.docs.filter(d => d.data().captureType === 'SCREEN_RECORDING').length,
          duplicateUploadsBlocked: 0, // Would be calculated from duplicate detection logs
        },
      };

      setStats(statsData);

      // Get recent cases
      const recentCasesSnapshot = await getDocs(
        query(
          collection(db, 'copyright_cases'),
          where('claimantId', '==', userId),
          orderBy('createdAt', 'desc'),
          limit(5)
        )
      );

      setRecentCases(recentCasesSnapshot.docs.map(doc => ({
        caseId: doc.id,
        ...(doc.data() as Omit<CopyrightCase, 'caseId'>),
      })));
    } catch (error) {
      console.error('Failed to load copyright data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONTENT_REMOVED':
        return 'text-green-600 dark:text-green-400';
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
      case 'AI_SCANNING':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'REJECTED':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      CRITICAL: 'bg-red-500',
      HIGH: 'bg-orange-500',
      MEDIUM: 'bg-yellow-500',
      LOW: 'bg-green-500',
    };
    return colors[priority as keyof typeof colors] || 'bg-gray-500';
  };

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <ActivityIndicator size="large" color="#EF4444" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Copyright Protection',
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView
        className="flex-1 bg-gray-50 dark:bg-gray-900"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#EF4444" />
        }
      >
        <View className="p-4 space-y-6">
          {/* Protection Status */}
          <View className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-gray-900 dark:text-white">
                Protected Content
              </Text>
              <View className="bg-green-100 dark:bg-green-900/30 px-3 py-1 rounded-full">
                <Text className="text-green-700 dark:text-green-300 font-semibold text-sm">
                  Active
                </Text>
              </View>
            </View>
            
            <View className="space-y-3">
              <View className="flex-row justify-between">
                <Text className="text-gray-600 dark:text-gray-400">Total Items</Text>
                <Text className="font-bold text-gray-900 dark:text-white">
                  {stats?.protectedContent.totalItems || 0}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-600 dark:text-gray-400">Images</Text>
                <Text className="font-bold text-gray-900 dark:text-white">
                  {stats?.protectedContent.images || 0}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-600 dark:text-gray-400">Videos</Text>
                <Text className="font-bold text-gray-900 dark:text-white">
                  {stats?.protectedContent.videos || 0}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-600 dark:text-gray-400">Digital Products</Text>
                <Text className="font-bold text-gray-900 dark:text-white">
                  {stats?.protectedContent.digitalProducts || 0}
                </Text>
              </View>
            </View>
          </View>

          {/* Infringement Cases */}
          <View className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Infringement Cases
            </Text>
            
            <View className="grid grid-cols-2 gap-3">
              <View className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                <Text className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {stats?.infringements.totalCases || 0}
                </Text>
                <Text className="text-blue-700 dark:text-blue-300 text-sm">Total Cases</Text>
              </View>
              
              <View className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
                <Text className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {stats?.infringements.openCases || 0}
                </Text>
                <Text className="text-yellow-700 dark:text-yellow-300 text-sm">Open</Text>
              </View>
              
              <View className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                <Text className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats?.infringements.successfulTakedowns || 0}
                </Text>
                <Text className="text-green-700 dark:text-green-300 text-sm">Takedowns</Text>
              </View>
              
              <View className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                <Text className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {stats?.infringements.resolvedCases || 0}
                </Text>
                <Text className="text-gray-700 dark:text-gray-300 text-sm">Resolved</Text>
              </View>
            </View>
          </View>

          {/* Protection Stats */}
          <View className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Protection Activity
            </Text>
            
            <View className="space-y-3">
              <View className="flex-row justify-between items-center">
                <Text className="text-gray-600 dark:text-gray-400">Screenshot Attempts</Text>
                <Text className="font-bold text-red-600 dark:text-red-400">
                  {stats?.stats.screenshotAttempts || 0}
                </Text>
              </View>
              <View className="flex-row justify-between items-center">
                <Text className="text-gray-600 dark:text-gray-400">Recording Attempts</Text>
                <Text className="font-bold text-red-600 dark:text-red-400">
                  {stats?.stats.recordingAttempts || 0}
                </Text>
              </View>
              <View className="flex-row justify-between items-center">
                <Text className="text-gray-600 dark:text-gray-400">Watchlisted Users</Text>
                <Text className="font-bold text-orange-600 dark:text-orange-400">
                  {stats?.watchlistedUsers || 0}
                </Text>
              </View>
            </View>
          </View>

          {/* Recent Cases */}
          {recentCases.length > 0 && (
            <View className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <Text className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                Recent Cases
              </Text>
              
              <View className="space-y-3">
                {recentCases.map((case_) => (
                  <TouchableOpacity
                    key={case_.caseId}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                    onPress={() => router.push(`/copyright/case/${case_.caseId}` as any)}
                  >
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center gap-2">
                        <View className={`w-2 h-2 rounded-full ${getPriorityBadge(case_.priority)}`} />
                        <Text className="font-semibold text-gray-900 dark:text-white">
                          {case_.claimType.replace(/_/g, ' ')}
                        </Text>
                      </View>
                      <Text className={`font-medium text-sm ${getStatusColor(case_.status)}`}>
                        {case_.status.replace(/_/g, ' ')}
                      </Text>
                    </View>
                    <Text className="text-gray-500 dark:text-gray-400 text-xs">
                      {case_.createdAt?.toDate?.()?.toLocaleDateString() || 'Recent'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Info */}
          <View className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <Text className="text-blue-900 dark:text-blue-100 font-semibold mb-2">
              ℹ️ About Copyright Protection
            </Text>
            <Text className="text-blue-700 dark:text-blue-300 text-sm">
              Your content is automatically protected with visible and invisible watermarks. 
              We scan for duplicates and track unauthorized usage. Zero tolerance for stolen NSFW content.
            </Text>
          </View>
        </View>
      </ScrollView>
    </>
  );
}
