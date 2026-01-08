/**
 * PACK 232 — VIP Settings Screen
 * 
 * Allows users to manage their VIP status, badge visibility, and preferences
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  getVIPProfile,
  getVIPSettings,
  getVIPScoreComponents,
  updateVIPBadgeVisibility,
  updateVIPPrivacyMode,
  toggleLevelUpNotifications,
  getVIPPrivileges,
  getVIPLevelProgress,
  type VIPProfile,
  type VIPSettings,
  type VIPScoreComponents,
} from "@/services/vipService";
import VIPBadge from "@/components/VIPBadge";
import VIPProgress from "@/components/VIPProgress";
import VIPPrivilegesList from "@/components/VIPPrivilegesList";

export default function VIPSettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<VIPProfile | null>(null);
  const [settings, setSettings] = useState<VIPSettings | null>(null);
  const [scoreComponents, setScoreComponents] = useState<VIPScoreComponents | null>(null);

  useEffect(() => {
    initializeUser();
  }, []);

  const initializeUser = async () => {
    try {
      // TODO: Get current user ID from auth
      // const currentUserId = await getCurrentUserId();
      // setUserId(currentUserId);
      // await loadVIPData(currentUserId);
      
      // For now, just set loading to false
      setLoading(false);
    } catch (error) {
      console.error('Error initializing user:', error);
      setLoading(false);
    }
  };

  const loadVIPData = async (uid: string) => {
    if (!uid) return;

    try {
      setLoading(true);
      const [profileData, settingsData, scoreData] = await Promise.all([
        getVIPProfile(uid),
        getVIPSettings(uid),
        getVIPScoreComponents(uid),
      ]);

      setProfile(profileData);
      setSettings(settingsData);
      setScoreComponents(scoreData);
    } catch (error) {
      console.error('Error loading VIP data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBadgeVisibility = async (value: boolean) => {
    if (!userId) return;

    try {
      await updateVIPBadgeVisibility(userId, value);
      setSettings(prev => prev ? { ...prev, showBadgeToCreators: value } : null);
    } catch (error) {
      console.error('Error updating badge visibility:', error);
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    if (!userId) return;

    try {
      await toggleLevelUpNotifications(userId, value);
      setSettings(prev => prev ? { ...prev, notifyOnLevelUp: value } : null);
    } catch (error) {
      console.error('Error updating notifications:', error);
    }
  };

  const handlePrivacyModeChange = async (mode: 'none' | 'creators' | 'everyone') => {
    if (!userId) return;

    try {
      await updateVIPPrivacyMode(userId, mode);
      setSettings(prev => prev ? { ...prev, privacyMode: mode } : null);
    } catch (error) {
      console.error('Error updating privacy mode:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#9B59B6" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No VIP Status Yet</Text>
          <Text style={styles.emptyText}>
            Start interacting with the platform to unlock VIP privileges.
          </Text>
          <Text style={styles.emptyHint}>
            Pay for chats, calls, or meetings to build your VIP score.
          </Text>
        </View>
      </View>
    );
  }

  const privileges = getVIPPrivileges(profile.vipLevel);
  const progress = getVIPLevelProgress(profile.vipScore, profile.vipLevel);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>VIP Status</Text>
        <VIPBadge level={profile.vipLevel} size="large" />
      </View>

      {/* Progress Section */}
      <View style={styles.section}>
        <VIPProgress
          currentLevel={profile.vipLevel}
          currentScore={profile.vipScore}
          nextLevel={progress.nextLevel}
          percentage={progress.percentage}
        />
      </View>

      {/* Score Breakdown */}
      {scoreComponents && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Score Breakdown</Text>
          <View style={styles.scoreCard}>
            <ScoreItem
              label="Loyalty Score"
              value={scoreComponents.loyaltyScore}
              max={30}
              description="Chats with same person"
            />
            <ScoreItem
              label="Consistency Score"
              value={scoreComponents.consistencyScore}
              max={25}
              description="Total paid chats"
            />
            <ScoreItem
              label="Value Score"
              value={scoreComponents.valueScore}
              max={30}
              description="Calls and meetings"
            />
            <ScoreItem
              label="Frequency Score"
              value={scoreComponents.frequencyScore}
              max={15}
              description="Token purchases"
            />
          </View>
        </View>
      )}

      {/* Privileges Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Privileges</Text>
        <VIPPrivilegesList privileges={privileges} currentLevel={profile.vipLevel} />
      </View>

      {/* Settings Section */}
      {settings && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>

          {/* Badge Visibility */}
          <View style={styles.settingCard}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Show VIP Badge to Creators</Text>
              <Text style={styles.settingDescription}>
                Let creators see your VIP status
              </Text>
            </View>
            <Switch
              value={settings.showBadgeToCreators}
              onValueChange={handleToggleBadgeVisibility}
              trackColor={{ false: '#2C2C2E', true: '#9B59B6' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Privacy Mode */}
          <View style={styles.settingCard}>
            <Text style={styles.settingLabel}>Badge Visibility</Text>
            <View style={styles.privacyOptions}>
              <TouchableOpacity
                style={[
                  styles.privacyOption,
                  settings.privacyMode === 'none' && styles.privacyOptionActive,
                ]}
                onPress={() => handlePrivacyModeChange('none')}
              >
                <Text
                  style={[
                    styles.privacyOptionText,
                    settings.privacyMode === 'none' && styles.privacyOptionTextActive,
                  ]}
                >
                  Hidden
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.privacyOption,
                  settings.privacyMode === 'creators' && styles.privacyOptionActive,
                ]}
                onPress={() => handlePrivacyModeChange('creators')}
              >
                <Text
                  style={[
                    styles.privacyOptionText,
                    settings.privacyMode === 'creators' && styles.privacyOptionTextActive,
                  ]}
                >
                  Creators Only
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.privacyOption,
                  settings.privacyMode === 'everyone' && styles.privacyOptionActive,
                ]}
                onPress={() => handlePrivacyModeChange('everyone')}
              >
                <Text
                  style={[
                    styles.privacyOptionText,
                    settings.privacyMode === 'everyone' && styles.privacyOptionTextActive,
                  ]}
                >
                  Everyone
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Notifications */}
          <View style={styles.settingCard}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Level-Up Notifications</Text>
              <Text style={styles.settingDescription}>
                Get notified when you reach a new VIP level
              </Text>
            </View>
            <Switch
              value={settings.notifyOnLevelUp}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: '#2C2C2E', true: '#9B59B6' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      )}

      {/* Info Section */}
      <View style={styles.section}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>About VIP Program</Text>
          <Text style={styles.infoText}>
            The VIP Repeat Payer Program rewards loyal users with emotional and social
            privileges. Your VIP status is earned through:
          </Text>
          <View style={styles.infoList}>
            <Text style={styles.infoItem}>• Paid chats with creators</Text>
            <Text style={styles.infoItem}>• Voice and video calls</Text>
            <Text style={styles.infoItem}>• Calendar bookings and meetings</Text>
            <Text style={styles.infoItem}>• Regular token purchases</Text>
          </View>
          <Text style={styles.infoNote}>
            Note: VIP status gives you priority and recognition, but never free tokens
            or discounts.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

