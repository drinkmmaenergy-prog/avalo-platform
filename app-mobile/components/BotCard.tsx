/**
 * BotCard Component
 * Instagram-style card for displaying AI bot in feed/grid
 * Supports dark mode and aggressive monetization CTAs
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { AIBot } from '../services/aiBotService';
import { formatTokens } from '../config/aiMonetization';

interface BotCardProps {
  bot: AIBot;
  onPress: () => void;
  showStats?: boolean;
  creatorView?: boolean;
}

export function BotCard({ bot, onPress, showStats = false, creatorView = false }: BotCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <TouchableOpacity
      style={[styles.card, isDark && styles.cardDark]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Avatar with online status */}
      <View style={styles.avatarContainer}>
        <Image
          source={{ uri: bot.avatarUrl || 'https://via.placeholder.com/120' }}
          style={styles.avatar}
        />
        {!bot.isPaused && <View style={styles.onlineIndicator} />}
      </View>

      {/* Bot Info */}
      <View style={styles.info}>
        <Text style={[styles.name, isDark && styles.textDark]} numberOfLines={1}>
          {bot.name}
        </Text>
        <Text style={[styles.age, isDark && styles.textSecondaryDark]}>
          {bot.age} • {bot.gender}
        </Text>
        <Text style={[styles.bio, isDark && styles.textSecondaryDark]} numberOfLines={2}>
          {bot.personality.substring(0, 80)}...
        </Text>

        {/* Pricing Badge */}
        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>
            {bot.pricing.perMessage} token{bot.pricing.perMessage > 1 ? 's' : ''}/msg
          </Text>
        </View>

        {/* Stats for creator view */}
        {creatorView && showStats && (
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, isDark && styles.textDark]}>
                {formatTokens(bot.stats.totalEarnings)}
              </Text>
              <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>
                Earnings
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, isDark && styles.textDark]}>
                {bot.stats.uniqueChats}
              </Text>
              <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>
                Chats
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, isDark && styles.textDark]}>
                {bot.stats.returningUsers > 0
                  ? Math.round((bot.stats.returningUsers / bot.stats.uniqueChats) * 100)
                  : 0}%
              </Text>
              <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>
                Return
              </Text>
            </View>
          </View>
        )}

        {/* NSFW Badge */}
        {bot.nsfwEnabled && (
          <View style={styles.nsfwBadge}>
            <Text style={styles.nsfwText}>18+</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardDark: {
    backgroundColor: '#1C1C1E',
    shadowColor: '#000',
    shadowOpacity: 0.3,
  },
  avatarContainer: {
    position: 'relative',
    alignSelf: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#007AFF',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#34C759',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  info: {
    gap: 4,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
  },
  age: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  bio: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
    marginTop: 8,
  },
  priceBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'center',
    marginTop: 8,
  },
  priceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  nsfwBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  nsfwText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  textDark: {
    color: '#FFFFFF',
  },
  textSecondaryDark: {
    color: '#8E8E93',
  },
});

export default BotCard;
