/**
 * PACK 215: Audience Import for Creators
 * 
 * Allows creators (women earners) to import their audience from:
 * - Instagram
 * - TikTok
 * - Telegram
 * - Snapchat
 * 
 * Rewards based on follower count:
 * - 5 followers: 24h discovery spotlight
 * - 10 followers: 1 week priority to spenders from region
 * - 25 followers: "ATTRACTION MAGNET" badge
 * - 100+ followers: early access to premium features
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

interface AudienceImport {
  id: string;
  platform: string;
  follower_count: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: any;
}

type Platform = 'instagram' | 'tiktok' | 'telegram' | 'snapchat';

interface PlatformInfo {
  name: string;
  icon: string;
  color: string;
  minFollowers: number;
  instructions: string;
}

const PLATFORMS: Record<Platform, PlatformInfo> = {
  instagram: {
    name: 'Instagram',
    icon: 'logo-instagram',
    color: '#E4405F',
    minFollowers: 100,
    instructions: 'Share your Instagram profile with at least 100 followers to unlock rewards',
  },
  tiktok: {
    name: 'TikTok',
    icon: 'musical-notes',
    color: '#000',
    minFollowers: 100,
    instructions: 'Import your TikTok following to boost your discovery',
  },
  telegram: {
    name: 'Telegram',
    icon: 'paper-plane',
    color: '#0088cc',
    minFollowers: 50,
    instructions: 'Connect your Telegram channel or group',
  },
  snapchat: {
    name: 'Snapchat',
    icon: 'logo-snapchat',
    color: '#FFFC00',
    minFollowers: 100,
    instructions: 'Link your Snapchat to bring your audience to Avalo',
  },
};

export default function AudienceImportScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [isCreator, setIsCreator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [imports, setImports] = useState<AudienceImport[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [followerCount, setFollowerCount] = useState('');
  const [profileUrl, setProfileUrl] = useState('');

  useEffect(() => {
    checkCreatorStatus();
    loadImports();
  }, [user]);

  const checkCreatorStatus = async () => {
    if (!user?.uid) return;

    try {
      const userDoc = await getDocs(
        query(collection(db, 'users'), where('uid', '==', user.uid))
      );

      if (!userDoc.empty) {
        const userData = userDoc.docs[0].data();
        setIsCreator(userData.earningsEnabled === true);
      }
    } catch (error) {
      console.error('Error checking creator status:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadImports = () => {
    if (!user?.uid) return;

    const importsQuery = query(
      collection(db, 'audience_imports'),
      where('creator_id', '==', user.uid),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(importsQuery, (snapshot) => {
      const importsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AudienceImport[];

      setImports(importsList);
    });

    return unsubscribe;
  };

  const handleImport = async () => {
    if (!selectedPlatform || !followerCount || !user?.uid) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const count = parseInt(followerCount);
    const platformInfo = PLATFORMS[selectedPlatform];

    if (count < platformInfo.minFollowers) {
      Alert.alert(
        'Minimum Not Met',
        `You need at least ${platformInfo.minFollowers} followers on ${platformInfo.name}`
      );
      return;
    }

    setProcessing(true);

    try {
      const processAudienceImport = httpsCallable(functions, 'processAudienceImport');
      
      const result = await processAudienceImport({
        platform: selectedPlatform,
        followerCount: count,
        profileUrl: profileUrl || null,
      });

      Alert.alert(
        'Success!',
        'Your audience import is being processed. You\'ll receive rewards shortly!',
        [
          {
            text: 'OK',
            onPress: () => {
              setSelectedPlatform(null);
              setFollowerCount('');
              setProfileUrl('');
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error importing audience:', error);
      Alert.alert('Error', error.message || 'Failed to import audience');
    } finally {
      setProcessing(false);
    }
  };

  const getRewardTier = (count: number) => {
    if (count >= 100) return { tier: 'Platinum', reward: '🏆 Early Premium Access' };
    if (count >= 25) return { tier: 'Gold', reward: '🧲 Attraction Magnet Badge' };
    if (count >= 10) return { tier: 'Silver', reward: '🎯 1 Week Priority Matching' };
    if (count >= 5) return { tier: 'Bronze', reward: '✨ 24h Discovery Spotlight' };
    return null;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  if (!isCreator) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Audience Import' }} />
        <View style={styles.notCreatorContainer}>
          <Text style={styles.notCreatorIcon}>🚫</Text>
          <Text style={styles.notCreatorTitle}>Creators Only</Text>
          <Text style={styles.notCreatorText}>
            This feature is available only for creators with earnings enabled.
          </Text>
          <TouchableOpacity
            style={styles.enableButton}
            onPress={() => router.push('/creator/dashboard' as any)}
          >
            <Text style={styles.enableButtonText}>Enable Earnings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Import Your Audience' }} />
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🌟 Bring Your Fans</Text>
          <Text style={styles.headerSubtitle}>
            Import your social media following and unlock exclusive rewards
          </Text>
        </View>

        {/* Rewards Preview */}
        <View style={styles.rewardsSection}>
          <Text style={styles.sectionTitle}>💎 Rewards</Text>
          
          <View style={styles.rewardTier}>
            <Text style={styles.rewardCount}>5+ followers</Text>
            <Text style={styles.rewardBenefit}>✨ 24h Discovery Spotlight</Text>
          </View>

          <View style={styles.rewardTier}>
            <Text style={styles.rewardCount}>10+ followers</Text>
            <Text style={styles.rewardBenefit}>🎯 1 Week Priority Matching</Text>
          </View>

          <View style={styles.rewardTier}>
            <Text style={styles.rewardCount}>25+ followers</Text>
            <Text style={styles.rewardBenefit}>🧲 Attraction Magnet Badge</Text>
          </View>

          <View style={styles.rewardTier}>
            <Text style={styles.rewardCount}>100+ followers</Text>
            <Text style={styles.rewardBenefit}>🏆 Early Premium Access</Text>
          </View>
        </View>

        {/* Platform Selection */}
        {!selectedPlatform ? (
          <View style={styles.platformSection}>
            <Text style={styles.sectionTitle}>Choose Platform</Text>
            
            {(Object.keys(PLATFORMS) as Platform[]).map((platform) => {
              const info = PLATFORMS[platform];
              const hasImported = imports.some(
                imp => imp.platform === platform && imp.status === 'completed'
              );

              return (
                <TouchableOpacity
                  key={platform}
                  style={[
                    styles.platformCard,
                    { borderColor: info.color },
                    hasImported && styles.importedCard,
                  ]}
                  onPress={() => !hasImported && setSelectedPlatform(platform)}
                  disabled={hasImported}
                >
                  <View style={styles.platformLeft}>
                    <View style={[styles.platformIcon, { backgroundColor: info.color }]}>
                      <Ionicons name={info.icon as any} size={24} color="#fff" />
                    </View>
                    <View style={styles.platformInfo}>
                      <Text style={styles.platformName}>{info.name}</Text>
                      <Text style={styles.platformMin}>
                        Min. {info.minFollowers} followers
                      </Text>
                    </View>
                  </View>
                  {hasImported && (
                    <View style={styles.importedBadge}>
                      <Text style={styles.importedText}>Imported</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.importForm}>
            <View style={styles.formHeader}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setSelectedPlatform(null)}
              >
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.formTitle}>
                {PLATFORMS[selectedPlatform].name}
              </Text>
            </View>

            <Text style={styles.instructionsText}>
              {PLATFORMS[selectedPlatform].instructions}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Follower Count *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your follower count"
                placeholderTextColor="#666"
                keyboardType="number-pad"
                value={followerCount}
                onChangeText={setFollowerCount}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Profile URL (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="https://..."
                placeholderTextColor="#666"
                keyboardType="url"
                autoCapitalize="none"
                value={profileUrl}
                onChangeText={setProfileUrl}
              />
            </View>

            {followerCount && parseInt(followerCount) >= PLATFORMS[selectedPlatform].minFollowers && (
              <View style={styles.rewardPreview}>
                <Text style={styles.rewardPreviewTitle}>Your Reward:</Text>
                <Text style={styles.rewardPreviewText}>
                  {getRewardTier(parseInt(followerCount))?.reward}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.importButton, processing && styles.importButtonDisabled]}
              onPress={handleImport}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={20} color="#fff" />
                  <Text style={styles.importButtonText}>Import Audience</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              By importing, you confirm you have permission to share this information
            </Text>
          </View>
        )}

        {/* Import History */}
        {imports.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Import History</Text>
            
            {imports.map((imp) => (
              <View key={imp.id} style={styles.historyCard}>
                <View style={styles.historyLeft}>
                  <Text style={styles.historyPlatform}>
                    {PLATFORMS[imp.platform as Platform].name}
                  </Text>
                  <Text style={styles.historyCount}>
                    {imp.follower_count} followers
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  imp.status === 'completed' && styles.statusCompleted,
                  imp.status === 'processing' && styles.statusProcessing,
                  imp.status === 'failed' && styles.statusFailed,
                ]}>
                  <Text style={styles.statusText}>
                    {imp.status.charAt(0).toUpperCase() + imp.status.slice(1)}
                  </Text>
                </View>
              </View>
            ))}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  notCreatorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  notCreatorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  notCreatorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  notCreatorText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  enableButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  enableButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#888',
    lineHeight: 22,
  },
  rewardsSection: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  rewardTier: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  rewardCount: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  rewardBenefit: {
    fontSize: 14,
    color: '#4ECDC4',
  },
  platformSection: {
    marginBottom: 24,
  },
  platformCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 2,
  },
  importedCard: {
    opacity: 0.5,
  },
  platformLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  platformIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  platformInfo: {
    flex: 1,
  },
  platformName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  platformMin: {
    fontSize: 12,
    color: '#888',
  },
  importedBadge: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  importedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  importForm: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  instructionsText: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  rewardPreview: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  rewardPreviewTitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  rewardPreviewText: {
    fontSize: 18,
    color: '#4ECDC4',
    fontWeight: 'bold',
  },
  importButton: {
    flexDirection: 'row',
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  importButtonDisabled: {
    opacity: 0.5,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disclaimer: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  historySection: {
    marginBottom: 24,
  },
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  historyLeft: {
    flex: 1,
  },
  historyPlatform: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  historyCount: {
    fontSize: 14,
    color: '#888',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusCompleted: {
    backgroundColor: '#4ECDC4',
  },
  statusProcessing: {
    backgroundColor: '#FFA07A',
  },
  statusFailed: {
    backgroundColor: '#FF6B6B',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
