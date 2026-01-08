/**
 * Smart Suggestions Screen
 * PACK 36: Smart Suggestions Feed with Tabs
 * Layout: Header title from i18n, 3 tabs (Top Picks, Promising, Worth Checking Out)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { getProfile, ProfileData } from "@/lib/profileService";
import { useSmartSuggestions, SuggestedProfile } from "@/hooks/useSmartSuggestions";
import { useTranslation } from "@/hooks/useTranslation";
import SuggestedProfileCard from "@/components/SuggestedProfileCard";
import { performRightSwipe } from "@/services/swipeBridgeService";

type TabType = 'top' | 'promising' | 'worth';

export default function SuggestionsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('top');
  const [userProfile, setUserProfile] = useState<ProfileData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load user profile
  React.useEffect(() => {
    if (user?.uid) {
      loadUserProfile();
    }
  }, [user?.uid]);

  const loadUserProfile = async () => {
    if (!user?.uid) return;
    try {
      const profile = await getProfile(user.uid);
      setUserProfile(profile);
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  // Get suggestions
  const {
    topPicks,
    promising,
    worthChecking,
    loading,
    error,
    refresh,
  } = useSmartSuggestions(user?.uid, userProfile);

  const handleSwipeAction = async (profileId: string) => {
    if (!user?.uid) return;
    try {
      await performRightSwipe(user.uid, profileId);
    } catch (error) {
      console.error('Error performing swipe:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const getActiveProfiles = (): SuggestedProfile[] => {
    switch (activeTab) {
      case 'top':
        return topPicks;
      case 'promising':
        return promising;
      case 'worth':
        return worthChecking;
      default:
        return [];
    }
  };

  const renderTab = (tab: TabType, label: string) => (
    <TouchableOpacity
      style={[styles.tab, activeTab === tab && styles.tabActive]}
      onPress={() => setActiveTab(tab)}
    >
      <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
        {label}
      </Text>
      <View style={[styles.tabIndicator, activeTab === tab && styles.tabIndicatorActive]} />
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>😊</Text>
      <Text style={styles.emptyTitle}>{t('smartSuggestions.emptyTitle')}</Text>
      <Text style={styles.emptySubtitle}>{t('smartSuggestions.emptySubtitle')}</Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => router.push('/(tabs)/swipe' as any)}
      >
        <Text style={styles.emptyButtonText}>{t('smartSuggestions.ctaSwipe')}</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && !userProfile) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('smartSuggestions.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
          <Text style={styles.loadingText}>Loading suggestions...</Text>
        </View>
      </View>
    );
  }

  const activeProfiles = getActiveProfiles();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('smartSuggestions.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {renderTab('top', t('smartSuggestions.topPicks'))}
        {renderTab('promising', t('smartSuggestions.promising'))}
        {renderTab('worth', t('smartSuggestions.worthCheckingOut'))}
      </View>

      {/* Profile List */}
      <FlatList
        data={activeProfiles}
        renderItem={({ item }) => (
          <SuggestedProfileCard
            profile={item}
            onSwipeAction={handleSwipeAction}
          />
        )}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#D4AF37']}
            tintColor="#D4AF37"
          />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#181818',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 24,
    color: '#fff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#aaa',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#181818',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabActive: {
    // Active tab styling
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  tabTextActive: {
    color: '#D4AF37',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'transparent',
  },
  tabIndicatorActive: {
    backgroundColor: '#D4AF37',
  },
  listContent: {
    paddingVertical: 16,
    paddingBottom: 32,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
});
