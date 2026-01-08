/**
 * LIVE Room Screen
 * PACK 33-5: VIP Live Streaming with Token Entry Fees
 * 
 * Main LIVE streaming room with:
 * - Placeholder camera stream (no real WebRTC)
 * - Entry paywall for viewers  
 * - Earnings badge for creators
 * - Chat panel
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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useFanIdentity } from '../../hooks/useFanIdentity';
import { useTranslation } from '../../hooks/useTranslation';
import {
  getLiveSession,
  getLiveEarnings,
  checkAccess,
  joinLive,
  endLive,
  getUserTokenBalance,
  LiveSession,
  LiveEarnings,
} from '../../services/liveService';
import { LiveEntryPaywall } from '../../components/LiveEntryPaywall';
import { LiveEarningsBadge } from '../../components/LiveEarningsBadge';
import { registerFanEvent } from '../../services/fanIdentityService';
import { registerChallengeProgress } from '../../services/fanChallengeService';

export default function LiveRoomScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  
  const liveId = params.liveId as string;
  
  const [session, setSession] = useState<LiveSession | null>(null);
  const [earnings, setEarnings] = useState<LiveEarnings | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [userBalance, setUserBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [isVip, setIsVip] = useState(false); // TODO: Get from user profile
  const [lastEarning, setLastEarning] = useState(0);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ sender: string; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');

  // Pack 33-13: Fan Identity Engine
  const creatorId = session?.creatorId || null;
  const fanIdentity = useFanIdentity(!isCreator && creatorId ? creatorId : null);

  useEffect(() => {
    if (!liveId || !user) return;
    loadLiveData();
    
    // Poll for updates every 5 seconds
    const interval = setInterval(loadLiveData, 5000);
    return () => clearInterval(interval);
  }, [liveId, user]);

  const loadLiveData = async () => {
    if (!user) return;

    try {
      // Load session
      const liveSession = await getLiveSession(liveId);
      if (!liveSession) {
        Alert.alert('Error', 'LIVE session not found');
        router.back();
        return;
      }

      setSession(liveSession);
      setIsCreator(liveSession.creatorId === user.uid);

      // Check access
      const access = await checkAccess(liveId, user.uid);
      setHasAccess(access || liveSession.creatorId === user.uid);

      // Load earnings if creator
      if (liveSession.creatorId === user.uid) {
        const liveEarnings = await getLiveEarnings(liveId);
        if (liveEarnings) {
          // Detect new earnings
          if (earnings && liveEarnings.creatorShare > earnings.creatorShare) {
            setLastEarning(liveEarnings.creatorShare - earnings.creatorShare);
          }
          setEarnings(liveEarnings);
        }
      }

      // Load user balance if not creator
      if (liveSession.creatorId !== user.uid) {
        const balance = await getUserTokenBalance(user.uid);
        setUserBalance(balance);

        // Show paywall if no access and not creator
        if (!access) {
          setShowPaywall(true);
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading LIVE data:', error);
      setLoading(false);
    }
  };

  const handlePayAndJoin = async () => {
    if (!user || !session) return;

    const result = await joinLive(liveId, user.uid, isVip);
    
    if (result.success) {
      setHasAccess(true);
      setShowPaywall(false);

      // Pack 33-13: Register LIVE join event
      if (session.creatorId) {
        registerFanEvent({
          type: 'LIVE_JOINED',
          viewerId: user.uid,
          targetId: session.creatorId,
          tokensSpentApprox: session.entryFee,
        }).catch(err => console.error('Error registering LIVE join:', err));

        // Pack 33-15: Register challenge progress
        await registerChallengeProgress(session.creatorId, user.uid, 'LIVE_JOIN');
      }
      
      // Reload data to update balance and viewer count
      await loadLiveData();
      
      Alert.alert('Success', 'You\'re now watching the LIVE stream!');
    } else {
      if (result.message === 'Insufficient tokens') {
        Alert.alert('Insufficient Tokens', 'You need more tokens to join this LIVE');
      } else {
        Alert.alert('Error', result.message || 'Failed to join LIVE');
      }
    }
  };

  const handleEndStream = () => {
    Alert.alert(
      'End Stream',
      'Are you sure you want to end this LIVE stream?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Stream',
          style: 'destructive',
          onPress: async () => {
            try {
              if (user && session) {
                await endLive(liveId, user.uid);
                router.replace(`/live/summary?liveId=${liveId}` as any);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to end stream');
            }
          },
        },
      ]
    );
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    
    setChatMessages([...chatMessages, {
      sender: isCreator ? 'You (Creator)' : 'You',
      text: chatInput.trim(),
    }]);
    setChatInput('');
  };

  const handleLeave = () => {
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
        <Text style={styles.loadingText}>Loading LIVE...</Text>
      </View>
    );
  }

  if (!session || !user) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>LIVE session not found</Text>
      </View>
    );
  }

  // Show paywall if viewer hasn't paid
  if (!isCreator && !hasAccess && showPaywall) {
    return (
      <LiveEntryPaywall
        visible={showPaywall}
        entryFee={session.entryFee}
        isVip={isVip}
        userBalance={userBalance}
        onClose={handleLeave}
        onPay={handlePayAndJoin}
        creatorName={session.creatorName}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Stream View (Placeholder) */}
      <View style={styles.streamContainer}>
        {/* Placeholder camera view */}
        <View style={styles.placeholderStream}>
          <Text style={styles.placeholderIcon}>🎥</Text>
          <Text style={styles.placeholderText}>LIVE Stream</Text>
          <Text style={styles.placeholderSubtext}>
            {isCreator ? 'Your camera feed would appear here' : 'Streaming now...'}
          </Text>
        </View>

        {/* LIVE Badge */}
        <View style={styles.liveBadgeContainer}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={styles.viewerBadge}>
            <Text style={styles.viewerText}>👁️ {session.viewerCount}</Text>
          </View>
        </View>

        {/* Earnings Badge (Creator Only) */}
        {isCreator && earnings && (
          <LiveEarningsBadge
            totalEarnings={earnings.creatorShare}
            lastEntry={lastEarning}
            showAnimation={true}
          />
        )}

        {/* Top Controls */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={isCreator ? handleEndStream : handleLeave}
          activeOpacity={0.7}
        >
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Chat Panel */}
      <View style={styles.chatContainer}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatTitle}>Chat</Text>
          <Text style={styles.chatSubtitle}>{session.title}</Text>
          {/* Pack 33-13: Fan Identity Stats (subtle, single line) */}
          {!isCreator && !fanIdentity.loading && fanIdentity.fanIdentity && fanIdentity.fanIdentity.totalLiveJoins > 0 && (
            <Text style={styles.fanStatsText}>
              {t('fanIdentity.stats.lives', { count: fanIdentity.fanIdentity.totalLiveJoins })}
            </Text>
          )}
        </View>

        <ScrollView
          style={styles.chatMessages}
          contentContainerStyle={styles.chatMessagesContent}
        >
          {chatMessages.length === 0 ? (
            <Text style={styles.chatEmpty}>No messages yet. Say hi!</Text>
          ) : (
            chatMessages.map((msg, index) => (
              <View key={index} style={styles.chatMessage}>
                <Text style={styles.chatSender}>{msg.sender}</Text>
                <Text style={styles.chatText}>{msg.text}</Text>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.chatInputContainer}>
          <TextInput
            style={styles.chatInput}
            placeholder="Type a message..."
            placeholderTextColor="#666666"
            value={chatInput}
            onChangeText={setChatInput}
            onSubmitEditing={handleSendMessage}
          />
          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSendMessage}
            activeOpacity={0.7}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Creator Controls Footer */}
      {isCreator && (
        <View style={styles.creatorFooter}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{session.viewerCount}</Text>
              <Text style={styles.statLabel}>Viewers</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{earnings?.creatorShare || 0}</Text>
              <Text style={styles.statLabel}>Tokens Earned</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.endStreamButton}
            onPress={handleEndStream}
            activeOpacity={0.8}
          >
            <Text style={styles.endStreamButtonText}>End Stream</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#AAAAAA',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#AAAAAA',
    textAlign: 'center',
  },
  streamContainer: {
    height: '50%',
    backgroundColor: '#000000',
    position: 'relative',
  },
  placeholderStream: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  placeholderIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  placeholderText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: '#AAAAAA',
  },
  liveBadgeContainer: {
    position: 'absolute',
    top: 60,
    left: 16,
    flexDirection: 'row',
    gap: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF0000',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginRight: 6,
  },
  liveText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  viewerBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  viewerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  chatHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  chatSubtitle: {
    fontSize: 12,
    color: '#AAAAAA',
  },
  chatMessages: {
    flex: 1,
  },
  chatMessagesContent: {
    padding: 16,
  },
  chatEmpty: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 20,
  },
  chatMessage: {
    marginBottom: 16,
  },
  chatSender: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 4,
  },
  chatText: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  chatInputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333333',
    gap: 12,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#333333',
  },
  sendButton: {
    backgroundColor: '#40E0D0',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  creatorFooter: {
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#AAAAAA',
  },
  endStreamButton: {
    backgroundColor: '#FF4444',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  endStreamButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  fanStatsText: {
    fontSize: 11,
    color: '#40E0D0',
    marginTop: 6,
    fontStyle: 'italic',
  },
});