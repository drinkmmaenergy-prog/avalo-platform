/**
 * PACK 310 — AI Companions & Avatar Builder
 * Creator UI: Manage AI Avatars
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from "@/lib/firebase";
import type { AIAvatarWithAnalytics } from "@/types/aiCompanion";

export default function ManageAIAvatars() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [avatars, setAvatars] = useState<AIAvatarWithAnalytics[]>([]);

  useEffect(() => {
    loadAvatars();
  }, []);

  const loadAvatars = async () => {
    setLoading(true);
    try {
      const getUserAvatars = httpsCallable(functions, 'getUserAIAvatars');
      const result = await getUserAvatars();
      const data = result.data as any;
      setAvatars(data.avatars || []);
    } catch (error: any) {
      console.error('Error loading avatars:', error);
      Alert.alert('Error', 'Failed to load AI avatars');
    } finally {
      setLoading(false);
    }
  };

  const toggleAvatarStatus = async (avatarId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    
    try {
      const updateAvatar = httpsCallable(functions, 'updateAIAvatar');
      await updateAvatar({
        avatarId,
        status: newStatus
      });

      // Update local state
      setAvatars(avatars.map(avatar =>
        avatar.avatarId === avatarId
          ? { ...avatar, status: newStatus as any }
          : avatar
      ));

      Alert.alert(
        'Success',
        `Avatar ${newStatus === 'ACTIVE' ? 'activated' : 'paused'}`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update avatar');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return '#00FF00';
      case 'PAUSED': return '#FFA500';
      case 'DRAFT': return '#888';
      case 'BANNED': return '#FF0000';
      default: return '#888';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'Active';
      case 'PAUSED': return 'Paused';
      case 'DRAFT': return 'Under Review';
      case 'BANNED': return 'Banned';
      default: return status;
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AI Avatars</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF10F0" />
          <Text style={styles.loadingText}>Loading avatars...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Avatars</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🤖 AI Companions</Text>
          <Text style={styles.infoText}>
            Create AI versions of yourself that can chat with users while you earn. 
            Same 65/35 split as human chats. Maximum 3 avatars per account.
          </Text>
        </View>

        {avatars.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🤖</Text>
            <Text style={styles.emptyTitle}>No AI Avatars Yet</Text>
            <Text style={styles.emptyText}>
              Create your first AI companion to engage with users 24/7
            </Text>
          </View>
        ) : (
          avatars.map(avatar => (
            <View key={avatar.avatarId} style={styles.avatarCard}>
              <View style={styles.avatarHeader}>
                <Image
                  source={{ uri: avatar.media.primaryPhotoId }}
                  style={styles.avatarImage}
                />
                <View style={styles.avatarInfo}>
                  <View style={styles.avatarTitleRow}>
                    <Text style={styles.avatarName}>{avatar.displayName}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(avatar.status) }]}>
                      <Text style={styles.statusText}>{getStatusText(avatar.status)}</Text>
                    </View>
                  </View>
                  <Text style={styles.avatarTagline} numberOfLines={2}>
                    {avatar.shortTagline}
                  </Text>
                </View>
              </View>

              {avatar.analytics && (
                <View style={styles.statsContainer}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{avatar.analytics.totalSessions}</Text>
                    <Text style={styles.statLabel}>Sessions</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{avatar.analytics.totalMessages}</Text>
                    <Text style={styles.statLabel}>Messages</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{avatar.analytics.totalEarnings}</Text>
                    <Text style={styles.statLabel}>Tokens Earned</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{avatar.analytics.activeSessions}</Text>
                    <Text style={styles.statLabel}>Active</Text>
                  </View>
                </View>
              )}

              <View style={styles.avatarActions}>
                {(avatar.status === 'ACTIVE' || avatar.status === 'PAUSED') && (
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      avatar.status === 'ACTIVE' ? styles.pauseButton : styles.activateButton
                    ]}
                    onPress={() => toggleAvatarStatus(avatar.avatarId, avatar.status)}
                  >
                    <Text style={styles.actionButtonText}>
                      {avatar.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => {
                    // Navigate to edit screen
                    Alert.alert('Edit', 'Edit avatar feature coming soon');
                  }}
                >
                  <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => {
                    // Navigate to analytics
                    Alert.alert('Analytics', 'Detailed analytics coming soon');
                  }}
                >
                  <Text style={styles.actionButtonText}>View Stats</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {avatars.length < 3 && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push('/profile/ai-avatars/create' as any)}
          >
            <Text style={styles.createButtonText}>+ Create New AI Avatar</Text>
          </TouchableOpacity>
        )}

        {avatars.length >= 3 && (
          <View style={styles.limitReached}>
            <Text style={styles.limitText}>
              You've reached the maximum of 3 AI avatars per account
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backText: {
    color: '#FF10F0',
    fontSize: 16,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 50,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFF',
    marginTop: 16,
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  infoTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  infoText: {
    color: '#CCC',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  avatarCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  avatarHeader: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 12,
  },
  avatarInfo: {
    flex: 1,
  },
  avatarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  avatarName: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  avatarTagline: {
    color: '#CCC',
    fontSize: 14,
    lineHeight: 18,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#333',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: '#FF10F0',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
  },
  avatarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#333',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  pauseButton: {
    backgroundColor: '#FFA500',
  },
  activateButton: {
    backgroundColor: '#00FF00',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: '#FF10F0',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  createButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  limitReached: {
    backgroundColor: '#333',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  limitText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
});
