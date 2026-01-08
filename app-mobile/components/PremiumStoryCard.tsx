/**
 * Premium Story Card Component
 * Displays premium story with blur overlay and lock indicator
 */

import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { formatCountdown } from '../hooks/usePremiumStories';
import type { PremiumStoryFeedItem } from '../types/premiumStories';

interface PremiumStoryCardProps {
  story: PremiumStoryFeedItem;
  onPress: () => void;
  onUnlock: () => void;
}

export default function PremiumStoryCard({ story, onPress, onUnlock }: PremiumStoryCardProps) {
  const { unlockStatus, priceTokens, author } = story;
  const isLocked = !unlockStatus.hasAccess;

  return (
    <Pressable onPress={isLocked ? onUnlock : onPress} style={styles.container}>
      {/* Thumbnail */}
      <View style={styles.imageContainer}>
        <Image source={{ uri: story.thumbnailUrl }} style={styles.thumbnail} />
        
        {/* Blur overlay for locked stories */}
        {isLocked && (
          <View style={styles.blurOverlay}>
            <View style={styles.lockContainer}>
              <Text style={styles.lockIcon}>🔒</Text>
              <Text style={styles.lockText}>Locked</Text>
              <Text style={styles.priceText}>{priceTokens} tokens</Text>
              <View style={styles.unlockButton}>
                <Text style={styles.unlockButtonText}>
                  Unlock for {priceTokens} 🪙
                </Text>
              </View>
            </View>
          </View>
        )}
        
        {/* Countdown timer for unlocked stories */}
        {!isLocked && unlockStatus.remainingSeconds && (
          <View style={styles.timerBadge}>
            <Text style={styles.timerText}>
              ⏱️ {formatCountdown(unlockStatus.remainingSeconds)}
            </Text>
          </View>
        )}
        
        {/* Media type indicator */}
        <View style={styles.mediaTypeBadge}>
          <Text style={styles.mediaTypeText}>
            {story.mediaType === 'video' ? '▶️' : '📷'}
          </Text>
        </View>
      </View>
      
      {/* Author info */}
      <View style={styles.authorContainer}>
        {author.photoURL && (
          <Image source={{ uri: author.photoURL }} style={styles.authorAvatar} />
        )}
        <View style={styles.authorInfo}>
          <Text style={styles.authorName}>
            {author.displayName}
            {author.verified && ' ✓'}
          </Text>
          <Text style={styles.storyInfo}>
            {story.unlockCount} unlocks · {story.viewCount} views
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 9 / 16,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(10px)',
  },
  lockContainer: {
    alignItems: 'center',
    padding: 20,
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  lockText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  priceText: {
    fontSize: 16,
    color: '#cccccc',
    marginBottom: 16,
  },
  unlockButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  unlockButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  timerBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  timerText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  mediaTypeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  mediaTypeText: {
    fontSize: 16,
  },
  authorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  authorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  storyInfo: {
    fontSize: 12,
    color: '#999999',
  },
});
