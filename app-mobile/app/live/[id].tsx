/**
 * Live Room View Screen
 * Phase 4: Skeleton (no real streaming - placeholder UI + gift flow)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { TokenBadge } from '../../components/TokenBadge';
import { listGifts, sendGift } from '../../services/liveService';
import { getTokenBalance } from '../../services/tokenService';
import { Gift } from '../../config/monetization';

export default function LiveRoomScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [balance, setBalance] = useState(0);
  const [sending, setSending] = useState(false);
  const [selectedGift, setSelectedGift] = useState<string | null>(null);

  useEffect(() => {
    loadGifts();
    loadBalance();
  }, []);

  const loadGifts = () => {
    const availableGifts = listGifts();
    setGifts(availableGifts);
  };

  const loadBalance = async () => {
    if (user?.uid) {
      const userBalance = await getTokenBalance(user.uid);
      setBalance(userBalance);
    }
  };

  const handleSendGift = async (giftId: string) => {
    if (!user?.uid) {
      Alert.alert('Error', 'Please sign in to send gifts');
      return;
    }

    if (!id || typeof id !== 'string') {
      Alert.alert('Error', 'Invalid room ID');
      return;
    }

    const gift = gifts.find(g => g.id === giftId);
    if (!gift) return;

    // Check balance
    if (balance < gift.tokenCost) {
      Alert.alert(
        'Insufficient Balance',
        `You need ${gift.tokenCost} tokens to send this gift. You have ${balance} tokens.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Tokens', onPress: () => router.push('/(tabs)/wallet') },
        ]
      );
      return;
    }

    // Confirm gift send
    Alert.alert(
      'Send Gift?',
      `Send ${gift.displayName} for ${gift.tokenCost} tokens?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSelectedGift(giftId);
            setSending(true);
            
            const result = await sendGift(id, user.uid, giftId);
            
            setSending(false);
            setSelectedGift(null);
            
            if (result.success) {
              Alert.alert('Success', `${gift.name} sent! 🎉`);
              await loadBalance(); // Refresh balance
            } else {
              Alert.alert('Error', result.error || 'Failed to send gift');
            }
          },
        },
      ]
    );
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Please sign in to view this room</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <TokenBadge />
      </View>

      {/* Video Placeholder */}
      <View style={styles.videoPlaceholder}>
        <Text style={styles.placeholderEmoji}>📹</Text>
        <Text style={styles.placeholderText}>Live Streaming</Text>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* Host Info */}
      <View style={styles.hostInfo}>
        <Text style={styles.hostName}>Room Host</Text>
        <Text style={styles.viewerCount}>👁️ 0 viewers</Text>
      </View>

      {/* Messages Placeholder */}
      <View style={styles.messagesContainer}>
        <Text style={styles.sectionTitle}>Chat (Coming Soon)</Text>
        <View style={styles.messagesPlaceholder}>
          <Text style={styles.placeholderSubtext}>
            Message list will appear here
          </Text>
        </View>
      </View>

      {/* Gifts Panel */}
      <View style={styles.giftsPanel}>
        <Text style={styles.giftsPanelTitle}>Send a Gift</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.giftsScroll}
        >
          {gifts.map((gift) => (
            <TouchableOpacity
              key={gift.id}
              style={[
                styles.giftButton,
                selectedGift === gift.id && styles.giftButtonSending,
              ]}
              onPress={() => handleSendGift(gift.id)}
              disabled={sending}
            >
              {sending && selectedGift === gift.id ? (
                <ActivityIndicator size="small" color="#FF6B6B" />
              ) : (
                <>
                  <Text style={styles.giftIcon}>{gift.iconKey}</Text>
                  <Text style={styles.giftCost}>{gift.tokenCost}</Text>
                </>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backButton: {
    padding: 8,
  },
  backText: {
    color: '#fff',
    fontSize: 16,
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  placeholderEmoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  placeholderText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF0000',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 16,
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
    fontSize: 12,
    fontWeight: 'bold',
  },
  hostInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  hostName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  viewerCount: {
    color: '#ccc',
    fontSize: 14,
  },
  messagesContainer: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  messagesPlaceholder: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  placeholderSubtext: {
    color: '#999',
    fontSize: 12,
  },
  giftsPanel: {
    backgroundColor: 'rgba(0,0,0,0.9)',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  giftsPanelTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  giftsScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  giftButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  giftButtonSending: {
    borderColor: '#FF6B6B',
  },
  giftIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  giftCost: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
});