// Score Item Component
interface ScoreItemProps {
  label: string;
  value: number;
  max: number;
  description: string;
}

const ScoreItem: React.FC<ScoreItemProps> = ({ label, value, max, description }) => {
  const percentage = (value / max) * 100;

  return (
    <View style={styles.scoreItem}>
      <View style={styles.scoreHeader}>
        <Text style={styles.scoreLabel}>{label}</Text>
        <Text style={styles.scoreValue}>
          {value}/{max}
        </Text>
      </View>
      <View style={styles.scoreBar}>
        <View style={[styles.scoreBarFill, { width: `${percentage}%` }]} />
      </View>
      <Text style={styles.scoreDescription}>{description}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  section: {
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  scoreCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 20,
    gap: 20,
  },
  scoreItem: {
    gap: 8,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scoreValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9B59B6',
  },
  scoreBar: {
    height: 6,
    backgroundColor: '#2C2C2E',
    borderRadius: 3,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    backgroundColor: '#9B59B6',
    borderRadius: 3,
  },
  scoreDescription: {
    fontSize: 12,
    color: '#666666',
  },
  settingCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#999999',
  },
  privacyOptions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  privacyOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
  },
  privacyOptionActive: {
    backgroundColor: '#9B59B6',
  },
  privacyOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999999',
  },
  privacyOptionTextActive: {
    color: '#FFFFFF',
  },
  infoCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  infoText: {
    fontSize: 14,
    color: '#CCCCCC',
    lineHeight: 20,
  },
  infoList: {
    gap: 8,
    paddingLeft: 8,
  },
  infoItem: {
    fontSize: 14,
    color: '#CCCCCC',
    lineHeight: 20,
  },
  infoNote: {
    fontSize: 12,
    color: '#666666',
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#999999',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
});
