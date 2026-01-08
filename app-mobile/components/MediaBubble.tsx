/**
 * MediaBubble Component - PACK 42
 * Displays media messages with lock/unlock state
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { ChatMessage } from '../types/chat';
import { spendTokensForMessage } from '../services/tokenService';

interface MediaBubbleProps {
  message: ChatMessage;
  isSent: boolean;
  currentUserId: string;
  onUnlock: (messageId: string) => Promise<void>;
  tokenBalance: number;
}

export const MediaBubble: React.FC<MediaBubbleProps> = ({
  message,
  isSent,
  currentUserId,
  onUnlock,
  tokenBalance,
}) => {
  const { t } = useTranslation();
  const [unlocking, setUnlocking] = useState(false);
  
  // Check if media is unlocked for current user
  const isUnlocked = message.unlockedBy?.includes(currentUserId) ?? false;
  const isLocked = message.payToUnlock && !isUnlocked;
  
  // Get media type icon
  const getMediaIcon = () => {
    switch (message.mediaType) {
      case 'photo':
        return '📷';
      case 'audio':
        return '🎵';
      case 'video':
        return '🎬';
      default:
        return '📎';
    }
  };
  
  const handleUnlock = async () => {
    if (!message.unlockPriceTokens) return;
    
    // Check balance
    if (tokenBalance < message.unlockPriceTokens) {
      Alert.alert(
        t('tokens.insufficientTokens'),
        t('ppm.confirmUnlockMessage', { tokens: message.unlockPriceTokens })
      );
      return;
    }
    
    // Confirm unlock
    Alert.alert(
      t('ppm.confirmUnlock'),
      t('ppm.confirmUnlockMessage', { tokens: message.unlockPriceTokens }),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('ppm.unlockFor', { tokens: message.unlockPriceTokens }),
          onPress: async () => {
            setUnlocking(true);
            try {
              await onUnlock(message.id);
            } catch (error) {
              console.error('Error unlocking media:', error);
              Alert.alert(t('common.error'), t('ppm.unlockFailed'));
            } finally {
              setUnlocking(false);
            }
          },
        },
      ]
    );
  };
  
  // Sender view - always shows preview
  if (isSent) {
    return (
      <View style={[styles.container, styles.sentContainer]}>
        <View style={[styles.bubble, styles.sentBubble]}>
          <View style={styles.mediaPreview}>
            <Text style={styles.mediaIcon}>{getMediaIcon()}</Text>
            <Text style={styles.sentText}>{t('ppm.paidMedia')}</Text>
          </View>
          {message.unlockPriceTokens && (
            <Text style={styles.priceTag}>
              {message.unlockPriceTokens} 💰
            </Text>
          )}
        </View>
      </View>
    );
  }
  
  // Receiver view - locked state
  if (isLocked) {
    return (
      <View style={[styles.container, styles.receivedContainer]}>
        <TouchableOpacity
          style={[styles.bubble, styles.lockedBubble]}
          onPress={handleUnlock}
          disabled={unlocking}
        >
          <View style={styles.lockedContent}>
            <View style={styles.blurredPreview}>
              <Text style={styles.lockIcon}>🔒</Text>
              <Text style={styles.mediaIcon}>{getMediaIcon()}</Text>
            </View>
            {unlocking ? (
              <ActivityIndicator color="#FF6B6B" size="small" />
            ) : (
              <>
                <Text style={styles.lockedText}>{t('ppm.locked')}</Text>
                <View style={styles.unlockButton}>
                  <Text style={styles.unlockButtonText}>
                    {t('ppm.unlockFor')} {message.unlockPriceTokens} 💰
                  </Text>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  }
  
  // Receiver view - unlocked state
  return (
    <View style={[styles.container, styles.receivedContainer]}>
      <View style={[styles.bubble, styles.receivedBubble]}>
        <View style={styles.unlockedContent}>
          <Text style={styles.mediaIcon}>{getMediaIcon()}</Text>
          <Text style={styles.unlockedText}>{t('ppm.unlocked')}</Text>
          {message.mediaUri && (
            <Text style={styles.mediaPath} numberOfLines={1}>
              {message.mediaUri}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    width: '100%',
  },
  sentContainer: {
    alignItems: 'flex-end',
  },
  receivedContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    minWidth: 180,
  },
  sentBubble: {
    backgroundColor: '#FF6B6B',
    borderBottomRightRadius: 4,
  },
  receivedBubble: {
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  lockedBubble: {
    backgroundColor: '#f8f8f8',
    borderWidth: 2,
    borderColor: '#FFD700',
    borderStyle: 'dashed',
  },
  mediaPreview: {
    alignItems: 'center',
    gap: 8,
  },
  mediaIcon: {
    fontSize: 40,
  },
  sentText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  priceTag: {
    marginTop: 8,
    fontSize: 12,
    color: '#fff',
    textAlign: 'center',
    opacity: 0.9,
  },
  lockedContent: {
    alignItems: 'center',
    gap: 12,
  },
  blurredPreview: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.4,
  },
  lockIcon: {
    position: 'absolute',
    fontSize: 24,
    zIndex: 1,
  },
  lockedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  unlockButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  unlockButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  unlockedContent: {
    alignItems: 'center',
    gap: 8,
  },
  unlockedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  mediaPath: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
});
