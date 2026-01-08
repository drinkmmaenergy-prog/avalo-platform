/**
 * Fan Identity Panel Component
 * Pack 33-13: Unified Fan Identity Engine
 * 
 * Card summarizing the relationship between viewer and creator
 * Shows relationship status, stats, and motivational copy
 * Dark theme (#111), 18px radius, turquoise/gold accents
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FanIdentityRecord, RelationshipTag } from '../services/fanIdentityService';
import { useTranslation } from '../hooks/useTranslation';
import FanIdentityBadge from './FanIdentityBadge';

export interface FanIdentityPanelProps {
  fanIdentity: FanIdentityRecord | null;
  relationshipLabel: string;
  relationshipDescription: string;
  highlightText: string;
  targetName?: string; // Optional name of the target user
}

export const FanIdentityPanel: React.FC<FanIdentityPanelProps> = ({
  fanIdentity,
  relationshipLabel,
  relationshipDescription,
  highlightText,
  targetName = 'this creator',
}) => {
  const { t } = useTranslation();

  if (!fanIdentity) {
    return null;
  }

  const { relationshipTag, totalChatMessagesSent, totalLiveJoins } = fanIdentity;

  // Determine accent color based on tag
  const accentColor = getAccentColor(relationshipTag);

  return (
    <View style={[styles.card, { borderColor: accentColor }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {t('fanIdentity.panelTitle', { name: targetName })}
        </Text>
        <FanIdentityBadge tag={relationshipTag} size="small" />
      </View>

      {/* Subtitle */}
      <Text style={styles.subtitle}>
        {t('fanIdentity.panelSubtitle')}
      </Text>

      {/* Description */}
      <Text style={styles.description}>{relationshipDescription}</Text>

      {/* Stats */}
      <View style={styles.statsContainer}>
        {totalChatMessagesSent > 0 && (
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>💬</Text>
            <Text style={styles.statText}>
              {t('fanIdentity.stats.chats', { count: totalChatMessagesSent })}
            </Text>
          </View>
        )}
        {totalLiveJoins > 0 && (
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>🎥</Text>
            <Text style={styles.statText}>
              {t('fanIdentity.stats.lives', { count: totalLiveJoins })}
            </Text>
          </View>
        )}
      </View>

      {/* Highlight text */}
      {highlightText && (
        <View style={[styles.highlight, { backgroundColor: `${accentColor}15` }]}>
          <Text style={[styles.highlightText, { color: accentColor }]}>
            {highlightText}
          </Text>
        </View>
      )}
    </View>
  );
};

/**
 * Get accent color based on relationship tag
 */
function getAccentColor(tag: RelationshipTag): string {
  switch (tag) {
    case 'NEW':
      return '#555555';
    case 'WARMING_UP':
      return '#40E0D0';
    case 'LOYAL':
      return '#40E0D0';
    case 'VIP_FAN':
      return '#D4AF37';
    case 'ROYAL_FAN':
      return '#FFD700';
    default:
      return '#40E0D0';
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111111',
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 8,
  },
  subtitle: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: '#CCCCCC',
    lineHeight: 20,
    marginBottom: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statIcon: {
    fontSize: 16,
  },
  statText: {
    fontSize: 13,
    color: '#BBBBBB',
  },
  highlight: {
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  highlightText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
});

export default FanIdentityPanel;
