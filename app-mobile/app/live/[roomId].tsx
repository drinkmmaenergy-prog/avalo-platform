/**
 * Live Room Screen - Avalo Mobile
 *
 * Unified screen for both viewers and hosts
 * Shows live video placeholder (no real streaming SDK yet)
 * Handles gifts, chat, and queue management
 * Phase 19B: Integrated with sponsored overlay ads
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { getProfile } from '../../lib/profileService';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getRoomPublicInfo,
  endSession,
  sendGift,
  joinQueue,
  LIVE_GIFTS,
  LiveGift,
  LiveRoomPublicInfo,
} from '../../services/liveService';
import SponsoredOverlay from '../../components/SponsoredOverlay';
import {
  getAdForPlacement,
  registerImpression,
  registerClick,
  getUserTier,
  type AdCampaign,
  type UserTier,
  type UserProfile as AdUserProfile,
} from '../../services/sponsoredAdsService';

export default function LiveRoomScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  const roomId = params.roomId as string;
  const sessionId = params.sessionId as string;
  const isHost = params.isHost === 'true';

  const [roomInfo, setRoomInfo] = useState<LiveRoomPublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [sendingGift, setSendingGift] = useState(false);
  const [joiningQueue, setJoiningQueue] = useState(false);
  const [endingSession, setEndingSession] = useState(false);

  // Sponsored ads (Phase 19B)
  const [userTier, setUserTier] = useState<UserTier>('standard');
  const [currentAd, setCurrentAd] = useState<AdCampaign | null>(null);
  const [showAdOverlay, setShowAdOverlay] = useState(false);
  const [adImpressionTracked, setAdImpressionTracked] = useState(false);

  // Load room info and user tier
  useEffect(() => {
    const loadRoomInfo = async () => {
      try {
        const info = await getRoomPublicInfo(roomId);
        setRoomInfo(info);
        
        // Load user tier for ad frequency (only once)
        if (currentUser && !userTier) {
          const profile = await getProfile(currentUser.uid);
          if (profile) {
            const tier = getUserTier(profile.membership);
            setUserTier(tier);
          }
        }
      } catch (error) {
        console.error('Error loading room info:', error);
        Alert.alert('Error', 'Failed to load live room');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    loadRoomInfo();

    // Poll for updates every 5 seconds
    const interval = setInterval(loadRoomInfo, 5000);
    return () => clearInterval(interval);
  }, [roomId, currentUser]);

  // Periodic ad display (Phase 19B) - every ~60 seconds
  useEffect(() => {
    if (!currentUser || isHost || !roomInfo) return;

    let adTimer: NodeJS.Timeout;

    const showNextAd = async () => {
      try {
        // Only show if no ad is currently displayed
        if (showAdOverlay) return;

        // Load user profile for targeting
        const profile = await getProfile(currentUser.uid);
        if (!profile) return;

        const adUserProfile: AdUserProfile = {
          tier: userTier,
          country: undefined,
          language: 'en',
          age: profile.age,
          gender: profile.gender,
          interests: profile.interests,
        };

        // Fetch ad
        const ad = await getAdForPlacement('live', adUserProfile);
        if (ad) {
          setCurrentAd(ad);
          setShowAdOverlay(true);
          setAdImpressionTracked(false);
        }
      } catch (error) {
        console.error('Error loading live ad:', error);
      }
    };

    // Show first ad after 10 seconds, then every 60 seconds
    const initialDelay = setTimeout(showNextAd, 10000);
    const recurringTimer = setInterval(showNextAd, 60000);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(recurringTimer);
    };
  }, [currentUser, isHost, roomInfo, showAdOverlay, userTier]);

  // Handle live ad impression
  const handleLiveAdImpression = useCallback(async (campaignId: string) => {
    if (adImpressionTracked) return;
    
    try {
      await registerImpression(campaignId, 'live', userTier);
      setAdImpressionTracked(true);
    } catch (error) {
      console.error('Error registering live ad impression:', error);
    }
  }, [adImpressionTracked, userTier]);

  // Handle live ad click
  const handleLiveAdClick = useCallback(async (campaignId: string, impressionId: string) => {
    try {
      await registerClick(campaignId, impressionId);
    } catch (error) {
      console.error('Error registering live ad click:', error);
    }
  }, []);

  // Handle ad overlay dismiss
  const handleDismissAdOverlay = () => {
    setShowAdOverlay(false);
    setCurrentAd(null);
    setAdImpressionTracked(false);
  };

  const handleEndSession = async () => {
    Alert.alert(
      'End Live Session',
      'Are you sure you want to end this live stream?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: async () => {
            try {
              setEndingSession(true);
              const result = await endSession(roomId, sessionId);
              
              Alert.alert(
                'Session Ended',
                `Duration: ${Math.floor(result.durationSeconds / 60)} minutes\n` +
                `Revenue: ${result.totalRevenue} tokens\n` +
                `Your earnings: ${result.creatorEarnings} tokens`,
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to end session');
            } finally {
              setEndingSession(false);
            }
          },
        },
      ]
    );
  };

  const handleSendGift = async (gift: LiveGift) => {
    if (!currentUser) {
      Alert.alert('Not Logged In', 'Please log in to send gifts');
      return;
    }

    if (!roomInfo?.session) {
      Alert.alert('Error', 'Live session not found');
      return;
    }

    try {
      setSendingGift(true);
      await sendGift(roomId, roomInfo.session.sessionId, gift.id);
      
      Alert.alert('Gift Sent!', `You sent ${gift.name} (${gift.tokenCost} tokens)`);
      setShowGiftModal(false);
      
      // Reload room info to get updated stats
      const updatedInfo = await getRoomPublicInfo(roomId);
      setRoomInfo(updatedInfo);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send gift');
    } finally {
      setSendingGift(false);
    }
  };

  const handleJoinQueue = async () => {
    if (!currentUser) {
      Alert.alert('Not Logged In', 'Please log in to join queue');
      return;
    }

    if (!roomInfo?.session) {
      Alert.alert('Error', 'Live session not found');
      return;
    }

    try {
      setJoiningQueue(true);
      const result = await joinQueue(roomId, roomInfo.session.sessionId);
      
      Alert.alert(
        'Joined Queue!',
        `You're in position ${result.position}\n` +
        'Wait for the host to bring you on stage.'
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to join queue');
    } finally {
      setJoiningQueue(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF0050" />
      </View>
    );
  }

  if (!roomInfo) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Live room not found</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Video Placeholder */}
      <View style={styles.videoPlaceholder}>
        <Text style={styles.placeholderText}>📹</Text>
        <Text style={styles.placeholderLabel}>Live Video Placeholder</Text>
        <Text style={styles.placeholderNote}>
          Real streaming SDK integration in future phase
        </Text>

        {/* Live Indicator */}
        <View style={styles.liveOverlay}>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <Text style={styles.viewerCount}>👁️ {roomInfo.room.viewerCount}</Text>
        </View>

        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>✕</Text>
        </TouchableOpacity>
        {/* Sponsored Ad Overlay (Phase 19B) */}
        {showAdOverlay && currentAd && !isHost && (
          <View style={styles.adOverlayContainer}>
            <SponsoredOverlay
              campaignId={currentAd.campaignId}
              impressionId={`${currentAd.campaignId}_${Date.now()}`}
              brandName={currentAd.brandName}
              imageUrl={currentAd.imageUrl}
              targetUrl={currentAd.targetUrl}
              position="top-right"
              onImpression={handleLiveAdImpression}
              onClick={handleLiveAdClick}
            />
            <TouchableOpacity
              style={styles.adDismissButton}
              onPress={handleDismissAdOverlay}
            >
              <Text style={styles.adDismissText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Host Info */}
        <View style={styles.hostInfo}>
          <View style={styles.hostNameContainer}>
            <Text style={styles.hostName}>{roomInfo.host.displayName}</Text>
            {roomInfo.host.badges.royal && (
              <View style={styles.royalCrownBadge}>
                <Text style={styles.royalCrownIcon}>👑</Text>
              </View>
            )}
          </View>
          <View style={styles.hostSubInfo}>
            <Text style={styles.roomTitle}>{roomInfo.room.title || 'Live Stream'}</Text>
          </View>
          <View style={styles.badges}>
            {roomInfo.host.badges.royal && (
              <Text style={styles.badge}>👑</Text>
            )}
            {roomInfo.host.badges.vip && (
              <Text style={styles.badge}>⭐</Text>
            )}
            {roomInfo.host.badges.influencer && (
              <Text style={styles.badge}>🏅</Text>
            )}
          </View>
        </View>

        {/* Session Stats */}
        {roomInfo.session && (
          <View style={styles.stats}>
            <Text style={styles.statText}>💎 {roomInfo.session.totalGiftsTokens} tokens</Text>
            <Text style={styles.statText}>🎁 {roomInfo.session.giftsCount} gifts</Text>
            <Text style={styles.statText}>👥 {roomInfo.session.queueEntriesCount} in queue</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          {isHost ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.endButton]}
                onPress={handleEndSession}
                disabled={endingSession}
              >
                {endingSession ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.actionButtonText}>End Live</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.giftButton]}
                onPress={() => setShowGiftModal(true)}
                disabled={!roomInfo.session || roomInfo.session.status !== 'live'}
              >
                <Text style={styles.actionButtonText}>🎁 Send Gift</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.queueButton]}
                onPress={handleJoinQueue}
                disabled={joiningQueue || !roomInfo.session || roomInfo.session.status !== 'live'}
              >
                {joiningQueue ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.actionButtonText}>🎤 Join Queue (50 tokens)</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Gift Modal */}
      <Modal
        visible={showGiftModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGiftModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Send a Gift</Text>
              <TouchableOpacity onPress={() => setShowGiftModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.giftsList}>
              {LIVE_GIFTS.map((gift) => (
                <TouchableOpacity
                  key={gift.id}
                  style={[
                    styles.giftItem,
                    gift.rarity === 'legendary' && styles.giftItemLegendary,
                    gift.rarity === 'epic' && styles.giftItemEpic,
                    gift.rarity === 'rare' && styles.giftItemRare,
                  ]}
                  onPress={() => handleSendGift(gift)}
                  disabled={sendingGift}
                >
                  <Text style={styles.giftIcon}>{gift.iconEmoji}</Text>
                  <View style={styles.giftInfo}>
                    <Text style={styles.giftName}>{gift.name}</Text>
                    <Text style={styles.giftCost}>{gift.tokenCost} tokens</Text>
                  </View>
                  {gift.rarity === 'legendary' && (
                    <View style={styles.rarityBadge}>
                      <Text style={styles.rarityText}>LEGENDARY</Text>
                    </View>
                  )}
                  {gift.rarity === 'epic' && (
                    <View style={styles.rarityBadge}>
                      <Text style={styles.rarityText}>EPIC</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
  },
  videoPlaceholder: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  placeholderText: {
    fontSize: 64,
    marginBottom: 16,
  },
  placeholderLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  placeholderNote: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
  },
  liveOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF0050',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  liveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  viewerCount: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    color: '#fff',
    fontSize: 14,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 24,
  },
  adOverlayContainer: {
    position: 'absolute',
    top: 60,
    right: 16,
    zIndex: 200,
  },
  adDismissButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adDismissText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  controls: {
    backgroundColor: '#000',
    padding: 16,
  },
  hostInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  hostNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  hostName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
  royalCrownBadge: {
    backgroundColor: '#D4AF37',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  royalCrownIcon: {
    fontSize: 14,
  },
  hostSubInfo: {
    flex: 1,
  },
  roomTitle: {
    color: '#888',
    fontSize: 14,
  },
  badges: {
    flexDirection: 'row',
  },
  badge: {
    fontSize: 20,
    marginLeft: 8,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  statText: {
    color: '#fff',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  endButton: {
    backgroundColor: '#FF0050',
  },
  giftButton: {
    backgroundColor: '#8B5CF6',
  },
  queueButton: {
    backgroundColor: '#3B82F6',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalClose: {
    color: '#fff',
    fontSize: 24,
  },
  giftsList: {
    padding: 16,
  },
  giftItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#333',
  },
  giftItemRare: {
    borderColor: '#3B82F6',
  },
  giftItemEpic: {
    borderColor: '#8B5CF6',
  },
  giftItemLegendary: {
    borderColor: '#FFD700',
  },
  giftIcon: {
    fontSize: 40,
    marginRight: 16,
  },
  giftInfo: {
    flex: 1,
  },
  giftName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  giftCost: {
    color: '#FFD700',
    fontSize: 14,
  },
  rarityBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  rarityText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
});