/**
 * PACK 239: Micro-Game Settings
 * Allow users to control micro-game preferences
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from "@/lib/firebase";
import { MicroGameSettings } from "@/types/microGames";

// ============================================================================
// COMPONENT PROPS
// ============================================================================

interface MicroGameSettingsProps {
  userId: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MicroGameSettingsScreen({ userId }: MicroGameSettingsProps) {
  const [settings, setSettings] = useState<MicroGameSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ============================================================================
  // LOAD SETTINGS
  // ============================================================================

  useEffect(() => {
    loadSettings();
  }, [userId]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const settingsDoc = await getDoc(
        doc(db, 'users', userId, 'settings', 'microGames')
      );

      if (settingsDoc.exists()) {
        setSettings(settingsDoc.data() as MicroGameSettings);
      } else {
        // Default settings
        const defaultSettings: MicroGameSettings = {
          enabled: true,
          allowedGames: ['twoTruthsOneLie', 'truthOrDare'],
          autoAccept: false,
          notificationsEnabled: true,
          updatedAt: serverTimestamp() as any,
        };
        setSettings(defaultSettings);
      }
    } catch (error) {
      console.error('Error loading micro-game settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // SAVE SETTINGS
  // ============================================================================

  const saveSettings = async (updates: Partial<MicroGameSettings>) => {
    if (!settings) return;

    try {
      setIsSaving(true);
      const newSettings = {
        ...settings,
        ...updates,
        updatedAt: serverTimestamp(),
      };

      await setDoc(
        doc(db, 'users', userId, 'settings', 'microGames'),
        newSettings
      );

      setSettings(newSettings as MicroGameSettings);
    } catch (error) {
      console.error('Error saving micro-game settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleToggleEnabled = async (value: boolean) => {
    if (!value) {
      // Confirm before disabling
      Alert.alert(
        'Disable Micro-Games?',
        'You won\'t be able to play or receive micro-game invites.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: () => saveSettings({ enabled: value }),
          },
        ]
      );
    } else {
      await saveSettings({ enabled: value });
    }
  };

  const handleToggleAutoAccept = async (value: boolean) => {
    await saveSettings({ autoAccept: value });
  };

  const handleToggleNotifications = async (value: boolean) => {
    await saveSettings({ notificationsEnabled: value });
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load settings</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadSettings}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Micro-Game Settings</Text>
        <Text style={styles.headerSubtitle}>
          Control how you interact with mini-games in chat
        </Text>
      </View>

      {/* Main Settings */}
      <View style={styles.section}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Enable Micro-Games</Text>
            <Text style={styles.settingDescription}>
              Allow micro-games like "Two Truths & One Lie" and "Truth or Dare" in your chats
            </Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={handleToggleEnabled}
            trackColor={{ false: '#ddd', true: '#FF6B6B' }}
            thumbColor="#fff"
            disabled={isSaving}
          />
        </View>

        {settings.enabled && (
          <>
            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Auto-Accept Invites</Text>
                <Text style={styles.settingDescription}>
                  Automatically accept game invites from matches
                </Text>
              </View>
              <Switch
                value={settings.autoAccept}
                onValueChange={handleToggleAutoAccept}
                trackColor={{ false: '#ddd', true: '#FF6B6B' }}
                thumbColor="#fff"
                disabled={isSaving}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Game Notifications</Text>
                <Text style={styles.settingDescription}>
                  Get notified when someone wants to play a game
                </Text>
              </View>
              <Switch
                value={settings.notificationsEnabled}
                onValueChange={handleToggleNotifications}
                trackColor={{ false: '#ddd', true: '#FF6B6B' }}
                thumbColor="#fff"
                disabled={isSaving}
              />
            </View>
          </>
        )}
      </View>

      {/* Information Section */}
      <View style={styles.infoSection}>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>🎮</Text>
          <Text style={styles.infoTitle}>What are Micro-Games?</Text>
          <Text style={styles.infoText}>
            Fun mini-games you can play inside chat to break the ice, build chemistry, 
            and create memorable moments with your matches.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>✨</Text>
          <Text style={styles.infoTitle}>Spark Themes</Text>
          <Text style={styles.infoText}>
            When you and your match have great chemistry, unlock special chat themes 
            that last 24 hours! Purely cosmetic, no gameplay advantages.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>🔥</Text>
          <Text style={styles.infoTitle}>Truth or Dare — Premium</Text>
          <Text style={styles.infoText}>
            High-chemistry game unlocked at 400+ paid words, 2+ chemistry boosters, and tier 5+ chemistry.
            Escalates flirting through romantic prompts — App Store compliant!
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>🔒</Text>
          <Text style={styles.infoTitle}>Safety First</Text>
          <Text style={styles.infoText}>
            Micro-games are automatically disabled during Sleep Mode, Breakup Recovery,
            or if any safety flags are active.
          </Text>
        </View>
      </View>

      {/* Blocked Chats Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Per-Chat Controls</Text>
        <Text style={styles.sectionDescription}>
          You can also block micro-games from specific matches using the chat menu. 
          This won't affect your global settings.
        </Text>
      </View>

      {/* Save Indicator */}
      {isSaving && (
        <View style={styles.savingIndicator}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.savingText}>Saving...</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ============================================================================
// CHAT-SPECIFIC BLOCK COMPONENT
// ============================================================================

interface ChatMicroGameBlockProps {
  userId: string;
  chatId: string;
  onBlock: () => void;
  onUnblock: () => void;
}

export function ChatMicroGameBlock({
  userId,
  chatId,
  onBlock,
  onUnblock,
}: ChatMicroGameBlockProps) {
  const [isBlocked, setIsBlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkBlockStatus();
  }, [userId, chatId]);

  const checkBlockStatus = async () => {
    try {
      const blockDoc = await getDoc(
        doc(db, 'chats', chatId, 'microGameBlock', userId)
      );
      setIsBlocked(blockDoc.exists() && blockDoc.data()?.blocked === true);
    } catch (error) {
      console.error('Error checking block status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleBlock = async () => {
    try {
      if (isBlocked) {
        // Unblock
        await setDoc(doc(db, 'chats', chatId, 'microGameBlock', userId), {
          userId,
          chatId,
          blocked: false,
          updatedAt: serverTimestamp(),
        });
        setIsBlocked(false);
        onUnblock();
      } else {
        // Block
        Alert.alert(
          'Block Micro-Games?',
          'Micro-games will be disabled in this chat only.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Block',
              style: 'destructive',
              onPress: async () => {
                await setDoc(doc(db, 'chats', chatId, 'microGameBlock', userId), {
                  userId,
                  chatId,
                  blocked: true,
                  createdAt: serverTimestamp(),
                });
                setIsBlocked(true);
                onBlock();
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error toggling block:', error);
      Alert.alert('Error', 'Failed to update settings');
    }
  };

  if (isLoading) {
    return <ActivityIndicator size="small" color="#FF6B6B" />;
  }

  return (
    <TouchableOpacity
      style={[styles.blockButton, isBlocked && styles.blockButtonActive]}
      onPress={handleToggleBlock}
      activeOpacity={0.7}
    >
      <Text style={styles.blockIcon}>{isBlocked ? '🔒' : '🎮'}</Text>
      <Text style={[styles.blockText, isBlocked && styles.blockTextActive]}>
        {isBlocked ? 'Micro-Games Blocked' : 'Block Micro-Games'}
      </Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#FF6B6B',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#fff',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 16,
    paddingBottom: 16,
    lineHeight: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginLeft: 16,
  },
  infoSection: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  infoIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  savingIndicator: {
    position: 'absolute',
    bottom: 24,
    left: '50%',
    transform: [{ translateX: -60 }],
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    gap: 8,
  },
  savingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  blockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    gap: 8,
  },
  blockButtonActive: {
    backgroundColor: '#FFF0F0',
    borderColor: '#FF6B6B',
  },
  blockIcon: {
    fontSize: 20,
  },
  blockText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  blockTextActive: {
    color: '#FF6B6B',
  },
});
